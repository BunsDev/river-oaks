import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictHeightsCheckpoint } from '../district-heights-checkpoint-migration.js';
import { createResidentNavigation } from '../../preview/src/navigation.js';
import { createResidentLife } from '../../preview/src/resident-life.js';
import { createCommunity } from '../../preview/src/community.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION } from '../../shared/bayou-heights-layout.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';

const gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const commons=await loadDistrictData({districtRevision:COMMONS_REVISION});
const heights=await loadDistrictData({districtRevision:HEIGHTS_REVISION});
const bounds=heights.eastGardenCommons.heights.bounds;
const inHeights=([east,north])=>east>=bounds[0]&&east<=bounds[2]&&north>=bounds[1]&&north<=bounds[3];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Rewrites a checkpoint the way a running town would have saved it.
const resave=(checkpoint,edit)=>{const {checksum:_checksum,...envelope}=structuredClone(checkpoint);edit(envelope.payload);return {...envelope,checksum:digest(envelope)};};
const stops=createResidentLife(heights,createCommunity(heights,[],{carriage:false})).stops;
const stop=name=>stops.find(item=>item.id===`${heights.eastGardenCommons.heights.id}/${name}`).position;

// A Heights town where two residents stand in Heights: one on Heights Green, far from
// any Commons ground, and one at the footbridge landing.
const heightsTown=()=>{
  const time=1000,before=createSharedWorld(heights,{now:()=>time});
  before.join({userId:'alice',name:'Alice'});
  const composed=createResidentNavigation(heights,{locations:true});
  const original=before.checkpoint();
  const walkers=original.payload.state.locals.filter(local=>!local.indoor&&!local.stationary).slice(0,2).map(local=>local.id);
  const places=[stop('bandstand'),stop('footbridge')];
  assert.ok(places.every(place=>inHeights(place)&&composed.free(place)));
  const checkpoint=resave(original,payload=>{
    payload.state.locals.forEach(local=>{
      const at=places[walkers.indexOf(local.id)];
      if(!at)return;
      local.position=[at[0],at[1],composed.ground(at)];
      Object.assign(local.life,{route:[[...stop('hall')]],destination:{id:`${heights.eastGardenCommons.heights.id}/hall`,name:'Heights Hall'}});
    });
  });
  assert.equal(createSharedWorld(heights,{now:()=>time}).restore(checkpoint).ok,true,'a Heights town restores its residents where they stood');
  return {time,before,original,walkers,checkpoint};
};

test('rolling back from Heights to the Commons walks residents in Heights home to Commons ground',()=>{
  const {time,before,original,walkers,checkpoint}=heightsTown();
  const result=recoverDistrictHeightsCheckpoint({worldData:commons,checkpoint,now:()=>time});
  assert.equal(result.ok,true);
  assert.deepEqual([result.from,result.to],['heights','commons']);
  assert.deepEqual(result.moved,[]);
  assert.deepEqual([...result.movedResidents].sort(),[...walkers].sort());
  const navigation=createResidentNavigation(commons,{locations:true});
  const locals=result.checkpoint.payload.state.locals;
  for(const local of locals.filter(item=>walkers.includes(item.id))){
    assert.ok(local.position[0]<bounds[0],`${local.id} is west of the footbridge`);
    assert.ok(navigation.free(local.position),`${local.id} stands on ground the Commons planner reaches`);
    assert.notEqual(navigation.pedestrian.classify(local.position),'road');
    assert.deepEqual(local.life.route,[]);assert.equal(local.life.destination,null);
  }
  // Nobody else moves.
  const untouched=id=>original.payload.state.locals.find(local=>local.id===id).position;
  for(const local of locals.filter(item=>!walkers.includes(item.id)))assert.deepEqual(local.position,untouched(local.id));
  const after=createSharedWorld(commons,{now:()=>time});
  assert.equal(after.restore(result.checkpoint).ok,true);
  assert.deepEqual(after.snapshot().players,before.snapshot().players);
});

test('a chained rollback from Heights to Gardens brings residents in Heights back to the District',()=>{
  const {time,walkers,checkpoint}=heightsTown();
  const result=recoverDistrictHeightsCheckpoint({worldData:gardens,checkpoint,now:()=>time});
  assert.equal(result.ok,true);
  assert.deepEqual([result.from,result.to],['heights','gardens']);
  assert.ok(walkers.every(id=>result.movedResidents.includes(id)));
  const navigation=createResidentNavigation(gardens);
  for(const local of result.checkpoint.payload.state.locals.filter(item=>walkers.includes(item.id))){
    assert.ok(local.position[0]<gardens.bounds_m[2]);
    assert.ok(navigation.free(local.position),`${local.id} stands on District resident ground`);
  }
  assert.equal(createSharedWorld(gardens,{now:()=>time}).restore(result.checkpoint).ok,true);
});

test('rolling back from Heights re-plans walks into Heights, leaves walks into the Commons alone, and gives back Heights home stops',()=>{
  const time=1000,before=createSharedWorld(heights,{now:()=>time});
  const composed=createResidentNavigation(heights,{locations:true}),commonsNavigation=createResidentNavigation(commons,{locations:true});
  const original=before.checkpoint();
  const [toHeights,toCommons,anchored]=original.payload.state.locals.filter(local=>!local.indoor&&!local.stationary).slice(0,3).map(local=>local.id);
  const homeOf=id=>{const local=original.payload.state.locals.find(item=>item.id===id);return {anchorId:local.anchorId,anchorName:local.anchorName};};
  const id=heights.eastGardenCommons.heights.id,deck=heights.eastGardenCommons.heights.footbridge.deck;
  const tower=stops.find(item=>item.id.endsWith('lantern-tower')).position;
  const seam=composed.locations.portals.find(portal=>portal.west==='district');
  // Clear ground both towns' planners reach: on the Commons by the footbridge, and in the District by the seam.
  const clearNear=([east,north])=>{
    for(let radius=0;radius<20;radius+=.5)for(let i=0;i<24;i++){
      const point=[east+Math.cos(i/24*Math.PI*2)*radius,north+Math.sin(i/24*Math.PI*2)*radius];
      if(composed.free(point)&&commonsNavigation.free(point))return point;
    }
    return null;
  };
  const plans={[toHeights]:{at:clearNear([deck[0]-12,(deck[1]+deck[3])/2]),to:stop('bandstand'),destination:{id:`${id}/bandstand`,name:'Bandstand',shelter:false}},
    [toCommons]:{at:clearNear([seam.from[0]-20,seam.from[1]]),to:tower,destination:{id:'test-stroll',name:'Tower lantern',stroll:true}}};
  for(const plan of Object.values(plans)){
    assert.ok(plan.at,'clear ground found');
    plan.route=composed.route(plan.at,plan.to);
    assert.ok(plan.route?.length,'the walk is planned');
  }
  assert.ok(plans[toHeights].route.some(inHeights),'the first walk enters Heights');
  assert.ok(!plans[toCommons].route.some(inHeights)&&plans[toCommons].route.some(point=>point[0]>heights.eastGardenCommons.edge),'the second crosses only into the Commons');
  const checkpoint=resave(original,payload=>{
    for(const local of payload.state.locals){
      const plan=plans[local.id];
      if(plan){local.position=[...plan.at,composed.ground(plan.at)];Object.assign(local.life,{route:plan.route,destination:plan.destination,waitUntil:0});}
      if(local.id===anchored){Object.assign(local,{anchorId:`${id}/hall`,anchorName:'Heights Hall'});local.persona.anchorName='Heights Hall';}
    }
  });
  assert.equal(createSharedWorld(heights,{now:()=>time}).restore(checkpoint).ok,true);

  const result=recoverDistrictHeightsCheckpoint({worldData:commons,checkpoint,now:()=>time});
  assert.equal(result.ok,true);
  assert.deepEqual([result.movedResidents,result.reroutedResidents],[[],[toHeights]]);
  const after=localId=>result.checkpoint.payload.state.locals.find(local=>local.id===localId);
  assert.deepEqual([after(toHeights).life.route,after(toHeights).life.destination],[[],null]);
  assert.deepEqual(after(toHeights).position.slice(0,2),plans[toHeights].at,'it re-plans where it stands');
  assert.deepEqual(after(toCommons).life.route,plans[toCommons].route,'the walk into the Commons goes on');
  assert.deepEqual({anchorId:after(anchored).anchorId,anchorName:after(anchored).anchorName,persona:after(anchored).persona.anchorName},
    {...homeOf(anchored),persona:homeOf(anchored).anchorName});
  assert.equal(createSharedWorld(commons,{now:()=>time}).restore(result.checkpoint).ok,true);
  // Chained to Gardens, the walk into the Commons re-plans too.
  const gardensResult=recoverDistrictHeightsCheckpoint({worldData:gardens,checkpoint,now:()=>time});
  assert.equal(gardensResult.ok,true);
  assert.deepEqual([...gardensResult.reroutedResidents].sort(),[toHeights,toCommons].sort());
});

test('activating Heights moves no residents',()=>{
  const before=createSharedWorld(commons,{now:()=>1000});
  const result=recoverDistrictHeightsCheckpoint({worldData:heights,checkpoint:before.checkpoint(),now:()=>1000});
  assert.equal(result.ok,true);assert.deepEqual(result.movedResidents,[]);
  assert.deepEqual(result.checkpoint.payload.state.locals,before.checkpoint().payload.state.locals);
});

test('a resident on Heights Green plans a walk back to the footbridge and the District',()=>{
  // From the bandstand every way out faces away from the footbridge, so a one-way
  // search runs out of cells; the location leg is searched from its other end.
  const life=createResidentLife(heights,createCommunity(heights,[],{carriage:false})),navigation=life.navigation;
  const district=life.stops.find(item=>!item.id.includes('/')).position;
  for(const [from,to] of [[stop('bandstand'),stop('footbridge')],[stop('bandstand'),district]]){
    const route=navigation.route(from,to);
    assert.ok(route,'a route is found');
    let previous=from;
    for(const point of route){assert.ok(navigation.canWalk(previous,point));previous=point;}
    assert.ok(Math.hypot(route.at(-1)[0]-to[0],route.at(-1)[1]-to[1])<1e-9);
  }
});
