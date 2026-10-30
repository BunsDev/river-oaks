import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictTerracesCheckpoint } from '../district-terraces-checkpoint-migration.js';
import { recoverDistrictStudewoodCheckpoint } from '../district-studewood-checkpoint-migration.js';
import { createResidentNavigation } from '../../preview/src/navigation.js';
import { HEIGHTS_REVISION } from '../../shared/bayou-heights-layout.js';
import { STUDEWOOD_REVISION } from '../../shared/studewood-layout.js';
import { TERRACES_REVISION } from '../../shared/bayou-terraces-layout.js';

// The Heights strips cover every Heights revision's bounds, so later revisions add resident
// ground inside them: the terrace footbridge decks and Studewood's cross streets. Their one-step
// rollbacks remove that ground, and residents on it, or walking onto it, must be walked home
// rather than left standing there or waiting for space at its edge (review of #670, 2026-10-27).
const heights=await loadDistrictData({districtRevision:HEIGHTS_REVISION});
const studewood=await loadDistrictData({districtRevision:STUDEWOOD_REVISION});
const terraces=await loadDistrictData({districtRevision:TERRACES_REVISION});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const resave=(checkpoint,edit)=>{const {checksum:_checksum,...envelope}=structuredClone(checkpoint);edit(envelope.payload);return {...envelope,checksum:digest(envelope)};};
const time=1000;

// A town of `data` with one resident standing at `on` and another walking from clear ground
// nearby onto it. `kept` is the planner of the revision the rollback goes back to.
function town(data,kept,on,removed){
  const composed=createResidentNavigation(data,{locations:true}),before=createSharedWorld(data,{now:()=>time});
  before.join({userId:'alice',name:'Alice'});
  const original=before.checkpoint();
  assert.ok(composed.free(on)&&removed(on),'the spot is resident ground the rollback removes');
  let start=null;
  for(let radius=4;radius<40&&!start;radius+=.5)for(let i=0;i<32&&!start;i++){
    const point=[on[0]+Math.cos(i/32*Math.PI*2)*radius,on[1]+Math.sin(i/32*Math.PI*2)*radius];
    if(!removed(point)&&composed.free(point)&&kept.free(point))start=point;
  }
  assert.ok(start,'clear kept ground near the spot');
  const route=composed.route(start,on);
  assert.ok(route?.some(removed),'the walk goes onto the removed ground');
  const [standing,walking]=original.payload.state.locals.filter(local=>!local.indoor&&!local.stationary).slice(0,2).map(local=>local.id);
  const checkpoint=resave(original,payload=>{
    for(const local of payload.state.locals){
      if(local.id===standing){local.position=[...on,composed.ground(on)];Object.assign(local.life,{route:[],destination:null,waitUntil:0});}
      if(local.id===walking){local.position=[...start,composed.ground(start)];Object.assign(local.life,{route,destination:{id:'test-stroll',name:'Onto the deck',stroll:true},waitUntil:0});}
    }
  });
  assert.equal(createSharedWorld(data,{now:()=>time}).restore(checkpoint).ok,true);
  return {original,checkpoint,standing,walking,start,on};
}

function assertWalkedHome(result,{original,standing,walking,start,on},kept,data){
  const after=id=>result.checkpoint.payload.state.locals.find(local=>local.id===id),moved=after(standing).position;
  // Moved onto ground the kept planner reaches, from which it walks on (a bridge's rectangle
  // reaches a little onto the bank it lands on, so that bank can be where it stops).
  assert.ok(Math.hypot(moved[0]-on[0],moved[1]-on[1])>.5,'the resident on the removed ground is moved');
  assert.ok(kept.free(moved),'onto ground the kept planner reaches');
  assert.notEqual(kept.pedestrian.classify(moved),'road');
  assert.ok(kept.route(moved,start)?.length,'and walks on from there');
  assert.deepEqual(after(walking).position.slice(0,2),start,'the walker re-plans where it stands');
  for(const id of [standing,walking])assert.deepEqual([after(id).life.route,after(id).life.destination],[[],null]);
  // Nobody else moves.
  const before=id=>original.payload.state.locals.find(local=>local.id===id).position;
  for(const local of result.checkpoint.payload.state.locals.filter(item=>![standing,walking].includes(item.id)))assert.deepEqual(local.position,before(local.id));
  assert.equal(createSharedWorld(data,{now:()=>time}).restore(result.checkpoint).ok,true);
}

const terraceGround=([east,north])=>{
  const {bounds,bridges}=terraces.eastGardenCommons.terraces;
  return [...bounds,...bridges].some(([w,s,e,n])=>east>=w-.35&&east<=e+.35&&north>=s-.35&&north<=n+.35);
};

test('rolling back from the terraces to Studewood walks residents off the terrace decks',()=>{
  const kept=createResidentNavigation(studewood,{locations:true}),scene=town(terraces,kept,[-2532.3,-1224],terraceGround);
  const result=recoverDistrictTerracesCheckpoint({worldData:studewood,checkpoint:scene.checkpoint,now:()=>time});
  assert.equal(result.ok,true);
  assert.deepEqual([result.from,result.to,result.moved],['terraces','studewood',[]]);
  assert.deepEqual([result.movedResidents,result.reroutedResidents],[[scene.standing],[scene.walking]]);
  assertWalkedHome(result,scene,kept,studewood);
});

test('a chained rollback from the terraces to Heights keeps both steps\' resident lists',()=>{
  // The deck resident is moved by the first step onto greenway ground the second keeps, so only
  // the merge reports it; the walker is re-planned by the first step alone.
  const kept=createResidentNavigation(heights,{locations:true}),scene=town(terraces,kept,[-2532.3,-1224],terraceGround);
  const result=recoverDistrictTerracesCheckpoint({worldData:heights,checkpoint:scene.checkpoint,now:()=>time});
  assert.equal(result.ok,true);
  assert.deepEqual([result.from,result.to],['terraces','heights']);
  assert.deepEqual([result.movedResidents,result.reroutedResidents],[[scene.standing],[scene.walking]]);
  assertWalkedHome(result,scene,kept,heights);
});

test('rolling back from Studewood to Heights walks residents off Studewood\'s cross streets',()=>{
  const kept=createResidentNavigation(heights,{locations:true});
  // Studewood's ground is everything east of Heights Boulevard's east sidewalk, x 406 of the
  // District frame (HEIGHTS_EAST in the migration), as for players.
  const removed=([east])=>east>studewood.eastGardenCommons.edge+406-.35;
  const scene=town(studewood,kept,[-2245.34,-1412],removed);
  const result=recoverDistrictStudewoodCheckpoint({worldData:heights,checkpoint:scene.checkpoint,now:()=>time});
  assert.equal(result.ok,true);
  assert.deepEqual([result.from,result.to,result.moved],['studewood','heights',[]]);
  assert.deepEqual([result.movedResidents,result.reroutedResidents],[[scene.standing],[scene.walking]]);
  assertWalkedHome(result,scene,kept,heights);
});
