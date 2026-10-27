import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadDistrictData } from '../../server/district-data.js';
import { createResidentNavigation } from '../src/navigation.js';
import { createResidentLife,stepResidentLife } from '../src/resident-life.js';
import { createCommunity } from '../src/community.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { buildGeometry,buildRoads,checkBuildSite } from '../src/shared-build.js';
import { newObjectPart,objectCollider } from '../src/creator-object.js';
import { COMMONS_ID,COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';

const gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const commons=await loadDistrictData({districtRevision:COMMONS_REVISION});
const edge=commons.eastGardenCommons.edge;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const walkable=(navigation,start,route)=>{
  let previous=start;
  for(const point of route){if(!navigation.canWalk(previous,point))return false;previous=point;}
  return true;
};
// Routes that main's own planner gave, captured once from main's navigation.js
// (the fixture names the commit and how to recapture). Comparing against main,
// not against this planner with and without locations, is what shows the
// District grid is unchanged.
const mainRoutes=JSON.parse(readFileSync(new URL('./fixtures/district-routes-main.json',import.meta.url),'utf8'));

test('without locations, residents and police keep main\'s District routes exactly',()=>{
  const worlds={[COMMONS_REVISION]:commons,[DISTRICT_REVISION_GARDENS]:gardens};
  for(const [revision,world] of Object.entries(worlds))
    assert.equal(digest(world),mainRoutes.worlds[revision],`${revision} geography changed since main's routes were captured: recapture them`);
  // Residents with locations still take the District grid's routes between District stops.
  const planners=new Map(),plannersFor=(revision,kind)=>{
    const world=worlds[revision],key=`${revision} ${kind}`;
    if(!planners.has(key))planners.set(key,kind==='police' ? [createResidentNavigation({...world,site_ring:null},{allowRoads:true})]
      : [createResidentNavigation(world),createResidentNavigation(world,{locations:true})]);
    return planners.get(key);
  };
  assert.equal(mainRoutes.cases.length,60);
  for(const {revision,planner,from,to,route} of mainRoutes.cases)
    for(const navigation of plannersFor(revision,planner))assert.deepEqual(navigation.route(from,to),route,`${revision} ${planner} ${from} -> ${to}`);
  const plain=createResidentNavigation(commons),composed=createResidentNavigation(commons,{locations:true});
  assert.equal(plain.locations,undefined);
  assert.equal(plain.free([edge+80,-1335]),false,'police, carriages and audits stay on the District grid');
  assert.equal(composed.free([edge+80,-1335]),true);
  // A town with nothing composed has no locations to cross into.
  assert.equal(createResidentNavigation(gardens,{locations:true}).locations,undefined);
});

test('the Commons gets its own bounded grid and a seam corridor found on open ground',()=>{
  const navigation=createResidentNavigation(commons,{locations:true});
  const {regions,portals}=navigation.locations;
  assert.deepEqual(regions.map(region=>region.id),['district',COMMONS_ID]);
  // The location is the Commons band, not the layout's District-spanning bounds.
  assert.deepEqual(regions[1].bounds.slice(0,1),[edge]);
  assert.ok((regions[1].bounds[2]-regions[1].bounds[0]+1)*(regions[1].bounds[3]-regions[1].bounds[1]+1)<=80000);
  assert.ok(portals.length>=1);
  for(const portal of portals){
    assert.ok(portal.from[0]<edge && portal.to[0]>edge,'a corridor crosses the District edge');
    assert.ok(navigation.canWalk(portal.from,portal.to) && navigation.canWalk(portal.to,portal.from));
    assert.notEqual(navigation.pedestrian.classify([(portal.from[0]+portal.to[0])/2,portal.from[1]]),'road');
    // Keep right: eastbound walkers cross south of westbound ones, a metre apart.
    const [eastIn,eastOut]=portal.eastbound,[westIn,westOut]=portal.westbound;
    assert.ok(navigation.canWalk(eastIn,eastOut)&&navigation.canWalk(westIn,westOut));
    assert.ok(eastIn[0]<edge&&eastOut[0]>edge&&westIn[0]>edge&&westOut[0]<edge);
    assert.ok(westIn[1]-eastOut[1]>=.9,`lanes ${eastOut[1]} and ${westIn[1]}`);
  }
});

test('residents route from District stops to the Commons and back on walkable legs',()=>{
  const life=createResidentLife(commons,createCommunity(commons,[],{carriage:false}));
  const lanterns=life.stops.filter(stop=>stop.id.startsWith('bayou-market-commons/'));
  assert.deepEqual(lanterns.map(stop=>stop.id),['gateway','terrace','tower'].map(name=>`bayou-market-commons/lantern-${name}`));
  for(const stop of lanterns)assert.ok(life.navigation.free(stop.position)&&stop.position[0]>edge);
  // The District stops whose residents can pick a Commons stop (among their three nearest).
  const district=life.stops.filter(stop=>!lanterns.includes(stop));
  const neighbours=district.filter(stop=>[...life.stops].filter(other=>distance(other.position,stop.position)>4)
    .sort((a,b)=>distance(a.position,stop.position)-distance(b.position,stop.position)).slice(0,3).some(other=>lanterns.includes(other)));
  assert.ok(neighbours.length>=1,'some District residents have the Commons among their nearest stops');
  for(const from of neighbours)for(const to of lanterns)for(const [a,b] of [[from,to],[to,from]]){
    const route=life.navigation.route(a.position,b.position);
    assert.ok(route,`${a.id} -> ${b.id}`);
    assert.ok(walkable(life.navigation,a.position,route),`${a.id} -> ${b.id} has an unwalkable leg`);
    assert.ok(distance(route.at(-1),b.position)<1e-9);
  }
  assert.equal(createResidentLife(gardens,createCommunity(gardens,[],{carriage:false})).stops.some(stop=>stop.id.startsWith('bayou-market-commons/')),false);
});

test('residents wander: every other outing strolls up to 60 m toward a far stop, the rest stay nearby',()=>{
  const state=createCommunity(commons,[],{carriage:false}),life=createResidentLife(commons,state);
  const local=state.locals.find(item=>!item.indoor&&!item.stationary);
  state.locals.splice(0,state.locals.length,local);
  const ranked=()=>life.stops.filter(stop=>distance(stop.position,local.position)>4)
    .sort((a,b)=>distance(a.position,local.position)-distance(b.position,local.position));
  const outing=visits=>{
    Object.assign(local.life,{visits,route:[],destination:null,waitUntil:0,attempt:0});
    for(let i=0;i<5&&!local.life.route.length;i++)stepResidentLife(life,1/60);
    return local.life.route.length ? {...local.life.destination,position:local.life.route.at(-1)} : null;
  };
  for(const visits of [0,2,4]){
    const near=ranked().slice(0,3).map(stop=>stop.id),chosen=outing(visits);
    assert.ok(near.includes(chosen.id)&&!chosen.stroll,`outing ${visits} rests at one of the three nearest stops`);
  }
  for(const visits of [1,3,5]){
    const from=local.position.slice(0,2),chosen=outing(visits);
    assert.ok(chosen,`outing ${visits} finds a route`);
    assert.ok(distance(from,chosen.position)<=68,`outing ${visits} stays within a short search (${distance(from,chosen.position).toFixed(1)} m)`);
  }
  // Strolling toward the tower lantern walks a resident from the far west of town
  // into the Commons, one short route at a time. Wander targets change every 12
  // outings; for this resident (index 0) target k is stop (13k mod n), so pick the
  // k that names the tower and keep each outing in that window a stroll.
  const n=life.stops.length,tower=life.stops.findIndex(stop=>stop.id.endsWith('lantern-tower'));
  let k=0;while((13*k)%n!==tower)k++;
  const west=life.stops.reduce((a,b)=>a.position[0]<b.position[0]?a:b);
  local.position=[...west.position,life.navigation.ground(west.position)];
  Object.assign(local.life,{visits:12*k+1,route:[],destination:null,waitUntil:0,attempt:0});
  let seconds=0;
  for(;seconds<600&&local.position[0]<=edge;seconds+=0.05){
    const before=local.position.slice(0,2),visits=local.life.visits;
    stepResidentLife(life,0.05);
    assert.ok(distance(before,local.position)<=1.4*0.05+1e-6,'walks, never teleports');
    assert.ok(life.navigation.free(local.position),'stays on walkable ground');
    // A rest ends the outing; the next one is a stroll again.
    if(local.life.visits!==visits && local.life.visits%2===0)local.life.visits++;
  }
  assert.ok(local.position[0]>edge,`strolls walk into the Commons (${(local.position[0]-edge).toFixed(1)} m from the edge after ${seconds.toFixed(0)} s)`);
  assert.ok(local.life.visits<12*(k+1),'every stroll was toward the tower');
});

test('two residents crossing the seam in opposite directions pass each other, whenever they meet',()=>{
  const portal=createResidentNavigation(commons,{locations:true}).locations.portals[0];
  const stalls=[];
  // Stagger the westbound walker so the two meet at different points of the crossing.
  for(let offset=2;offset<=24;offset+=1.5){
    const state=createCommunity(commons,[],{carriage:false}),life=createResidentLife(commons,state);
    const [east,west]=state.locals.filter(item=>!item.indoor&&!item.stationary).slice(0,2);
    state.locals.splice(0,state.locals.length,east,west);
    const tower=life.stops.find(stop=>stop.id.endsWith('lantern-tower')).position,home=[portal.from[0]-25,portal.from[1]];
    const send=(local,from,to)=>{
      local.position=[...from,life.navigation.ground(from)];
      Object.assign(local.life,{route:life.navigation.route(from,to),destination:{id:'test',name:'Test walk'},waitUntil:Infinity});
      assert.ok(local.life.route,'route found');
    };
    send(east,[portal.from[0]-6,portal.from[1]],tower);
    send(west,[portal.to[0]+offset,portal.to[1]],home);
    let closest=Infinity,crossed=false;
    for(let i=0;i<60*90&&!crossed;i++){
      stepResidentLife(life,1/60);
      closest=Math.min(closest,distance(east.position,west.position));
      crossed=east.position[0]>edge+8 && west.position[0]<portal.from[0]-2;
    }
    if(!crossed)stalls.push(`offset ${offset}: east at ${(east.position[0]-edge).toFixed(1)}, west at ${(west.position[0]-edge).toFixed(1)}`);
    assert.ok(closest>=.6,`they keep their distance: ${closest.toFixed(2)} m`);
  }
  assert.deepEqual(stalls,[],'every meeting resolves within ninety seconds');
});

test('a resident walks across the seam into the Commons without teleporting',()=>{
  const state=createCommunity(commons,[],{carriage:false}),life=createResidentLife(commons,state);
  const local=state.locals.find(item=>!item.indoor&&!item.stationary);
  state.locals.splice(0,state.locals.length,local);
  const portal=life.navigation.locations.portals[0],tower=life.stops.find(stop=>stop.id.endsWith('lantern-tower'));
  const start=[portal.from[0]-6,portal.from[1]];
  assert.ok(life.navigation.free(start));
  local.position=[...start,life.navigation.ground(start)];
  const route=life.navigation.route(start,tower.position);
  Object.assign(local.life,{route,destination:{id:tower.id,name:tower.name},waitUntil:Infinity});
  let crossed=false;
  for(let i=0;i<60*240&&!crossed;i++){
    const before=local.position.slice(0,2);
    stepResidentLife(life,1/60);
    assert.ok(life.navigation.free(local.position),'stays on walkable ground');
    assert.ok(distance(before,local.position)<=1.4/60+1e-6,'never teleports');
    crossed=local.position[0]>edge+20;
  }
  assert.ok(crossed,`reached ${local.position.map(value=>value.toFixed(1))}`);
});

test('an object built on a keep-right lane leaves residents another row to cross on',()=>{
  const portal=createResidentNavigation(commons,{locations:true}).locations.portals[0];
  const environment=createWalkingEnvironment(commons),roads=buildRoads(commons);
  const planter={kind:'object',assembly:{name:'Planter',parts:[{...newObjectPart(),size:[.4,.8,.4],position:[0,.4,0]}]}};
  for(const lane of ['eastbound','westbound']){
    const state=createCommunity(commons,[],{carriage:false}),life=createResidentLife(commons,state);
    const local=state.locals.find(item=>!item.indoor&&!item.stationary);
    state.locals.splice(0,state.locals.length,local);
    // Three metres into the lane from its District end, inside the build bounds.
    const [near,far]=portal[lane],districtEnd=near[0]<far[0]?near:far,at=[districtEnd[0]+3,districtEnd[1]];
    const site=checkBuildSite({environment,roads,position:at,kind:buildGeometry(planter),builds:[]});
    assert.ok(Number.isFinite(site.ground),`a player may build on the ${lane} lane: ${JSON.stringify(site)}`);
    life.navigation.setPlacedObjects([objectCollider({...planter,id:'planter',position:at,ground:site.ground,yaw:0})]);
    assert.equal(life.navigation.canWalk(near,far),false,`the planter blocks the ${lane} lane`);
    const tower=life.stops.find(stop=>stop.id.endsWith('lantern-tower')).position,home=[portal.from[0]-25,portal.from[1]];
    const [start,goal]=lane==='eastbound' ? [[portal.from[0]-6,portal.from[1]],tower] : [[portal.to[0]+6,portal.to[1]],home];
    local.position=[...start,life.navigation.ground(start)];
    Object.assign(local.life,{route:life.navigation.route(start,goal),destination:{id:'test',name:'Test walk'},waitUntil:Infinity});
    assert.ok(local.life.route?.length,`${lane}: route found`);
    let searches=0;const provider=life.routeProvider;
    life.routeProvider=(a,b)=>{searches++;return provider(a,b);};
    const crossed=()=>lane==='eastbound' ? local.position[0]>edge+8 : local.position[0]<portal.from[0]-2;
    for(let i=0;i<60*90&&!crossed();i++)stepResidentLife(life,1/60);
    assert.ok(crossed(),`${lane}: still ${(local.position[0]-edge).toFixed(1)} m from the edge after ninety seconds`);
    // Pacing at the planter used to take the route-search slot about once a second.
    assert.ok(searches<=2,`${lane}: ${searches} route searches`);
  }
});
