import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictCommonsCheckpoint, relocateResidents } from '../district-commons-checkpoint-migration.js';
import { createResidentNavigation } from '../../preview/src/navigation.js';
import { createResidentLife } from '../../preview/src/resident-life.js';
import { createCommunity } from '../../preview/src/community.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';

const gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const commons=await loadDistrictData({districtRevision:COMMONS_REVISION});
const edge=commons.eastGardenCommons.edge;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Rewrites a checkpoint the way a running town would have saved it.
const resave=(checkpoint,edit)=>{const {checksum:_checksum,...envelope}=structuredClone(checkpoint);edit(envelope.payload);return {...envelope,checksum:digest(envelope)};};

test('rolling back to Gardens walks residents home from the Commons and the seam corridor',()=>{
  const time=1000,before=createSharedWorld(commons,{now:()=>time});
  before.join({userId:'alice',name:'Alice'});
  const composed=createResidentNavigation(commons,{locations:true}),portal=composed.locations.portals[0];
  const inCommons=[edge+60,-1335],inCorridor=[(portal.from[0]+portal.to[0])/2-3,portal.from[1]];
  assert.ok(composed.free(inCommons)&&composed.free(inCorridor));
  const original=before.checkpoint();
  const walkers=original.payload.state.locals.filter(local=>!local.indoor&&!local.stationary).slice(0,2).map(local=>local.id);
  const checkpoint=resave(original,payload=>{
    payload.state.locals.forEach(local=>{
      const at=[inCommons,inCorridor][walkers.indexOf(local.id)];
      if(!at)return;
      local.position=[...at,composed.ground(at)];
      Object.assign(local.life,{route:[[edge+90,-1335]],destination:{id:'bayou-market-commons/lantern-tower',name:'Tower lantern'}});
    });
  });
  // A Commons town restores its residents where they stood.
  const live=createSharedWorld(commons,{now:()=>time});assert.equal(live.restore(checkpoint).ok,true);

  const result=recoverDistrictCommonsCheckpoint({worldData:gardens,checkpoint,now:()=>time});
  assert.equal(result.ok,true);
  assert.deepEqual(result.moved,[]);
  assert.deepEqual([...result.movedResidents].sort(),[...walkers].sort());
  const navigation=createResidentNavigation(gardens);
  const locals=result.checkpoint.payload.state.locals;
  for(const local of locals.filter(item=>walkers.includes(item.id))){
    assert.ok(local.position[0]<gardens.bounds_m[2]);
    assert.ok(navigation.free(local.position),`${local.id} stands on District resident ground`);
    assert.notEqual(navigation.pedestrian.classify(local.position),'road');
    assert.deepEqual(local.life.route,[]);assert.equal(local.life.destination,null);
  }
  // Nobody else moves: residents on District ground or seated on benches stay put.
  const untouched=id=>original.payload.state.locals.find(local=>local.id===id).position;
  for(const local of locals.filter(item=>!walkers.includes(item.id)))assert.deepEqual(local.position,untouched(local.id));
  const after=createSharedWorld(gardens,{now:()=>time});
  assert.equal(after.restore(result.checkpoint).ok,true);
  assert.deepEqual(after.snapshot().players,before.snapshot().players);
});

test('rollback leaves residents alone when none wandered out of the District',()=>{
  const before=createSharedWorld(commons,{now:()=>1000});
  const result=recoverDistrictCommonsCheckpoint({worldData:gardens,checkpoint:before.checkpoint(),now:()=>1000});
  assert.equal(result.ok,true);assert.deepEqual(result.movedResidents,[]);
  assert.deepEqual(result.checkpoint.payload.state.locals,before.checkpoint().payload.state.locals);
});

test('relocateResidents moves only residents on dropped land, leaves the source checkpoint alone and can search from a fallback point',()=>{
  const time=1000,before=createSharedWorld(commons,{now:()=>time});
  const composed=createResidentNavigation(commons,{locations:true});
  const original=before.checkpoint(),{checksum:_checksum,...envelope}=structuredClone(original);
  const [near,far]=envelope.payload.state.locals.filter(local=>!local.indoor&&!local.stationary);
  const inCommons=[edge+60,-1335];
  near.position=[...inCommons,composed.ground(inCommons)];
  const snapshot=structuredClone(envelope);
  const result=relocateResidents({fromData:commons,toData:gardens,checkpoint:envelope,inside:east=>east>gardens.bounds_m[2]});
  assert.deepEqual(result.moved,[near.id]);
  assert.deepEqual(envelope,snapshot,'the input envelope is not modified');
  const navigation=createResidentNavigation(gardens),moved=result.checkpoint.payload.state.locals.find(local=>local.id===near.id);
  assert.ok(navigation.free(moved.position));
  assert.deepEqual(result.checkpoint.payload.state.locals.find(local=>local.id===far.id).position,far.position);
  // A resident far from any ground the target keeps (deep in dropped land north of
  // the Commons band, as in Bayou Heights) needs the fallback point.
  const deep=structuredClone(envelope),lost=deep.payload.state.locals.find(local=>local.id===near.id);
  lost.position=[edge+110,-1200,0];
  const dropped=(east,north)=>east>edge+100&&north>-1290;
  assert.equal(relocateResidents({fromData:commons,toData:commons,checkpoint:deep,inside:dropped}),null,'nothing clear within 40 m and no fallback');
  const toward=createResidentLife(commons,createCommunity(commons,[],{carriage:false})).stops.find(stop=>stop.id.endsWith('lantern-tower')).position;
  const found=relocateResidents({fromData:commons,toData:commons,checkpoint:deep,inside:dropped,toward});
  assert.deepEqual(found.moved,[near.id]);
  const placed=found.checkpoint.payload.state.locals.find(local=>local.id===near.id).position;
  assert.ok(composed.free(placed)&&distance(placed,toward)<=40);
});
