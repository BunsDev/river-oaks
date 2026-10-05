import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Redis from 'ioredis';
import { createRedisWorldCatalog, createMemoryWorldCatalog } from '../world-catalog.js';
import { compileRegionPackage, editableRegionFromWorld } from '../region-package.js';

const integration=(name,run)=>test(name,{skip:!process.env.REDIS_URL},run);
const sample=JSON.parse(readFileSync(new URL('../../preview/public/data/sample-region.json',import.meta.url)));
const venueSample={...sample,buildings:sample.buildings.map((building,index)=>index?building:{...building,
  interior:{name:'Moon Gallery',category:'art',entrance:'south'}})};

integration('a published world is durable, unique, bounded, and visible across Redis clients',async t=>{
  const redis=new Redis(process.env.REDIS_URL),peer=redis.duplicate();
  redis.on('error',()=>{});peer.on('error',()=>{});
  const prefix=`{river-oaks:catalog-test:${randomUUID()}}`;
  t.after(async()=>{await redis.del(`${prefix}:worlds:v1`,`${prefix}:regions:v1`,`${prefix}:region-drafts:v1`);await Promise.all([redis.quit(),peer.quit()]);});
  const catalog=createRedisWorldCatalog({redis,prefix,now:()=>1000});
  const another=createRedisWorldCatalog({redis:peer,prefix,now:()=>2000});
  assert.deepEqual((await catalog.list()).map(world=>world.id),['river-oaks']);
  const published=await catalog.publish({id:'moon-garden',title:'Moon Garden',description:'A quiet place to meet.',region:venueSample},'owner-1');
  assert.equal(published.ok,true);
  assert.equal(published.world.template,'region-v1');
  assert.deepEqual(await another.get('moon-garden'),published.world);
  const region=await another.getRegion('moon-garden');
  assert.equal(region.provenance.kind,'creator');
  assert.equal(region.buildings.length,4);
  assert.equal(region.stores[0].name,'Moon Gallery');
  const editable=await another.editable('moon-garden');
  assert.equal(editable.draft,null);
  assert.equal(editable.publishedRegion.buildings[0].interior.name,'Moon Gallery');
  assert.deepEqual(compileRegionPackage(editable.publishedRegion,'Moon Garden').buildings,region.buildings);
  const revised={...editable.publishedRegion,places:editable.publishedRegion.places.map(place=>place.id===editable.publishedRegion.places[0].id?{...place,name:'Revised Arch'}:place)};
  const saved=await catalog.saveDraft({id:'moon-garden',baseRegionSha256:published.world.regionSha256,expectedDraftVersion:0,region:revised},'owner-1');
  assert.equal(saved.ok,true);
  assert.equal(saved.draft.version,1);
  assert.equal((await another.editable('moon-garden')).draft.region.places[0].name,'Revised Arch');
  assert.equal((await another.getRegion('moon-garden')).communityLocations[0].name,region.communityLocations[0].name);
  assert.equal((await another.saveDraft({id:'moon-garden',baseRegionSha256:'0'.repeat(64),expectedDraftVersion:1,region:revised},'owner-1')).reason,'stale');
  assert.equal((await another.saveDraft({id:'moon-garden',baseRegionSha256:published.world.regionSha256,expectedDraftVersion:0,region:revised},'owner-1')).reason,'draft_conflict');
  assert.equal((await another.discardDraft('moon-garden',0)).reason,'draft_conflict');
  assert.deepEqual(await another.discardDraft('moon-garden',1),{ok:true,removed:true});
  assert.equal((await catalog.editable('moon-garden')).draft,null);
  const competing=await Promise.all([
    catalog.saveDraft({id:'moon-garden',baseRegionSha256:published.world.regionSha256,expectedDraftVersion:0,region:revised},'owner-1'),
    another.saveDraft({id:'moon-garden',baseRegionSha256:published.world.regionSha256,expectedDraftVersion:0,region:revised},'owner-2'),
  ]);
  assert.deepEqual(competing.map(result=>result.ok).sort(),[false,true]);
  assert.equal(competing.find(result=>!result.ok).reason,'draft_conflict');
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
  await redis.hset(`${prefix}:regions:v1`,'moon-garden','{}');
  await assert.rejects(()=>another.getRegion('moon-garden'),/missing or corrupt/);
});

integration('corrupt retained Redis regions are never offered for restoration',async t=>{
  const redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});
  const prefix=`{river-oaks:history-test:${randomUUID()}}`,historyKey=`${prefix}:region-history:garden`;
  t.after(async()=>{await redis.del(`${prefix}:worlds:v1`,`${prefix}:regions:v1`,historyKey);await redis.quit();});
  const catalog=createRedisWorldCatalog({redis,prefix});
  const published=await catalog.publish({id:'garden',title:'Garden',region:sample},'owner');
  await redis.lpush(historyKey,JSON.stringify({world:published.world,region:'{}'}));
  await assert.rejects(()=>catalog.history('garden'),/corrupt/);
  await assert.rejects(()=>catalog.version('garden',1,published.world.regionSha256),/corrupt/);
});

test('a published creator world becomes an editable but unpublished revision draft',async()=>{
  const catalog=createMemoryWorldCatalog({now:()=>1234});
  const published=await catalog.publish({id:'garden',title:'Garden',region:sample},'owner');
  const editable=await catalog.editable('garden');
  assert.equal(editable.world.regionSha256,published.world.regionSha256);
  assert.deepEqual(compileRegionPackage(editable.publishedRegion,'Garden').roads,compileRegionPackage(sample,'Garden').roads);
  assert.deepEqual(editableRegionFromWorld(await catalog.getRegion('garden')),editable.publishedRegion);
  const changed={...editable.publishedRegion,places:editable.publishedRegion.places.map((place,index)=>index?place:{...place,name:'New Name'})};
  assert.equal((await catalog.saveDraft({id:'garden',baseRegionSha256:published.world.regionSha256,expectedDraftVersion:0,region:changed},'owner')).ok,true);
  assert.equal((await catalog.editable('garden')).draft.region.places[0].name,'New Name');
  assert.notEqual((await catalog.getRegion('garden')).communityLocations[0].name,'New Name');
  assert.equal((await catalog.saveDraft({id:'garden',baseRegionSha256:'f'.repeat(64),expectedDraftVersion:1,region:changed},'owner')).reason,'stale');
  assert.equal((await catalog.saveDraft({id:'garden',baseRegionSha256:published.world.regionSha256,expectedDraftVersion:0,region:changed},'owner')).reason,'draft_conflict');
  assert.equal((await catalog.saveDraft({id:'garden',baseRegionSha256:published.world.regionSha256,expectedDraftVersion:1,region:{...changed,places:[]}},'owner')).reason,'invalid_draft');
  assert.deepEqual(await catalog.discardDraft('garden',1),{ok:true,removed:true});
  assert.equal((await catalog.editable('garden')).draft,null);
});

test('retained region versions can be copied into a new private revision draft',async()=>{
  let time=1000;
  const catalog=createMemoryWorldCatalog({now:()=>++time});
  const published=await catalog.publish({id:'garden',title:'Garden',region:sample},'owner');
  const original=(await catalog.editable('garden')).publishedRegion;
  assert.deepEqual((await catalog.history('garden')).versions,[]);
  const changed={...original,places:original.places.map((place,index)=>index?place:{...place,name:'New Name'})};
  assert.equal((await catalog.saveDraft({id:'garden',baseRegionSha256:published.world.regionSha256,expectedDraftVersion:0,region:changed},'owner')).ok,true);
  const candidate=await catalog.revisionCandidate('garden',1);
  assert.equal((await catalog.applyRevision(candidate)).ok,true);
  const history=await catalog.history('garden');
  assert.deepEqual(history.versions,[{revision:1,updatedAt:published.world.createdAt,regionSha256:published.world.regionSha256}]);
  assert.equal((await catalog.version('garden',1,candidate.world.regionSha256)).region.places[0].name,original.places[0].name);
  assert.equal((await catalog.version('garden',1,published.world.regionSha256)).reason,'stale');
  assert.equal((await catalog.version('garden',2,candidate.world.regionSha256)).reason,'missing_version');
  assert.equal((await catalog.version('garden',0,candidate.world.regionSha256)).reason,'invalid_version');
  assert.equal((await catalog.saveDraft({id:'garden',baseRegionSha256:candidate.world.regionSha256,expectedDraftVersion:0,region:original},'owner')).ok,true);
  assert.equal((await catalog.applyRevision(await catalog.revisionCandidate('garden',1))).ok,true);
  assert.equal((await catalog.getRegion('garden')).communityLocations[0].name,original.places[0].name);
  assert.deepEqual((await catalog.history('garden')).versions.map(version=>version.revision),[2,1]);
});

test('world metadata is validated before Redis writes',async()=>{
  const catalog=createRedisWorldCatalog({redis:{},prefix:'{test}'});
  for(const data of [{id:'river-oaks',title:'Fake default'},{id:'Bad ID',title:'Garden'},{id:'garden',title:''},{id:'garden',title:'A'.repeat(65)},{id:'garden',title:'Garden',description:'B'.repeat(281)}])
    assert.equal((await catalog.publish(data,'owner')).reason,'invalid_world');
  assert.equal((await catalog.publish({id:'garden',title:'Garden',region:{...sample,places:[]}},'owner')).reason,'invalid_region');
});
