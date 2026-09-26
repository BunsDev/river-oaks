import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findCarriageParking, carriageContains, carriageFootprint } from '../src/carriage-parking.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { createPedestrianNetwork } from '../src/pedestrian-network.js';

const world={bounds_m:[-70,-30,70,30],buildings:[],roads:[{id:'road',width_m:7,points:[[-60,0,0],[60,0,0]]}]};
const pose={position:[0,1.68,-6],ground:0,roomId:null,altitude:0,flying:false};
test('parking reserves a whole road footprint clear of pedestrians and crossings',()=>{
  const parking=findCarriageParking(world,pose),network=createPedestrianNetwork(world);
  assert.ok(parking);
  for(const [x,z] of carriageFootprint(parking))assert.equal(network.classify([x,-z]),'road');
  assert.equal(carriageContains(parking,...pose.position,1),false);
  const person={position:[parking.position[0],-parking.position[2],0]};
  const alternate=findCarriageParking(world,pose,[person]);
  assert.ok(alternate);assert.equal(carriageContains(alternate,person.position[0],.9,-person.position[1],1),false);
});
test('no carriage can be summoned indoors, in flight or without clear road space',()=>{
  for(const change of [{roomId:'shop'},{flying:true},{altitude:1}])assert.equal(findCarriageParking(world,{...pose,...change}),null);
  assert.equal(findCarriageParking({...world,roads:[]},pose),null);
  assert.equal(findCarriageParking({...world,buildings:[{center:[0,0,0],size:[60,15,10]}]},pose),null);
});
test('a parked carriage blocks walking and low flight but leaves the space above open',()=>{
  const placement={position:[0,0,0],yaw:Math.PI/2,pitch:0,roll:0};
  assert.equal(carriageContains(placement,0,1,2),true);
  assert.equal(carriageContains(placement,2,1,0),false);
  assert.equal(carriageContains(placement,0,6,0),false);
  const blockers=[{contains:(...point)=>carriageContains(placement,...point)}];
  const environment=createWalkingEnvironment(world,blockers);
  assert.equal(environment.isFree(0,0),false);
  assert.equal(environment.canFly(0,2,0),false);
  assert.equal(environment.canFly(0,6,0),true);
  blockers.length=0;assert.equal(environment.isFree(0,0),true);
});
test('the actual district has safe road parking near Jevica’s starting point',()=>{
  const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
  const environment=createWalkingEnvironment(world),[x,north]=world.walkSpawn;
  const pose={position:[x,environment.groundAt(x,-north)+1.68,-north],roomId:null,altitude:0};
  const placement=findCarriageParking(world,pose);
  assert.ok(placement,'spawn must have nearby clear parking');
  assert.ok(Math.hypot(placement.position[0]-x,placement.position[2]+north)<25);
  assert.ok(placement.terrainError<.035);
});
