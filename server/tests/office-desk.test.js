import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryOfficeDesk, createRedisOfficeDesk } from '../office-desk.js';
const task=(extra={})=>({id:'first-task',title:'Plan the studio opening',notes:'Room for thirty people.',links:[{label:'Project brief',url:'https://example.com/brief'}],result:'A finished plan.',status:'open',...extra});
for(const mode of ['memory','redis'])test(`${mode}: private desk survives reopening and refuses stale saves`,{skip:mode==='redis'&&!process.env.REDIS_URL},async t=>{
 const namespace=`{desk-test-${randomUUID()}}`,redis=mode==='redis'?new Redis(process.env.REDIS_URL):null;
 t.after(async()=>{if(redis){const keys=await redis.keys(`${namespace}*`);if(keys.length)await redis.del(...keys);await redis.quit();}});
 const create=()=>mode==='memory'?createMemoryOfficeDesk({now:()=>100}):createRedisOfficeDesk({redis,prefix:namespace,now:()=>100});
 const desk=create();assert.deepEqual((await desk.read('alice')).tasks,[]);
 const saved=await desk.save('alice',{expectedVersion:0,task:task()});assert.equal(saved.ok,true);assert.equal(saved.desk.activeId,'first-task');
 assert.equal((await desk.read('bob')).tasks.length,0);
 const again=mode==='redis'?create():desk;assert.equal((await again.read('alice')).tasks[0].notes,task().notes);
 const outcomes=await Promise.all(['one','two'].map(result=>again.save('alice',{expectedVersion:1,task:task({result,status:'done'})})));
 assert.equal(outcomes.filter(x=>x.ok).length,1);assert.equal(outcomes.find(x=>!x.ok).reason,'desk_conflict');
 const current=await again.read('alice');assert.equal(current.version,2);assert.equal(current.tasks[0].status,'done');
 assert.equal((await again.remove('alice',{expectedVersion:1,id:'first-task'})).reason,'desk_conflict');
 assert.equal((await again.remove('alice',{expectedVersion:2,id:'first-task'})).ok,true);
 assert.deepEqual((await again.read('alice')).tasks,[]);assert.equal((await again.read('alice')).version,3);
});
test('desk validates fields, links, size and ownership without changing saved work',async()=>{
 const desk=createMemoryOfficeDesk();
 for(const bad of [task({title:''}),task({notes:'x'.repeat(4001)}),task({status:'injected'}),task({owner:'bob'}),task({links:[{label:'Bad',url:'javascript:alert(1)'}]}),task({links:[{label:'Bad',url:'https://user:password@example.com'}]})])
  assert.equal((await desk.save('alice',{expectedVersion:0,task:bad})).reason,'invalid_desk');
 assert.equal((await desk.save('alice',{userId:'bob',expectedVersion:0,task:task()})).reason,'invalid_desk');
 assert.equal((await desk.read('alice')).version,0);
 const saved=await desk.save('alice',{expectedVersion:0,task:task({notes:'<script>inert text</script>\nsecond line'})});assert.equal(saved.ok,true);
 saved.desk.tasks[0].notes='client mutation';assert.match((await desk.read('alice')).tasks[0].notes,/inert/);
});
test('desk task count is bounded and deleting releases capacity',async()=>{
 const desk=createMemoryOfficeDesk();let version=0;
 for(let i=0;i<24;i++){const r=await desk.save('a',{expectedVersion:version++,task:task({id:`task-${i}`})});assert.equal(r.ok,true);}
 assert.equal((await desk.save('a',{expectedVersion:version,task:task()})).reason,'desk_limit');
 await desk.remove('a',{expectedVersion:version++,id:'task-0'});
 assert.equal((await desk.save('a',{expectedVersion:version,task:task()})).ok,true);
});

for(const mode of ['memory','redis'])test(`${mode}: private task timestamps and lost-response retries remain stable`,{skip:mode==='redis'&&!process.env.REDIS_URL},async t=>{
 const prefix=`{desk-retry-${randomUUID()}}`,redis=mode==='redis'?new Redis(process.env.REDIS_URL):null;let time=100;
 t.after(async()=>{if(redis){const keys=await redis.keys(`${prefix}*`);if(keys.length)await redis.del(...keys);await redis.quit();}});
 const store=mode==='memory'?createMemoryOfficeDesk({now:()=>time}):createRedisOfficeDesk({redis,prefix,now:()=>time});
 const write={expectedVersion:0,operationId:'op-1',task:task()};
 const saved=await store.save('alice',write);assert.equal(saved.ok,true);
 assert.equal(saved.desk.tasks[0].createdAt,100);assert.equal(saved.desk.tasks[0].updatedAt,100);
 time=200;assert.equal((await store.save('alice',write)).ok,true);
 assert.equal((await store.read('alice')).version,1);
 assert.equal((await store.save('alice',{...write,task:task({notes:'different'})})).reason,'desk_operation_conflict');
 const updated=await store.save('alice',{expectedVersion:1,operationId:'op-2',task:{...saved.desk.tasks[0],createdAt:0,updatedAt:0,notes:'Updated'}});
 assert.equal(updated.desk.tasks[0].createdAt,100);assert.equal(updated.desk.tasks[0].updatedAt,200);
 const removal={expectedVersion:2,operationId:'op-3',id:write.task.id};
 assert.equal((await store.remove('alice',removal)).ok,true);assert.equal((await store.remove('alice',removal)).ok,true);
 assert.equal((await store.read('alice')).version,3);assert.equal((await store.save('alice',write)).ok,true,'old save retry reports current state without resurrecting task');
 assert.deepEqual((await store.read('alice')).tasks,[]);
 assert.equal('receipts' in await store.read('alice'),false);
});
