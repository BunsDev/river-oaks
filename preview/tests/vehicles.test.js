import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VEHICLES, drivingInput, chauffeurCommand, vehicleKind } from '../src/vehicle-config.js';
import { createRoadVehicle } from '../src/road-vehicles.js';

test('chauffeur inputs accept only finite bounded controls and known commands',()=>{
 assert.deepEqual(drivingInput({forward:Infinity,turn:NaN,strafe:'1'}),{forward:0,turn:0,strafe:0});
 assert.deepEqual(drivingInput({forward:9,turn:-3,strafe:.2}),{forward:1,turn:-1,strafe:.2});
 assert.equal(chauffeurCommand({mode:'teleport',position:[1,2,3]}),null);
 assert.equal(chauffeurCommand({mode:'tour'}),'tour');
});
test('Pink Rolls-Royce has a compact four-wheel footprint and full-height cabin',()=>{
 const spec=VEHICLES.rolls,model=createRoadVehicle('rolls');
 try {
  assert.equal(model.wheels.length,4);
  assert.equal(spec.steeredWheels,2);
  assert.ok(Math.abs(spec.length-6.6*.7)<1e-9);
  assert.ok(Math.abs(spec.wheelbase-4.25*.7)<1e-9);
  const size=new THREE.Box3().setFromObject(model.object).getSize(new THREE.Vector3());
  assert.ok(size.x<4.9&&size.z<1.7&&size.y>1.8,`compact dimensions ${size.toArray()}`);
 } finally { model.dispose(); }
});
for(const kind of ['rolls','motorcycle','hover'])test(`${kind}: model, wheels and seats use real-scale vehicle dimensions with bounded rendering`,()=>{
 const model=createRoadVehicle(kind),spec=VEHICLES[kind];
 assert.equal(model.wheels.length,spec.wheels.length);
 assert.equal(model.wheelTreads.length,spec.wheels.length);
 let draws=0,triangles=0;
 model.object.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));}});
 const size=new THREE.Box3().setFromObject(model.object).getSize(new THREE.Vector3());
 assert.ok(size.x>spec.length*.9&&size.x<spec.length*1.12,`length ${size.x}`);
 assert.ok(draws<65,`${draws} draw calls`);assert.ok(triangles<130000,`${triangles} triangles`);
 assert.notDeepEqual(spec.driverSeat,spec.passengerSeat);
 assert.ok(model.wheelTreads.every(samples=>samples.length>50));
 model.dispose();assert.equal(model.object.children.length,0);
});

import { fitCarriageToGround, stepCarriage , stepHoverLift, hoverClear } from '../src/carriage-motion.js';
import { carriageContains, findCarriageParking } from '../src/carriage-parking.js';
import { readFileSync } from 'node:fs';
for(const kind of ['rolls','motorcycle','hover'])test(`${kind}: parking, swept driving, steering tyre contact and exit envelope use its own size`,()=>{
 const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url))),model=createRoadVehicle(kind);
 const pose={position:[world.walkSpawn[0],0,-world.walkSpawn[1]],flying:false,altitude:0};
 const parked=findCarriageParking(world,pose,[],1,false,kind);assert.ok(parked,'parking near the actual spawn');
 const state={...parked,position:[0,0,0],yaw:.4,scale:1,distance:2,speed:0,steering:.35};
 const ground=(x,z)=>.02*x+.013*z;
 fitCarriageToGround(state,ground,model.wheelTreads);
 model.object.position.fromArray(state.position);model.object.rotation.set(state.pitch,state.yaw,state.roll,'YXZ');
 const up=new THREE.Vector3(0,1,0).applyQuaternion(model.object.quaternion.clone().invert());
 model.wheels.forEach((wheel,i)=>{wheel.position.fromArray(model.spec.wheels[i]).addScaledVector(up,state.wheelOffsets[i]);wheel.rotation.set(0,i<model.spec.steeredWheels?state.steering:0,state.distance/model.spec.wheels[i][1],'YXZ');});
 model.object.updateMatrixWorld(true);
 for(const wheel of model.wheels){let min=Infinity;wheel.traverse(mesh=>{if(mesh.material?.name!=='Road tyre rubber')return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);min=Math.min(min,point.y-ground(point.x,point.z));}});assert.ok(Math.abs(min)<1e-5,`tyre gap ${min}`);}
 const env={groundAt:ground,wheelTreads:model.wheelTreads,canOccupy:p=>!carriageContains(p,-5,1,0,.2)};
 state.position=[0,0,0];state.yaw=0;state.steering=0;
 for(let i=0;i<300;i++)stepCarriage(state,env,{forward:1},1/60);
 assert.ok(!carriageContains(state,-5,1,0,.2),'cannot cross obstacle');
 assert.ok(Number.isFinite(state.position[1]));model.dispose();
});


test('gold wheel spinners coast independently after braking and stop animating with reduced motion',()=>{
 const model=createRoadVehicle('rolls');try{
 assert.equal(model.spinners.length,4);model.animate(0,4);for(let now=16;now<=1600;now+=16)model.animate(now,4);
 const before=model.spinners[0].rotation.z;model.animate(1680,0);assert.ok(model.spinners[0].rotation.z>before,'bearing inertia continues after vehicle stops');
 const stopped=model.spinners[0].rotation.z;model.animate(1760,0,true);assert.equal(model.spinners[0].rotation.z,stopped);
 assert.ok(model.object.getObjectByName('Royal gold jewel glints'));
 }finally{model.dispose();}
});

test('regenerated Houston streets fit two full-width Rolls vehicles outside gutters',()=>{
 const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
 for(const road of world.roads){if(['footway','pedestrian','path','steps'].includes(road.kind))continue;
 const asphalt=road.width_m-2*.6096,lane=asphalt/2;assert.ok(lane>=3.5);assert.ok(lane-VEHICLES.rolls.width>=1.3,'passing and curb clearance');assert.equal(road.mapped_width_m,6.5,'mapped baseline retained separately');
 const one={vehicle:'rolls',position:[0,0,lane/2],yaw:0},two={vehicle:'rolls',position:[0,0,-lane/2],yaw:Math.PI};
 assert.ok(!carriageContains(one,...[two.position[0],1,two.position[2]],VEHICLES.rolls.width/2),'opposing cars do not intersect');
 }
});


test('manual reverse, steering and emergency brake remain collision bounded',()=>{
 const state={vehicle:'rolls',position:[0,0,0],yaw:0,speed:0,distance:0,steering:0};
 const env={groundAt:()=>0,canOccupy:()=>true};
 for(let i=0;i<120;i++)stepCarriage(state,env,{forward:-1,turn:1},1/60);
 assert.ok(state.speed<0&&state.speed>=-1.4);assert.ok(state.position[0]>0);assert.ok(state.yaw<0);
 const position=[...state.position];stepCarriage(state,env,{brake:true},1/60);
 assert.equal(state.speed,0);assert.deepEqual(state.position,position);
 env.canOccupy=()=>false;stepCarriage(state,env,{forward:1},1/60);assert.deepEqual(state.position,position);
});
test('the plaza bicycle is a one-seat vehicle capped at 18 mph with a slower cruise',()=>{
 const spec=VEHICLES.bicycle;
 assert.equal(spec.kind,'bicycle');
 assert.equal(spec.seats,1);
 assert.ok(Math.abs(spec.maxSpeed-8.05)<1e-9,'18 mph is 8.05 m/s');
 assert.equal(spec.cruiseSpeed,5);
 assert.deepEqual(spec.passengerSeat,spec.driverSeat,'the rider sits on the saddle');
 assert.equal(spec.wheels.length,2);
 assert.equal(spec.steeredWheels,1);
 assert.equal(VEHICLES.rolls.cruiseSpeed,undefined);
 assert.equal(VEHICLES.motorcycle.cruiseSpeed,undefined);
});
test('vehicleKind accepts the bicycle and drivingInput carries sprint only as a boolean',()=>{
 assert.equal(vehicleKind('bicycle'),'bicycle');
 assert.equal(vehicleKind('scooter'),null);
 assert.deepEqual(drivingInput({forward:1,sprint:true}),{forward:1,turn:0,strafe:0,sprint:true});
 assert.deepEqual(drivingInput({forward:1,fast:true}),{forward:1,turn:0,strafe:0,sprint:true});
 assert.deepEqual(drivingInput({forward:1,sprint:'yes'}),{forward:1,turn:0,strafe:0});
});
test('the plaza bicycle is a two-wheel frame under two metres with a saddle at the spec height',()=>{
 const spec=VEHICLES.bicycle,model=createRoadVehicle('bicycle');
 try {
  assert.equal(model.wheels.length,2);
  assert.equal(model.wheelTreads.length,2);
  const size=new THREE.Box3().setFromObject(model.object).getSize(new THREE.Vector3());
  assert.ok(size.x<2 && size.x>1.5,`length ${size.x}`);
  assert.ok(size.z<.6,`width ${size.z}`);
  assert.equal(model.spinners.length,0,'a bicycle has no gold spinners');
  assert.ok(size.y>spec.driverSeat[1] && size.y<1.3,`height ${size.y}`);
  assert.ok(model.steering,'the fork steers');
  model.updateSteering(.3);
  assert.ok(Math.abs(model.steering.rotation.y-.3*.6)<1e-9,'the fork turns like the motorcycle');
 } finally {model.dispose();}
});
test('the landowner hover coach stands on unseen contact tyres, floats its pods and carries a rotor and lift light',()=>{
 const spec=VEHICLES.hover,model=createRoadVehicle('hover');
 try {
  assert.equal(spec.hover,true);assert.equal(spec.steeredWheels,0);assert.equal(spec.maxSpeed,9);
  assert.equal(vehicleKind('hover'),'hover');
  assert.equal(model.wheels.length,4);assert.equal(model.spinners.length,0);
  // Every ground contact is road rubber the ground fitter samples, and none of it is drawn.
  for(const wheel of model.wheels){const meshes=[];wheel.traverse(m=>{if(m.isMesh)meshes.push(m);});assert.equal(meshes.length,1);assert.equal(meshes[0].material.name,'Road tyre rubber');assert.equal(meshes[0].visible,false);}
  assert.ok(model.wheelTreads.every(samples=>samples.length>50));
  // The visible pods float: no paint comes within 25 cm of the ground.
  let lowestPaint=Infinity;model.object.updateMatrixWorld(true);const point=new THREE.Vector3();
  model.object.traverse(m=>{if(!m.isMesh||!m.visible||m.material.name!=='Seafoam pearl paint')return;const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);lowestPaint=Math.min(lowestPaint,point.y);}});
  assert.ok(lowestPaint>.25,`paint reaches ${lowestPaint}`);
  const size=new THREE.Box3().setFromObject(model.object).getSize(new THREE.Vector3());
  assert.ok(size.y>2.2&&size.y<spec.height,`height ${size.y}`);
  assert.ok(size.z>2.9&&size.z<3.3,`rotor span ${size.z}`);
  const rotor=model.object.getObjectByName('Hover coach rotor'),light=model.object.getObjectByName('Hover coach lift light');
  assert.ok(rotor&&light,'rotor and lift light exist');
  let lit=0;light.traverse(m=>{if(m.isMesh){lit++;assert.equal(m.castShadow,false);assert.equal(m.userData.aoExclude,true);}});assert.ok(lit>0);
  // The rotor idles when parked, spins up under way, and holds still under reduced motion.
  for(let now=0;now<=3000;now+=16)model.animate(now,0);
  const idle=rotor.rotation.y;model.animate(3016,0);const idleStep=rotor.rotation.y-idle;assert.ok(idleStep>0,'an idling rotor turns');
  for(let now=3032;now<=6000;now+=16)model.animate(now,9);
  const fast=rotor.rotation.y;model.animate(6016,9);const fastStep=rotor.rotation.y-fast;assert.ok(fastStep>idleStep*2,`under way ${fastStep} vs idle ${idleStep}`);
  for(let now=6032;now<=14000;now+=16)model.animate(now,0,true);
  const still=rotor.rotation.y;model.animate(14016,0,true);assert.ok(Math.abs(rotor.rotation.y-still)<5e-3,'reduced motion stops the rotor');
  model.updateSteering(.3);assert.ok(Math.abs(model.steering.rotation.z+.3*2.2)<1e-9,'the yoke turns like the wheel');
  assert.ok(model.object.getObjectByName('Chrome jewel glints'));
 } finally {model.dispose();assert.equal(model.object.children.length,0);}
});
test('the hover coach parks on the same streets as the car and keeps both lounge seats inside its envelope',()=>{
 const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url))),spec=VEHICLES.hover;
 const pose={position:[world.walkSpawn[0],0,-world.walkSpawn[1]],flying:false,altitude:0};
 const parked=findCarriageParking(world,pose,[],1,false,'hover');assert.ok(parked,'parking near the spawn');
 assert.equal(parked.vehicle,'hover');
 for(const seat of [spec.driverSeat,spec.passengerSeat])assert.ok(carriageContains({vehicle:'hover',position:[0,0,0],yaw:0},seat[0],seat[1],seat[2]),`seat ${seat} inside the envelope`);
 // Full-size riders in the 30% smaller hull: the skin stays below the floor under seated feet
 // (the ride pose plants them .44 m ahead of the seat, toes beyond) and above a seated head.
 const model=createRoadVehicle('hover');
 try {
  model.object.updateMatrixWorld(true);const shell=[];model.object.traverse(m=>{if(m.isMesh&&m.visible&&['Seafoam pearl paint','Hover coach tinted roof','Hover coach canopy glass'].includes(m.material.name))shell.push(m);});
  // The skin is single-sided, so the belly is met from below and the roof from above.
  const first=(origin,direction)=>new THREE.Raycaster(origin,direction).intersectObjects(shell,false)[0]?.point.y??NaN;
  const skin=(x,z)=>({top:first(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0)),bottom:first(new THREE.Vector3(x,-1,z),new THREE.Vector3(0,1,0))});
  for(const [seat,floor] of [[spec.driverSeat,spec.driverFloor],[spec.passengerSeat,spec.passengerFloor]]) {
   for(const dz of [-.12,.12]){const toes=skin(seat[0]-.7,seat[2]+dz);assert.ok(toes.bottom<floor-.04,`hull bottom ${toes.bottom} under the toes of seat ${seat}`);}
   assert.ok(skin(seat[0],seat[2]).top>seat[1]+.78,`headroom over seat ${seat}`);
  }
 } finally {model.dispose();}
 assert.notDeepEqual(spec.driverSeat,spec.passengerSeat);
 assert.equal(spec.driverSeat[1]-spec.driverFloor,spec.passengerSeat[1]-spec.passengerFloor);
});

test('the hover coach climbs with lift, flies level, stops under a blocked sky, respects the ceiling and lands before anyone steps out',()=>{
 const model=createRoadVehicle('hover'),spec=VEHICLES.hover;
 try {
  let sky=Infinity;
  const env={groundAt:()=>0,isFree:()=>true,canFly:(x,height,z)=>height<sky,flightCeiling:20,wheelTreads:model.wheelTreads,canOccupy:next=>(next.altitude??0)>.1?hoverClear(next,env):true};
  const state={vehicle:'hover',position:[0,0,0],yaw:0,speed:0,distance:0,steering:0,altitude:0};
  fitCarriageToGround(state,env.groundAt,model.wheelTreads);
  assert.ok(state.wheelOffsets.some(offset=>offset!==0)||state.wheelOffsets.every(offset=>Math.abs(offset)<1e-9),'grounded fit ran');
  assert.equal(VEHICLES.rolls.flies,undefined,'the car does not fly');
  stepHoverLift({...state,vehicle:'rolls'},env,{lift:1},1/60);
  for(let i=0;i<120;i++)stepHoverLift(state,env,{lift:1},1/60);
  assert.ok(state.altitude>2&&state.altitude<8.01,`climbing ${state.altitude}`);
  stepCarriage(state,env,{forward:1},1/60);
  assert.ok(state.position[0]<0,'flies forward');assert.equal(state.roll,0);assert.equal(state.pitch,0);assert.ok(state.wheelOffsets.every(offset=>offset===0),'nothing presses on the suspension in the air');
  assert.equal(state.position[1],0,'position stays the ground beneath; altitude is separate');
  // A roof just above the hull stops the climb where it is.
  sky=state.altitude+spec.bodyHeight+.001;const held=state.altitude;
  for(let i=0;i<60;i++)stepHoverLift(state,env,{lift:1},1/60);
  assert.ok(Math.abs(state.altitude-held)<.01,`blocked sky holds ${state.altitude} at ${held}`);
  sky=Infinity;
  for(let i=0;i<60*25;i++)stepHoverLift(state,env,{lift:1},1/60);
  assert.ok(state.altitude<=20&&state.altitude>19.5,`ceiling ${state.altitude}`);
  // Landing ignores lift and ends on the ground with the flag cleared.
  state.landing=true;
  for(let i=0;i<60*15&&state.altitude>0;i++)stepHoverLift(state,env,{lift:1},1/60);
  assert.equal(state.altitude,0);assert.equal(state.landing,false);
  fitCarriageToGround(state,env.groundAt,model.wheelTreads);
 } finally {model.dispose();}
});
