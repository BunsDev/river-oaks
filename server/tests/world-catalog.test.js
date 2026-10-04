import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createRedisWorldCatalog } from '../world-catalog.js';

const integration=(name,run)=>test(name,{skip:!process.env.REDIS_URL},run);

integration('a published world is durable, unique, bounded, and visible across Redis clients',async t=>{
  const redis=new Redis(process.env.REDIS_URL),peer=redis.duplicate();
  redis.on('error',()=>{});peer.on('error',()=>{});
  const prefix=`{river-oaks:catalog-test:${randomUUID()}}`;
  t.after(async()=>{await redis.del(`${prefix}:worlds:v1`);await Promise.all([redis.quit(),peer.quit()]);});
  const catalog=createRedisWorldCatalog({redis,prefix,now:()=>1000});
  const another=createRedisWorldCatalog({redis:peer,prefix,now:()=>2000});
  assert.deepEqual((await catalog.list()).map(world=>world.id),['river-oaks']);
  const published=await catalog.publish({id:'moon-garden',title:'Moon Garden',description:'A quiet place to meet.'},'owner-1');
  assert.equal(published.ok,true);
  assert.deepEqual(await another.get('moon-garden'),published.world);
  assert.equal((await another.list()).length,2);
  assert.equal((await another.publish({id:'moon-garden',title:'Replacement'},'owner-2')).reason,'world_exists');
  assert.equal((await catalog.get('missing-world')),null);
  assert.deepEqual((await another.list()).find(world=>world.id==='moon-garden').ownerId,'owner-1');
  const simultaneous=await Promise.all([
    catalog.publish({id:'shared-garden',title:'First Garden'},'owner-1'),
    another.publish({id:'shared-garden',title:'Second Garden'},'owner-2'),
  ]);
  assert.deepEqual(simultaneous.map(result=>result.ok).sort(),[false,true]);
  for(let index=0;index<14;index++)assert.equal((await catalog.publish({id:`garden-${index}`,title:`Garden ${index}`},'owner-1')).ok,true);
  assert.equal((await another.publish({id:'garden-overflow',title:'Overflow'},'owner-2')).reason,'world_limit');
  assert.equal((await catalog.list()).length,17);
});

test('world metadata is validated before Redis writes',async()=>{
  const catalog=createRedisWorldCatalog({redis:{},prefix:'{test}'});
  for(const data of [{id:'river-oaks',title:'Fake default'},{id:'Bad ID',title:'Garden'},{id:'garden',title:''},{id:'garden',title:'A'.repeat(65)},{id:'garden',title:'Garden',description:'B'.repeat(281)}])
    assert.equal((await catalog.publish(data,'owner')).reason,'invalid_world');
});
