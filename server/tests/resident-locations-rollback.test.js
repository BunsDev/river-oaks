import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictCommonsCheckpoint } from '../district-commons-checkpoint-migration.js';
import { createResidentNavigation } from '../../preview/src/navigation.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';

const gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const commons=await loadDistrictData({districtRevision:COMMONS_REVISION});
const edge=commons.eastGardenCommons.edge;
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
