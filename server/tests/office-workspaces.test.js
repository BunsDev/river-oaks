import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import * as stores from '../office-workspaces.js';
const task=(extra={})=>({id:'task-1',title:'Office plan',notes:'Private shared work',links:[],result:'',status:'open',...extra});
for(const mode of ['memory','redis'])test(`${mode}: workspace provisioning, accepted membership and atomic task fences`,{skip:mode==='redis'&&!process.env.REDIS_URL},async t=>{
 const prefix=`{workspace-test-${randomUUID()}}`,redis=mode==='redis'?new Redis(process.env.REDIS_URL):null;
 t.after(async()=>{if(redis){const keys=await redis.keys(`${prefix}*`);if(keys.length)await redis.del(...keys);await redis.quit();}});
 const create=()=>mode==='memory'?stores.createMemoryOfficeWorkspaces({now:()=>100}):stores.createRedisOfficeWorkspaces({redis,prefix,now:()=>100});
 assert.equal(typeof stores.createMemoryOfficeWorkspaces,'function');
 const store=create(),other=redis?create():store;
 const [a,b,a2]=await Promise.all([store.provision('alice'),other.provision('bob'),other.provision('alice')]);
 assert.equal(a.id,a2.id);assert.notEqual(a.id,b.id);assert.equal(a.ownerId,'alice');
 assert.deepEqual((await store.list('visitor')),[]);
 assert.equal((await store.read('bob',a.id)).reason,'office_access_denied');
 assert.equal((await store.invite('bob',a.id,'visitor')).reason,'office_owner_required');
 assert.equal((await store.invite('alice',a.id,'bob')).ok,true);
 assert.equal((await store.invite('alice',a.id,'bob')).ok,true);
 assert.equal((await store.list('bob')).filter(x=>x.id===a.id).length,1);
 assert.equal((await store.read('bob',a.id)).reason,'office_access_denied');
 assert.equal((await store.accept('visitor',a.id)).reason,'office_invitation_required');
 assert.equal((await store.accept('bob',a.id)).ok,true);
 assert.equal((await store.accept('bob',a.id)).ok,true);
 const data={expectedVersion:0,operationId:'save-1',task:task()};
 const saved=await store.save('bob',a.id,data);assert.equal(saved.ok,true);assert.equal(saved.desk.version,1);assert.equal(saved.desk.tasks[0].createdAt,100);assert.equal(saved.desk.tasks[0].updatedAt,100);
 assert.equal((await other.save('bob',a.id,data)).ok,true,'lost-response retry succeeds');
 assert.equal((await store.read('alice',a.id)).desk.version,1);
 assert.equal((await store.save('bob',a.id,{...data,task:task({title:'Changed replay'})})).reason,'office_operation_conflict');
 const race=await Promise.all(['alice','bob'].map((user,i)=>other.save(user,a.id,{expectedVersion:1,operationId:`race-${i}`,task:task({result:user})})));
 assert.equal(race.filter(x=>x.ok).length,1);assert.equal(race.find(x=>!x.ok).reason,'desk_conflict');
 assert.equal((await store.revoke('bob',a.id,'alice')).reason,'office_owner_required');
 assert.equal((await store.revoke('alice',a.id,'bob')).ok,true);
 assert.equal((await other.read('bob',a.id)).reason,'office_access_denied');
 assert.equal((await other.save('bob',a.id,data)).reason,'office_access_denied','receipt cannot bypass revocation');
 assert.equal((await store.list('bob')).some(x=>x.id===a.id),false);
 assert.equal((await store.invite('alice',a.id,'bob')).ok,true);await store.accept('bob',a.id);
 assert.equal((await store.save('bob',a.id,data)).reason,'desk_conflict','old operation cannot replay after re-invitation');
 const current=await store.read('alice',a.id);assert.equal(current.desk.tasks.length,1);
 const removal={expectedVersion:current.desk.version,operationId:'remove-1',id:'task-1'};
 assert.equal((await store.remove('alice',a.id,removal)).ok,true);
 assert.equal((await other.remove('alice',a.id,removal)).ok,true);
 assert.equal((await store.save('alice',a.id,{expectedVersion:current.desk.version,operationId:'stale-save',task:task()})).reason,'desk_conflict');
 assert.deepEqual((await other.read('alice',a.id)).desk.tasks,[]);
 assert.deepEqual((await other.read('bob',b.id)).desk.tasks,[]);
});
test('workspace validation and bounded membership preserve saved records',async()=>{
 assert.equal(typeof stores.createMemoryOfficeWorkspaces,'function');
 const s=stores.createMemoryOfficeWorkspaces(),a=await s.provision('alice');
 assert.equal((await s.save('alice',a.id,{expectedVersion:0,operationId:'bad',ownerId:'bob',task:task()})).reason,'invalid_desk');
 assert.equal((await s.save('alice',a.id,{expectedVersion:0,operationId:'bad',task:task({links:[{label:'Bad',url:'javascript:alert(1)'}]})})).reason,'invalid_desk');
 assert.equal((await s.revoke('alice',a.id,'alice')).reason,'invalid_office_member');
 for(let i=0;i<32;i++)assert.equal((await s.invite('alice',a.id,`guest-${i}`)).ok,true);
 assert.equal((await s.invite('alice',a.id,'overflow')).reason,'office_limit');
 await s.revoke('alice',a.id,'guest-0');assert.equal((await s.invite('alice',a.id,'overflow')).ok,true);
 assert.equal((await s.read('alice',a.id)).desk.version,0);
});

for(const mode of ['memory','redis'])test(`${mode}: revocation and task writes have one atomic ordering`,{skip:mode==='redis'&&!process.env.REDIS_URL},async t=>{
 const prefix=`{workspace-revoke-race-${randomUUID()}}`,redis=mode==='redis'?new Redis(process.env.REDIS_URL):null;
 t.after(async()=>{if(redis){const keys=await redis.keys(`${prefix}*`);if(keys.length)await redis.del(...keys);await redis.quit();}});
 const store=redis?stores.createRedisOfficeWorkspaces({redis,prefix}):stores.createMemoryOfficeWorkspaces();
 const office=await store.provision('alice');await store.invite('alice',office.id,'bob');await store.accept('bob',office.id);
 const [revoked,written]=await Promise.all([
  store.revoke('alice',office.id,'bob'),
  store.save('bob',office.id,{expectedVersion:0,operationId:'race',task:task()}),
 ]);
 assert.equal(revoked.ok,true);
 assert.ok(written.ok||written.reason==='office_access_denied');
 assert.equal((await store.read('bob',office.id)).reason,'office_access_denied');
 assert.equal((await store.save('bob',office.id,{expectedVersion:0,operationId:'race',task:task()})).reason,'office_access_denied');
 const owner=await store.read('alice',office.id);
 assert.equal(owner.desk.tasks.length,written.ok?1:0,'only a write ordered before revocation can persist');
 assert.deepEqual(owner.workspace.members,[]);
});
