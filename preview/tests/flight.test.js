import test from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT_SPEED, createFlightState, stepFlight } from '../src/flight.js';
import { thirdPersonPose } from '../src/third-person.js';
import { createWalkingEnvironment } from '../src/walking.js';

const environment={groundAt:()=>0,isFree:(x,z)=>Math.abs(x)<15&&Math.abs(z)<15,canFly:(x,y,z)=>Math.abs(x)<15&&Math.abs(z)<15&&y>=0};
const state=()=>({position:[0,1.68,0],yaw:0,pitch:0,velocity:[0,0],speed:0,distance:0});
test('flight accelerates, holds altitude, bounds ascent and returns to grounded eye height',()=>{
  const walker=state(),flight={...createFlightState(),active:true,target:3.5};
  stepFlight(walker,environment,flight,{},1/60);assert.ok(flight.altitude>0&&flight.altitude<0.01,'takeoff is smooth');
  for(let i=0;i<300;i++)stepFlight(walker,environment,flight,{},1/60);
  assert.equal(flight.altitude,3.5);assert.equal(walker.position[1],5.18);
  for(let i=0;i<1000;i++)stepFlight(walker,environment,flight,{lift:1},1/60);
  assert.ok(flight.target<=32&&flight.altitude<=32);
  flight.landing=true;flight.target=0;
  for(let i=0;i<1000&&flight.active;i++)stepFlight(walker,environment,flight,{},1/60);
  assert.equal(flight.active,false);assert.equal(walker.position[1],1.68);
});
test('the bubble cruises at 4.5 m/s and, held fast, flies at twice its old 7 m/s',()=>{
  const open={groundAt:()=>0,isFree:()=>true,canFly:()=>true};
  assert.equal(FLIGHT_SPEED.fast,2*7);
  for(const [fast,speed] of [[false,4.5],[true,14]]) {
    const walker=state(),flight={...createFlightState(),active:true,target:4,altitude:4};
    for(let i=0;i<300;i++)stepFlight(walker,open,flight,{forward:1,fast},1/60);
    assert.ok(Math.abs(walker.speed-speed)<.01,`${fast?'fast':'cruising'}: ${walker.speed}`);
  }
});
test('flight cannot leave bounds or descend through a roof',()=>{
  const walker=state(),flight={...createFlightState(),active:true,target:4,altitude:4};
  for(let i=0;i<400;i++)stepFlight(walker,environment,flight,{forward:1},1/60);
  assert.ok(walker.position[2]>-15);
  flight.landing=true;flight.target=0;
  const roof={...environment,isFree:()=>false,canFly:(x,y,z)=>y>=3};
  for(let i=0;i<400;i++)stepFlight(walker,roof,flight,{},1/60);
  assert.ok(flight.altitude>=3);assert.equal(flight.active,true);
});
test('camera boom retracts at a wall without moving the walker',()=>{
  const walker=state(),before=structuredClone(walker),wall={...environment,canFly:undefined,isFree:(x,z)=>z<1.5};
  const camera=thirdPersonPose(walker,wall);assert.ok(camera.position[2]<1.5);assert.deepEqual(walker,before);
  assert.ok(camera.position.every(Number.isFinite));
});
test('indoor camera uses room clearance instead of outdoor roof clearance',()=>{
  const walker=state(),interior={...environment,canFly:()=>false,roomAt:(x,z)=>z<3?{storeId:'boutique'}:null};
  const camera=thirdPersonPose(walker,interior);
  assert.equal(camera.showBody,true);
  assert.ok(camera.position[2]>2.8&&camera.position[2]<3,'boom stops at the room boundary');
  assert.deepEqual(walker,state());
});

test('Jevica can ascend above a tall building and fly across without descending through its roof',()=>{
  const env=createWalkingEnvironment({bounds_m:[-70,-70,70,70],buildings:[{center:[0,0,2],size:[12,12,48]}]});
  const walker={...state(),position:[0,1.68,12]},flight={...createFlightState(),active:true,target:3.5};
  for(let i=0;i<2000;i++)stepFlight(walker,env,flight,{lift:1},1/60);
  assert.ok(flight.altitude>54,'ceiling provides room above roof equipment and bubble');
  for(let i=0;i<160;i++)stepFlight(walker,env,flight,{forward:1},1/60);
  assert.ok(Math.abs(walker.position[2])<6,'flies over footprint');
  flight.landing=true;flight.target=0;walker.velocity=[0,0];
  for(let i=0;i<1800;i++)stepFlight(walker,env,flight,{},1/60);
  assert.ok(walker.position[1]-1.68>=53,'bubble remains above roof and 2.6m stair bulkhead');
  assert.equal(flight.active,true);
});

test('airborne clearance follows actual rotated roofs and includes the bubble near walls',()=>{
  const env=createWalkingEnvironment({bounds_m:[-50,-50,50,50],buildings:[{center:[0,0,2],size:[10,10,8],yaw_deg:45}]});
  assert.equal(env.canFly(0,14,0),true,'short buildings do not impose a 20m column');
  assert.equal(env.canFly(0,12,0),false,'roof equipment still has clearance');
  assert.equal(env.canFly(7.8,2,0),false,'bubble cannot clip a corner while its center is outside');
  assert.equal(env.canFly(6,2,6),true,'free space outside rotated footprint is usable');
  assert.equal(env.canFly(49,80,0),false,'bubble stays within map boundary');
});

test('airborne collision uses the rendered mapped footprint and building base elevation',()=>{
  const env=createWalkingEnvironment({bounds_m:[-50,-50,50,50],buildings:[{center:[0,0,6],size:[20,20,8],ring:[[-2,-2],[2,-2],[2,2],[-2,2]]}]});
  assert.equal(env.canFly(0,16,0),false);
  assert.equal(env.canFly(0,18,0),true);
  assert.equal(env.canFly(8,1,0),true,'does not inflate a mapped footprint to its size box');
});

for (const fast of [false,true]) for (const side of [-1,1]) for(const degrees of [0,45,90]) for(const dt of [1/144,1/30,.08]) {
  test(`flight slides along ${degrees} degree wall (${fast?'fast':'cruise'}, ${side}, dt=${dt})`,()=>{
    const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    const env=createWalkingEnvironment({bounds_m:[-80,-80,80,80],buildings:[{center:[0,0,0],size:[10,60,8],yaw_deg:degrees}]});
    const walker={...state(),position:[6.31*c,5.68,-6.31*s],yaw:angle},flight={...createFlightState(),active:true,target:4,altitude:4};
    for(let time=0;time<2;time+=dt) {
      const from=[...walker.position];
      stepFlight(walker,env,flight,{strafe:-1,forward:side,fast},dt);
      const steps=Math.max(1,Math.ceil(Math.hypot(walker.position[0]-from[0],walker.position[2]-from[2])/.15));
      for(let i=1;i<=steps;i++)assert.ok(env.canFly(from[0]+(walker.position[0]-from[0])*i/steps,flight.altitude,from[2]+(walker.position[2]-from[2])*i/steps),'entire submitted segment stays clear');
    }
    const tangent=walker.position[0]*s+walker.position[2]*c;
    assert.ok(-side*tangent>2,'tangential input continues along wall');
    assert.ok(walker.speed>.5,'reports actual sliding speed');
  });
}

test('blocked descent onto a roof does not prevent flying off its edge',()=>{
  const env=createWalkingEnvironment({bounds_m:[-50,-50,50,50],buildings:[{center:[0,0,0],size:[10,10,8]}]});
  const walker={...state(),position:[0,12.781,0]},flight={...createFlightState(),active:true,target:0,altitude:11.101,landing:true};
  for(let i=0;i<180;i++) {
    stepFlight(walker,env,flight,{strafe:1},1/60);
    assert.ok(env.canFly(walker.position[0],walker.position[1]-1.68,walker.position[2]),'roof remains solid');
  }
  assert.ok(walker.position[0]>6.3,'can fly off roof while landing');
  assert.ok(flight.altitude<11,'descends after clearing roof');
});

test('rising into a roof edge never cuts through the wall between valid endpoints',()=>{
  const env=createWalkingEnvironment({bounds_m:[-50,-50,50,50],buildings:[{center:[0,0,0],size:[10,10,8]}]});
  const walker={...state(),position:[6.31,12.68,0],velocity:[-14,0]},flight={...createFlightState(),active:true,target:20,altitude:11,verticalSpeed:3};
  const from=[...walker.position],oldAltitude=flight.altitude;
  stepFlight(walker,env,flight,{strafe:-1,fast:true},.08);
  for(let i=1;i<=8;i++) {
    const t=i/8;
    assert.ok(env.canFly(from[0]+(walker.position[0]-from[0])*t,oldAltitude+(flight.altitude-oldAltitude)*t,0),`server sweep sample ${i} remains clear`);
  }
});

for(const dt of [1/144,1/30,.08]) {
  test(`flight rounds a building corner without a swept wall crossing (dt=${dt})`,()=>{
    const env=createWalkingEnvironment({bounds_m:[-50,-50,50,50],buildings:[{center:[0,0,0],size:[10,10,8]}]});
    const walker={...state(),position:[6.31,5.68,0]},flight={...createFlightState(),active:true,target:4,altitude:4};
    for(let time=0;time<2;time+=dt) {
      const from=[...walker.position];
      stepFlight(walker,env,flight,{strafe:-1,forward:1,fast:true},dt);
      const steps=Math.max(1,Math.ceil(Math.hypot(walker.position[0]-from[0],walker.position[2]-from[2])/.15));
      for(let i=1;i<=steps;i++)assert.ok(env.canFly(from[0]+(walker.position[0]-from[0])*i/steps,4,from[2]+(walker.position[2]-from[2])*i/steps));
    }
    assert.ok(walker.position[2]<-8&&walker.position[0]<5,'continues around the corner');
  });
}

test('holding directly into a wall stops without drifting along it',()=>{
  const env=createWalkingEnvironment({bounds_m:[-50,-50,50,50],buildings:[{center:[0,0,0],size:[10,10,8]}]});
  const walker={...state(),position:[6.31,5.68,0]},flight={...createFlightState(),active:true,target:4,altitude:4};
  for(let i=0;i<120;i++)stepFlight(walker,env,flight,{strafe:-1,fast:true},1/60);
  assert.ok(walker.position[0]>=6.3);assert.equal(walker.position[2],0);assert.equal(walker.speed,0);
  for(let i=0;i<120;i++)stepFlight(walker,env,flight,{strafe:1},1/60);
  assert.ok(walker.position[0]>10,'reverse input escapes normally');
});

test('roof escape preserves clearance when underlying terrain falls away',()=>{
  const base=createWalkingEnvironment({bounds_m:[-50,-50,50,50],buildings:[{center:[0,0,0],size:[10,10,8]}]});
  const env={...base,groundAt:x=>10-.02*x};
  const walker={...state(),position:[0,12.781,0]},flight={...createFlightState(),active:true,target:0,altitude:1.101,landing:true};
  for(let i=0;i<180;i++) {
    stepFlight(walker,env,flight,{strafe:1},1/60);
    assert.ok(env.canFly(walker.position[0],walker.position[1]-1.68,walker.position[2]));
  }
  assert.ok(walker.position[0]>6.3,'flies off the roof even over falling terrain');
});

test('roof escape over steep falling terrain respects the lift budget while progressing',()=>{
  const base=createWalkingEnvironment({bounds_m:[-100,-100,100,100],buildings:[{center:[0,0,0],size:[100,20,8]}]});
  const env={...base,groundAt:x=>10-.5*x};
  const walker={...state(),position:[0,12.781,0],velocity:[14,0]},flight={...createFlightState(),active:true,target:0,altitude:1.101,landing:true};
  for(let i=0;i<60;i++) {
    const before=flight.altitude;
    stepFlight(walker,env,flight,{strafe:1,fast:true},.08);
    assert.ok(Math.abs(flight.altitude-before)<=3*.08+1e-8,'compensation stays inside normal vertical speed');
    assert.ok(env.canFly(walker.position[0],walker.position[1]-1.68,0));
  }
  assert.ok(walker.position[0]>5,'slows horizontal motion instead of sticking');
});
