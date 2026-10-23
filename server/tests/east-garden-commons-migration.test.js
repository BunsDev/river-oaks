import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictCommonsCheckpoint } from '../district-commons-checkpoint-migration.js';
import { detachEastGardenCommons } from '../../preview/src/east-garden-commons-world.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { configuredDistrictRevision, districtRevisionOf, DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
const gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const commons=await loadDistrictData({districtRevision:COMMONS_REVISION});

test('server-selected Commons revision composes and exactly detaches from Gardens',()=>{
  assert.equal(configuredDistrictRevision(COMMONS_REVISION),COMMONS_REVISION);
  assert.equal(districtRevisionOf(commons),COMMONS_REVISION);
  assert.equal(commons.gardenCampus.revision,DISTRICT_REVISION_GARDENS);
  assert.deepEqual(detachEastGardenCommons(commons),gardens);
  const tampered=structuredClone(commons);tampered.eastGardenCommons.ground+=1;
  assert.throws(()=>detachEastGardenCommons(tampered),/differs/);
});

test('Gardens checkpoint migrates without changing existing players, identities or chat',()=>{
  const before=createSharedWorld(gardens,{now:()=>1000});before.join({userId:'alice',name:'Alice'});
  assert.equal(before.command('alice',{type:'chat',text:'Meet me in the commons.'}).ok,true);
  const checkpoint=before.checkpoint(),result=recoverDistrictCommonsCheckpoint({worldData:commons,checkpoint,now:()=>1000});
  assert.equal(result.ok,true);assert.deepEqual(result.moved,[]);
  const after=createSharedWorld(commons,{now:()=>1000});assert.equal(after.restore(result.checkpoint).ok,true);
  assert.deepEqual(after.snapshot().players,before.snapshot().players);assert.deepEqual(after.snapshot().chat,before.snapshot().chat);
  assert.deepEqual(before.checkpoint(),checkpoint);
  assert.equal(recoverDistrictCommonsCheckpoint({worldData:commons,checkpoint:{...checkpoint,checksum:'bad'}}).ok,false);
});

test('rollback returns Commons occupants to clear District ground without discarding accounts',()=>{
  let time=1000;const before=createSharedWorld(commons,{now:()=>time});
  for(const id of ['alice','bob']){
    before.join({userId:id,name:id});time+=2000;
    assert.equal(before.command(id,{type:'travel',position:[commons.eastGardenCommons.edge+80,-1335]}).ok,true);
  }
  const checkpoint=before.checkpoint(),result=recoverDistrictCommonsCheckpoint({worldData:gardens,checkpoint,now:()=>time});
  assert.equal(result.ok,true);assert.deepEqual(result.moved,['alice','bob']);
  const after=createSharedWorld(gardens,{now:()=>time});assert.equal(after.restore(result.checkpoint).ok,true);
  for(const player of after.snapshot().players){assert.ok(player.position[0]<gardens.bounds_m[2]);assert.equal(player.altitude,0);}
  assert.deepEqual(after.snapshot().players.map(p=>[p.id,p.appearance]),before.snapshot().players.map(p=>[p.id,p.appearance]));
  const [a,b]=after.snapshot().players;assert.ok(Math.hypot(a.position[0]-b.position[0],a.position[1]-b.position[1])>=.9);
});

test('Redis fences Commons rollout and rollback by epoch and preserves durable state',{skip:!process.env.REDIS_URL},async t=>{
  const {default:Redis}=await import('ioredis');
  const {randomUUID}=await import('node:crypto');
  const {createRedisRoom}=await import('../redis-room.js');
  const redis=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1,retryStrategy:null});
  redis.on('error',()=>{});await redis.connect();
  const prefix=`{river-oaks:test:${randomUUID()}}`,rooms=[];let time=100000;
  const create=(worldData,districtEpoch)=>{const room=createRedisRoom({redis,prefix,worldData,districtEpoch,authorize:async()=>true,now:()=>time,isAdmin:()=>false});rooms.push(room);return room;};
  t.after(async()=>{await Promise.all(rooms.map(room=>room.close()));const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await redis.quit();});
  const join=(room,connectionId)=>room.request({type:'join',identity:{userId:'alice',name:'Alice',sessionId:'fixture-alice',expiresAt:time+120000},connectionId});
  const first=create(gardens,1);assert.equal((await join(first,'one')).ok,true);await first.close();
  await assert.rejects(join(create(commons,1),'unchanged'),/Invalid durable town district/);
  const next=create(commons,2);assert.equal((await join(next,'two')).ok,true);
  time+=2000;
  assert.equal((await next.request({type:'command',userId:'alice',connectionId:'two',message:{type:'travel',position:[commons.eastGardenCommons.edge+80,-1335]}})).ok,true);
  await next.close();const saved=await redis.getBuffer(`${prefix}:state`);
  await assert.rejects(join(create(gardens,1),'stale'),/Invalid durable town district/);
  assert.ok((await redis.getBuffer(`${prefix}:state`)).equals(saved));
  const rollback=create(gardens,3);assert.equal((await join(rollback,'three')).ok,true);
  assert.ok((await rollback.read()).snapshot.players[0].position[0]<gardens.bounds_m[2]);
  await rollback.close();
  await assert.rejects(join(create(commons,2),'stale-commons'),/Invalid durable town district/);
});
