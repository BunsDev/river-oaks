import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findCarriageParking, carriageContains, carriageFootprint, vehicleCanOccupy } from '../src/carriage-parking.js';
import { stepCarriage } from '../src/carriage-motion.js';
import { VEHICLES } from '../src/vehicle-config.js';
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
test('a road vehicle drives off the road wherever its whole footprint fits, as a walker could',()=>{
  // The road's north edge is at 3.5 m; a building's south wall stands at 12 m.
  const site={...world,buildings:[{center:[0,16,0],size:[24,8,10]}]};
  const environment=createWalkingEnvironment(site),network=createPedestrianNetwork(site),front=VEHICLES.rolls.length/2;
  const drive=(people=[])=>{
    const state={vehicle:'rolls',position:[0,0,0],yaw:-Math.PI/2,pitch:0,roll:0,speed:0,distance:0,steering:0};
    const env={groundAt:environment.groundAt,canOccupy:next=>vehicleCanOccupy(next,environment,site,people)};
    for(let frame=0;frame<600;frame++)stepCarriage(state,env,{forward:1},1/60);
    return state;
  };
  const open=drive(),north=-open.position[2];
  assert.ok(north-front>3.5,`the whole car leaves the road (centre at ${north.toFixed(2)} m)`);
  assert.ok(carriageFootprint(open).every(([x,z])=>!['road','crossing'].includes(network.classify([x,-z]))&&environment.isFree(x,z)));
  assert.ok(north+front<12,'it stops at the wall, not through it');
  const held=drive([{position:[0,7,0]}]);
  assert.ok(-held.position[2]+front<7,'a person on the pavement stops it');
  assert.equal(vehicleCanOccupy(open,{...environment,roomAt:()=>({storeId:'shop'})},site),false,'never indoors');
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

test('the Ribbonwing can be called from anywhere outdoors, on foot or aloft, and sets down only on clear, level open ground',()=>{
 const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url))),environment=createWalkingEnvironment(world);
 const xs=[],zs=[];for(const road of world.roads)for(const [e,n] of road.points){xs.push(e);zs.push(-n);}
 const points=[];for(let x=Math.min(...xs);x<=Math.max(...xs);x+=24)for(let z=Math.min(...zs);z<=Math.max(...zs);z+=24)if(environment.isFree(x,z)&&!environment.roomAt(x,z))points.push([x,environment.groundAt(x,z),z]);
 assert.ok(points.length>40,`${points.length} outdoor points`);
 let road=0;
 for(const position of points) {
  if(findCarriageParking(world,{position,flying:false,altitude:0},[],1,false,'rolls'))road++;
  for(const pose of [{position,flying:false,altitude:0},{position:[position[0],position[1]+8,position[2]],flying:true,altitude:8}]) {
   const spot=findCarriageParking(world,pose,[],1,false,'hover');
   assert.ok(spot,`the Ribbonwing finds a spot from ${position.map(v=>v.toFixed(0))}${pose.flying?' aloft':''}`);
   assert.ok(Math.hypot(spot.position[0]-position[0],spot.position[2]-position[2])<=40);
   assert.ok(carriageFootprint(spot).every(([x,z])=>environment.isFree(x,z)&&!environment.roomAt(x,z)),'clear, outdoor ground under the whole craft');
   assert.ok(Math.abs(spot.pitch)<=.08&&Math.abs(spot.roll)<=.08,'level');
  }
 }
 assert.ok(road<points.length,'(road vehicles still keep to lanes, so some points have no car spot)');
 assert.equal(findCarriageParking(world,{position:points[0],flying:false,altitude:0,roomId:'shop'},[],1,false,'hover'),null,'not from indoors');
});
