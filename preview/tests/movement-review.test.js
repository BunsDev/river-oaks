import test from 'node:test';
import assert from 'node:assert/strict';
import {createBird, stepBird, BIRD_FLIGHT} from '../src/bird-cams.js';
import {createCompanionNavigation} from '../src/companion-navigation.js';
import {builderTarget} from '../src/builder-mode.js';
const open={groundAt:()=>0,canFly:()=>true,flightCeiling:40,bounds:[-200,-200,200,200]};
test('bird vertical motion has bounded speed and acceleration across changing roof clearance',()=>{
 const bird=createBird({id:'dove'},[0,15,0]); bird.mode='manual';let velocity=0;
 for(let i=0;i<180;i++){
  const y=bird.position[1];stepBird(bird,1/60,{environment:open,control:{climb:i<90?1:-1}});
  const next=(bird.position[1]-y)*60;
  assert.ok(Math.abs(next)<=BIRD_FLIGHT.climbRate+1e-7,`vertical speed ${next}`);
  assert.ok(Math.abs(next-velocity)*60<=6.001,`vertical acceleration ${(next-velocity)*60}`);velocity=next;
 }
});
test('a bird follows optional hint nodes before approaching its interest; manual flight ignores them',()=>{
 const interest={id:'grove',position:[0,80],weight:1};
 const pathHints={grove:[[20,15,0],[20,15,-60]]};
 const bird=createBird({id:'dove'},[0,15,0],-Math.PI/2);
 let reached=false;
 for(let i=0;i<600;i++){stepBird(bird,1/60,{environment:open,interests:[interest],pathHints,now:i*1000/60,random:()=>.5});if(Math.hypot(bird.position[0]-20,bird.position[2])<3)reached=true;}
 assert.ok(reached,'routes through the first authored node');
 const manual=createBird({id:'jay'},[0,15,0]);manual.mode='manual';
 stepBird(manual,1/60,{environment:open,pathHints,interests:[interest],control:{}});assert.equal(manual.heading,0);
});
test('companion routes avoid fallback tree trunks even without LiDAR branch supports',()=>{
 const world={scene:'district',bounds_m:[-10,-10,10,10],buildings:[],stores:[],roads:[],trees:[{position:[0,0,0],height_m:10,crown_radius_m:3}]};
 const nav=createCompanionNavigation(world);assert.equal(nav.canTravel([-3,0],[3,0]),false);
 const route=nav.route([-3,0],[3,0]);assert.ok(route?.length);let from=[-3,0];for(const to of route){assert.ok(nav.canTravel(from,to));from=to;}
});
test('builder coarse snapping remains within server reach at every angle',()=>{
 const pose={position:[.23,1.6,-.17],yaw:0,ground:0};
 for(let i=0;i<100;i++){
  const a=i/100*Math.PI*2;
  const target=builderTarget(pose,{origin:pose.position,direction:[Math.cos(a),-.01,Math.sin(a)]},{grid:1});
  assert.ok(target.every(v=>Math.abs(v-Math.round(v))<1e-8),'snaps to chosen grid');
  assert.ok(Math.hypot(target[0]-.23,target[1]-.17)<=3.6,'stays within reach after rounding');
 }
});

test('tree-aware flight avoids solid stems without making foliage or players impassable',async()=>{
 const {treeFlightEnvironment}=await import('../src/tree-flight.js');
 const env=treeFlightEnvironment(open,{trees:[{position:[2,3],height_m:10}]});
 assert.equal(env.canFly(2,5,-3),false);assert.equal(env.canFly(2,12,-3),true);
 assert.equal(env.canFly(3,8,-3),true);assert.equal(open.canFly(2,5,-3),true);
 const bird=createBird({id:'dove'},[2,5,0]);bird.mode='manual';
 for(let i=0;i<180;i++){stepBird(bird,1/30,{environment:env,control:{}});assert.ok(env.canFly(...bird.position));}
});
test('placement coordinates round-trip into an indoor room frame',async()=>{
 const {placementCoordinate}=await import('../src/placement-coordinate.js');
 const room={storeId:'test',toLocal:(x,n)=>[n-10,20-x]};
 assert.deepEqual(placementCoordinate({...open,roomAt:()=>room},18,-13),{position:[18,13],ground:0,storeId:'test',local:[3,2]});
 assert.deepEqual(placementCoordinate(open,18,-13),{position:[18,13],ground:0});
});
test('busy interest scenes retain stable targeting and bounded collision queries',()=>{
 const interests=Array.from({length:500},(_,i)=>({id:`local-${i}`,position:[20+i%40,40+i%50],weight:1}));
 let queries=0;const env={...open,canFly:()=>{queries++;return true;}};
 const bird=createBird({id:'dove'},[0,15,0]);let id;
 for(let i=0;i<600;i++){
  stepBird(bird,1/60,{environment:env,interests,now:i*1000/60,random:()=>.5});
  id??=bird.target.id;assert.equal(bird.target.id,id);assert.ok(bird.position.every(Number.isFinite));
 }
 assert.ok(queries<=600*32,`bounded corridor probes, not per resident: ${queries}`);
 const busyQueries=queries;queries=0;
 const single=createBird({id:'dove'},[0,15,0]);
 for(let i=0;i<600;i++)stepBird(single,1/60,{environment:env,interests:[interests[0]],now:i*1000/60,random:()=>.5});
 assert.equal(queries,busyQueries,'500 interests cost the same collision queries as one');
});

test('birds climb past a narrow stem that lies between sparse lookahead points',()=>{
 const environment={...open,canFly:(x,y,z)=>!(Math.abs(x-2.25)<.6&&Math.abs(z)<.6&&y<8)};
 const bird=createBird({id:'dove'},[0,5,0],-Math.PI/2);bird.mode='manual';
 for(let i=0;i<600;i++){
  stepBird(bird,1/60,{environment,control:{}});
  assert.ok(environment.canFly(...bird.position),'remains outside the stem');
 }
 assert.ok(bird.position[0]>5,'clears the stem instead of holding forever');
});

test('tree flight clearance uses a finite fallback height for incomplete tree metadata',async()=>{
 const {treeFlightEnvironment}=await import('../src/tree-flight.js');
 const environment=treeFlightEnvironment(open,{trees:[{position:[2,3]}]});
 assert.equal(environment.canFly(2,5,-3),false);
 assert.equal(environment.canFly(2,18,-3),true);
});

test('close lateral hint nodes remain reachable at the existing turn-rate limit',()=>{
 for(const side of [-1,1]){
  const bird=createBird({id:'dove'},[0,15,0]);let reached=false;
  for(let i=0;i<1800;i++){stepBird(bird,1/60,{environment:open,interests:[{id:'grove',position:[0,80],weight:1}],pathHints:{grove:[[side*5,15,0]]},now:i*1000/60,random:()=>.5});reached ||= bird.hintIndex>=1;}
  assert.ok(reached,'does not circle a close hint forever');
 }
});

test('swept grazing contact initiates a bounded climb even between lookahead samples',async()=>{
 const {treeFlightEnvironment}=await import('../src/tree-flight.js');
 const environment=treeFlightEnvironment(open,{trees:[{position:[.53,.25],height_m:10}]});
 const bird=createBird({id:'dove'},[0,5,0]);bird.mode='manual';
 for(let i=0;i<600;i++){
  stepBird(bird,1/60,{environment,control:{}});
  assert.ok(environment.canFly(...bird.position));
 }
 assert.ok(bird.position[2]<-2,'clears grazing contact instead of stalling');
});
