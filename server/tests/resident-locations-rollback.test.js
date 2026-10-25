import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictCommonsCheckpoint } from '../district-commons-checkpoint-migration.js';
import { createResidentNavigation } from '../../preview/src/navigation.js';
import { createResidentLife } from '../../preview/src/resident-life.js';
import { createCommunity } from '../../preview/src/community.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { buildGeometry,buildRoads,checkBuildSite } from '../../preview/src/shared-build.js';
import { newObjectPart } from '../../preview/src/creator-object.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';

const gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const commons=await loadDistrictData({districtRevision:COMMONS_REVISION});
const edge=commons.eastGardenCommons.edge;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Rewrites a checkpoint the way a running town would have saved it.
const resave=(checkpoint,edit)=>{const {checksum:_checksum,...envelope}=structuredClone(checkpoint);edit(envelope.payload);return {...envelope,checksum:digest(envelope)};};
const composed=createResidentNavigation(commons,{locations:true}),portal=composed.locations.portals[0];
const gardensNavigation=createResidentNavigation(gardens);
// The stops and bench places residents of the Commons town use.
const commonsLife=createResidentLife(commons,createCommunity(commons,[],{carriage:false}));
const tower=commonsLife.stops.find(stop=>stop.id.endsWith('lantern-tower'));

test('rolling back to Gardens walks residents home from the Commons and the seam corridor',()=>{
  const time=1000,before=createSharedWorld(commons,{now:()=>time});
  before.join({userId:'alice',name:'Alice'});
  const inCommons=[edge+60,-1335],inCorridor=[(portal.from[0]+portal.to[0])/2-3,portal.from[1]];
  assert.ok(composed.free(inCommons)&&composed.free(inCorridor));
  // A storefront bench place in the District, for a resident resting there.
  const [storeId,[seat]]=[...commonsLife.benches].find(([,places])=>places[0].x<edge);
  const bench=commonsLife.stops.find(stop=>stop.id===storeId);
  // A planter built on the eastbound lane narrows the corridor below a portal's
  // width; the corridor residents walked in is still the one rolled back.
  const planter={kind:'object',finish:'rose',assembly:{name:'Planter',parts:[{...newObjectPart(),size:[.4,.8,.4],position:[0,.4,0]}]}};
  const at=[portal.eastbound[0][0]+3,portal.eastbound[0][1]];
  const site=checkBuildSite({environment:createWalkingEnvironment(commons),roads:buildRoads(commons),position:at,kind:buildGeometry(planter),builds:[]});
  assert.ok(Number.isFinite(site.ground));
  const original=before.checkpoint();
  const [walkers,sitter]=(outdoor=>[outdoor.slice(0,2).map(local=>local.id),outdoor[2].id])(original.payload.state.locals.filter(local=>!local.indoor&&!local.stationary));
  const checkpoint=resave(original,payload=>{
    payload.builds.push({id:'build-1',ownerId:'alice',ownerName:'Alice',...planter,position:at,ground:site.ground,yaw:0,createdAt:time});
    payload.state.locals.forEach(local=>{
      if(local.id===sitter){
        local.position=[seat.x,seat.north,composed.ground([seat.x,seat.north])];
        Object.assign(local.life,{seat:{id:seat.id,heading:seat.heading,height:seat.height},heading:seat.heading,status:'resting on a bench',
          route:[],destination:{id:bench.id,name:bench.name,shelter:false,seatId:seat.id},waitUntil:30});
        return;
      }
      const at=[inCommons,inCorridor][walkers.indexOf(local.id)];
      if(!at)return;
      local.position=[...at,composed.ground(at)];
      Object.assign(local.life,{route:[[edge+90,-1335]],destination:{id:tower.id,name:tower.name}});
    });
  });
  // A Commons town restores its residents where they stood.
  const live=createSharedWorld(commons,{now:()=>time});assert.equal(live.restore(checkpoint).ok,true);
  assert.deepEqual(live.snapshot().locals.find(local=>local.id===sitter).life.seat.id,seat.id);

  const result=recoverDistrictCommonsCheckpoint({worldData:gardens,checkpoint,now:()=>time});
  assert.equal(result.ok,true);
  assert.deepEqual(result.moved,[]);
  assert.deepEqual(result.checkpoint.payload.builds.map(item=>item.position),[at]);
  assert.deepEqual([...result.movedResidents].sort(),[...walkers].sort());
  assert.deepEqual(result.reroutedResidents,[]);
  const locals=result.checkpoint.payload.state.locals;
  for(const local of locals.filter(item=>walkers.includes(item.id))){
    assert.ok(local.position[0]<gardens.bounds_m[2]);
    assert.ok(gardensNavigation.free(local.position),`${local.id} stands on District resident ground`);
    assert.notEqual(gardensNavigation.pedestrian.classify(local.position),'road');
    assert.deepEqual(local.life.route,[]);assert.equal(local.life.destination,null);
  }
  // Nobody else moves: residents on District ground stay put, and the one on a bench stays seated.
  const saved=id=>checkpoint.payload.state.locals.find(local=>local.id===id);
  for(const local of locals.filter(item=>!walkers.includes(item.id)))assert.deepEqual(local.position,saved(local.id).position);
  const seated=locals.find(local=>local.id===sitter);
  assert.deepEqual(seated.life.seat,saved(sitter).life.seat);
  assert.deepEqual(seated.life.destination,saved(sitter).life.destination);
  const after=createSharedWorld(gardens,{now:()=>time});
  assert.equal(after.restore(result.checkpoint).ok,true);
  assert.deepEqual(after.snapshot().players,before.snapshot().players);
  assert.equal(after.snapshot().locals.find(local=>local.id===sitter).life.seat.id,seat.id);
});

test('rolling back re-plans residents on District ground who were walking into the Commons, and restarts their errands',()=>{
  let time=1000;const before=createSharedWorld(commons,{now:()=>time});
  before.join({userId:'alice',name:'Alice'});
  // A real volunteer visit: Alice asks what would help and sends a volunteer.
  const recipient=before.state.locals.find(local=>local.priority);
  for(const command of [{type:'travel',localId:recipient.id},{type:'support',localId:recipient.id,action:'ask'},
    {type:'scenario',action:'start'},{type:'support',localId:recipient.id,action:'dispatch'}]){time+=1100;assert.equal(before.command('alice',command).ok,true);}
  before.step(0.05);
  const original=before.checkpoint(),[job]=original.payload.state.jobs;
  assert.equal(job.phase,'traveling');
  const helper=job.helperId,walker=original.payload.state.locals.find(local=>!local.indoor&&!local.stationary&&!local.priority&&local.id!==helper).id;
  // Both stand on District ground west of the corridor, which Gardens keeps.
  const spots=[];
  for(let dx=18;dx<60&&spots.length<2;dx+=0.5){
    const point=[portal.from[0]-dx,portal.from[1]];
    if(composed.free(point)&&gardensNavigation.free(point)&&gardensNavigation.pedestrian.classify(point)!=='road'&&spots.every(spot=>distance(spot,point)>3))spots.push(point);
  }
  // The walker is heading for the tower lantern; the volunteer's saved route crosses into the Commons.
  const plans={[walker]:{at:spots[0],route:composed.route(spots[0],tower.position),destination:{id:tower.id,name:tower.name,shelter:false}},
    [helper]:{at:spots[1],route:composed.route(spots[1],[edge+20,portal.to[1]]),destination:{visit:true,name:recipient.name}}};
  for(const plan of Object.values(plans))assert.ok(plan.route.some(point=>point[0]>edge),'the saved route enters the Commons');
  const checkpoint=resave(original,payload=>{
    for(const local of payload.state.locals){
      const plan=plans[local.id];
      if(!plan)continue;
      local.position=[...plan.at,composed.ground(plan.at)];
      Object.assign(local.life,{route:plan.route,destination:plan.destination,waitUntil:0});
    }
  });
  assert.equal(createSharedWorld(commons,{now:()=>time}).restore(checkpoint).ok,true);

  const result=recoverDistrictCommonsCheckpoint({worldData:gardens,checkpoint,now:()=>time});
  assert.equal(result.ok,true);
  assert.deepEqual(result.movedResidents,[]);
  assert.deepEqual([...result.reroutedResidents].sort(),[walker,helper].sort());
  for(const id of [walker,helper]){
    const local=result.checkpoint.payload.state.locals.find(item=>item.id===id);
    assert.deepEqual(local.position.slice(0,2),plans[id].at,`${id} stays where it stood`);
    assert.deepEqual(local.life.route,[]);assert.equal(local.life.destination,null);
  }
  const requeued=result.checkpoint.payload.state.jobs.find(item=>item.id===job.id);
  assert.equal(requeued.phase,'queued');assert.equal(requeued.approachAttempt,0);

  // In Gardens the walker reaches a District stop and the volunteer heads out again on District ground.
  const after=createSharedWorld(gardens,{now:()=>time});
  assert.equal(after.restore(result.checkpoint).ok,true);
  const live=id=>after.state.locals.find(local=>local.id===id),visits=live(walker).life.visits;
  let seconds=0,volunteering=false;
  for(;seconds<180&&!(live(walker).life.visits>visits&&volunteering);seconds+=0.25){
    time+=250;after.step(0.25);
    const visit=after.state.jobs.find(item=>item.id===job.id);
    if(visit?.phase==='traveling'&&live(helper).life.route.length)
      volunteering=live(helper).life.route.every(point=>gardensNavigation.free(point));
  }
  assert.ok(live(walker).life.visits>visits,`the walker rested at a stop: ${live(walker).life.status} at ${live(walker).position.slice(0,2).map(value=>value.toFixed(1))}`);
  assert.ok(volunteering,'the volunteer re-planned its visit on District ground');
});

test('rolling back gives a resident who last rested at a Commons lantern their home stop again',()=>{
  const time=1000,before=createSharedWorld(commons,{now:()=>time});
  const original=before.checkpoint();
  const resident=original.payload.state.locals.find(local=>!local.indoor&&!local.stationary);
  const home={anchorId:resident.anchorId,anchorName:resident.anchorName};
  assert.notEqual(home.anchorName,tower.name);
  const checkpoint=resave(original,payload=>{
    const local=payload.state.locals.find(item=>item.id===resident.id);
    Object.assign(local,{anchorId:tower.id,anchorName:tower.name});local.persona.anchorName=tower.name;
  });
  assert.equal(createSharedWorld(commons,{now:()=>time}).restore(checkpoint).ok,true);
  const result=recoverDistrictCommonsCheckpoint({worldData:gardens,checkpoint,now:()=>time});
  assert.equal(result.ok,true);
  const local=result.checkpoint.payload.state.locals.find(item=>item.id===resident.id);
  assert.deepEqual({anchorId:local.anchorId,anchorName:local.anchorName,persona:local.persona.anchorName},{...home,persona:home.anchorName});
  const after=createSharedWorld(gardens,{now:()=>time});
  assert.equal(after.restore(result.checkpoint).ok,true);
  assert.equal(after.snapshot().locals.find(item=>item.id===resident.id).anchorName,home.anchorName);
});

test('rollback leaves residents alone when none wandered out of the District',()=>{
  const before=createSharedWorld(commons,{now:()=>1000});
  const result=recoverDistrictCommonsCheckpoint({worldData:gardens,checkpoint:before.checkpoint(),now:()=>1000});
  assert.equal(result.ok,true);assert.deepEqual(result.movedResidents,[]);assert.deepEqual(result.reroutedResidents,[]);
  assert.deepEqual(result.checkpoint.payload.state.locals,before.checkpoint().payload.state.locals);
});
