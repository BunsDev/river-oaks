import test from 'node:test';import assert from 'node:assert/strict';
import {createPrinceFlight,flightSlot,stepPrinceFlight} from '../src/prince-flight.js';
import {FLIGHT_SPEED} from '../src/flight.js';
const environment={groundAt:()=>0,canFly:()=>true,isFree:()=>true,flightCeiling:32};
test('Jev accelerates smoothly, keeps up with a fast bubble and lands continuously',()=>{
 const state=createPrinceFlight([2.7,0,-.6]);let previous=[...state.position],velocity=[0,0,0];
 for(let i=0;i<1200;i++){
  const pose={position:[0,5.18,i/60*7]};stepPrinceFlight(state,flightSlot(pose,0),environment,1/60,{playerSpeed:7});
  assert.ok(Math.hypot(...state.position.map((v,k)=>v-previous[k]))<.17);
  assert.ok(Math.hypot(...state.velocity.map((v,k)=>v-velocity[k]))<.135);
  previous=[...state.position];velocity=[...state.velocity];
 }
 assert.ok(Math.abs(state.position[2]-(1199/60*7-.6))<3.2);assert.ok(state.pitch>1.1);assert.ok(state.blend>.99);
 const target=[state.position[0],0,state.position[2]+1];
 for(let i=0;i<600&&!state.landed;i++)stepPrinceFlight(state,target,environment,1/60,{landing:true});
 assert.equal(state.landed,true);assert.equal(state.position[1],0);
});
test('Jev keeps the same place beside the bubble at its fast speed as at the old 7 m/s',()=>{
 const behind={};
 for(const speed of [7,FLIGHT_SPEED.fast]) {
  const state=createPrinceFlight([2.7,0,-.6]);let velocity=[0,0,0];
  for(let i=0;i<1800;i++){
   const pose={position:[0,5.18,i/60*speed],velocity:[0,speed]};
   stepPrinceFlight(state,flightSlot(pose,0),environment,1/60,{playerSpeed:speed});
   assert.ok(Math.hypot(...state.velocity.map((v,k)=>v-velocity[k]))<.135,'acceleration stays bounded');
   velocity=[...state.velocity];behind[speed]=pose.position[2]-state.position[2];
  }
  assert.ok(Math.abs(state.velocity[2]-speed)<.05,`flies at the bubble's ${speed} m/s: ${state.velocity[2]}`);
 }
 assert.ok(Math.abs(behind[7])<2,`beside the bubble at 7 m/s: ${behind[7].toFixed(2)} m behind`);
 assert.ok(Math.abs(behind[FLIGHT_SPEED.fast]-behind[7])<.2,`and at its fast speed: ${behind[FLIGHT_SPEED.fast].toFixed(2)} m behind`);
 // Slower than 7 m/s the slot is unchanged: 0.35 s of the bubble's travel ahead.
 assert.deepEqual(flightSlot({position:[0,5.18,0],velocity:[0,4.5]},0),flightSlot({position:[0,5.18,4.5*.35]},0));
});
test('flight clearance is swept, blocks walls and never teleports through a roof',()=>{
 const state=createPrinceFlight([0,3,0]);const env={...environment,canFly:(x,y)=>x<1||y>8};
 for(let i=0;i<600;i++) {stepPrinceFlight(state,[8,3,0],env,1/60);assert.ok(state.position[0]<1||state.position[1]>8);}
 assert.ok(state.position.every(Number.isFinite));
});

test('anticipatory maneuvers bank around an obstacle and remain consistent at 30/60/120 Hz',()=>{
 const results=[];
 for(const hz of [30,60,120]) {
  const state=createPrinceFlight([0,4,0]);let previousAcceleration=[0,0,0],bank=0;
  const env={...environment,canFly:(x,y,z)=>!(x>1&&x<4&&Math.abs(z)<1.5&&y<8)};
  for(let i=0;i<hz*15;i++){
   stepPrinceFlight(state,[9,4,0],env,1/hz);
   assert.ok(env.canFly(...state.position),'No solid obstacle incursions');
   const jerk=Math.hypot(...state.acceleration.map((v,k)=>v-previousAcceleration[k]))*hz;
   assert.ok(jerk<=32.01);previousAcceleration=[...state.acceleration];bank=Math.max(bank,Math.abs(state.bank));
  }
  assert.ok(Math.hypot(state.position[0]-9,state.position[1]-4,state.position[2])<.15);assert.ok(bank>.02);results.push(state.position);
 }
 assert.ok(Math.hypot(...results[0].map((v,i)=>v-results[2][i]))<.15);
});

test('landing routes around a parked obstruction instead of freezing against it',()=>{
 const env={...environment,canFly:(x,y,z)=>!(x>1&&x<4&&Math.abs(z)<1.5&&y<2.5)};
 const state=createPrinceFlight([0,3,0]);
 for(let i=0;i<1800&&!state.landed;i++){stepPrinceFlight(state,[8,0,0],env,1/60,{landing:true});assert.ok(env.canFly(...state.position));}
 assert.equal(state.landed,true);assert.ok(Math.hypot(state.position[0]-8,state.position[2])<.1);
});

test('sensing includes the current momentum, even when the target turns away from a wall',()=>{
 const state=createPrinceFlight([0,4,0]);state.velocity=[5,0,0];
 const env={...environment,canFly:(x)=>x<1};
 stepPrinceFlight(state,[0,4,8],env,1/60);
 assert.ok(state.sensing?.rays.some(ray=>ray.kind==='momentum'&&!ray.clear),'reports the wall ahead of current velocity');
 assert.ok(state.sensing.rays.some(ray=>ray.kind==='target'&&ray.clear));
 assert.deepEqual(state.sensing.target,[0,4,8]);
});
