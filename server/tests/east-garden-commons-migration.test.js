import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictCommonsCheckpoint } from '../district-commons-checkpoint-migration.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { objectCollider } from '../../preview/src/creator-object.js';
import { attachEastGardenCommons, detachEastGardenCommons } from '../../preview/src/east-garden-commons-world.js';
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

test('rollback relocates a flyer inside the walking margin but outside District flight clearance', () => {
  let time = 100000;
  const id = 'user_01M402HKJYDTH1QJM5NAQDZ4HH';
  const source = createSharedWorld(commons, { now: () => time });
  assert.equal(source.join({ userId: id, name: 'Owner' }).ok, true);
  const command = message => { time += 2000; return source.command(id, message); };
  const position = [commons.eastGardenCommons.edge - .5, -1335];
  assert.equal(command({ type: 'travel', position }).ok, true);
  const player = source.snapshot().players[0];
  assert.equal(command({ type: 'pose', position: player.position, yaw: 0, altitude: 1 }).ok, true);
  const checkpoint = source.checkpoint();
  assert.equal(createSharedWorld(commons, { now: () => time }).restore(checkpoint).ok, true);
  const migrated = recoverDistrictCommonsCheckpoint({ worldData: gardens, checkpoint, now: () => time });
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.moved, [id]);
  const restored = createSharedWorld(gardens, { now: () => time });
  assert.equal(restored.restore(migrated.checkpoint).ok, true);
  assert.equal(restored.snapshot().players[0].altitude, 0);
  assert.deepEqual(source.checkpoint(), checkpoint);
});

test('temporary Commons blockout refuses durable creations until relocation is supported', () => {
  let time = 100000;
  const source = createSharedWorld(commons, { now: () => time, isAdmin: () => true });
  source.join({ userId: 'admin', name: 'Admin' });
  time += 2000;
  const east = commons.eastGardenCommons.edge;
  assert.equal(source.command('admin', { type: 'travel', position: [east + 80, -1335] }).ok, true);
  time += 2000;
  const result = source.command('admin', { type: 'build', action: 'place', kind: 'seat', finish: 'rose', position: [east + 83, -1335], yaw: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'blocked_build_site');
  const rollback = recoverDistrictCommonsCheckpoint({ worldData: gardens, checkpoint: source.checkpoint(), now: () => time, isAdmin: () => true });
  assert.equal(rollback.ok, true);
});

test('original District creations remain available and survive rollback exactly', () => {
  let time = 100000;
  const options = { now: () => time, isAdmin: () => true };
  const source = createSharedWorld(commons, options);
  source.join({ userId: 'admin', name: 'Admin' });
  const [west, south] = gardens.bounds_m;
  time += 2000;
  assert.equal(source.command('admin', { type: 'travel', position: [west + 5, south + 2] }).ok, true);
  time += 2000;
  const result = source.command('admin', { type: 'build', action: 'place', kind: 'seat', finish: 'rose', position: [west + 2, south + 2], yaw: 0 });
  assert.equal(result.ok, true);
  const migrated = recoverDistrictCommonsCheckpoint({ worldData: gardens, checkpoint: source.checkpoint(), ...options });
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.checkpoint.payload.builds, [result.item]);
});

test('rollback avoids existing District creation colliders and preserves creations', () => {
  let time = 100000;
  const options = { now: () => time, isAdmin: () => true };
  // Actual gateway roads prohibit creation placement. This controlled fixture
  // removes roads to exercise an occupied first relocation candidate.
  const fixtureGardens = { ...gardens, roads: [] };
  const fixtureCommons = attachEastGardenCommons(fixtureGardens);
  const source = createSharedWorld(fixtureCommons, options);
  const edge = fixtureGardens.bounds_m[2];
  const command = message => {
    time += 2000;
    const result = source.command('admin', message);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result;
  };
  assert.equal(source.join({ userId: 'admin', name: 'Admin' }).ok, true);
  command({ type: 'travel', position: [edge - 1.1, -1332.5] });
  const assembly = { name: 'Gateway obstacle', parts: [{ shape: 'box', size: [1, 2, 1],
    position: [0, 1, 0], rotation: [0, 0, 0], color: '#b97986', material: 'metal' }] };
  const block = command({ type: 'build', action: 'place', kind: 'object', finish: 'rose',
    assembly, position: [edge - 1.1, -1335], yaw: 0 }).item;
  command({ type: 'travel', position: [edge + 80, -1335] });
  const environment = createWalkingEnvironment(fixtureGardens, [objectCollider(block)]);
  assert.equal(environment.isFree(edge - 1, 1335), false);
  const checkpoint = source.checkpoint();
  const result = recoverDistrictCommonsCheckpoint({ worldData: fixtureGardens, checkpoint, ...options });
  assert.equal(result.ok, true);
  assert.deepEqual(result.moved, ['admin']);
  const destination = result.checkpoint.payload.players[0].position;
  assert.equal(environment.isFree(destination[0], -destination[1]), true);
  assert.notEqual(destination[0], edge - 1);
  assert.deepEqual(result.checkpoint.payload.builds, [block]);
  assert.deepEqual(source.checkpoint(), checkpoint);
  assert.equal(createSharedWorld(fixtureGardens, options).restore(result.checkpoint).ok, true);
});
