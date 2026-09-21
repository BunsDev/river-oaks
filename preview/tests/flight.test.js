import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightState, stepFlight } from '../src/flight.js';
import { thirdPersonPose } from '../src/third-person.js';

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
