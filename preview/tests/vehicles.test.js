import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VEHICLES, drivingInput, chauffeurCommand, vehicleKind, vehicleChauffeured, riderSeat } from '../src/vehicle-config.js';
import { canopyHeightAt } from '../src/ribbonwing-design.js';
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
 // Count what renders: the Ribbonwing's distance levels are hidden behind its LOD.
 let draws=0,triangles=0;const shown=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
 for(const lod of model.object.getObjectsByProperty('isLOD',true)){lod.autoUpdate=false;lod.levels.forEach((level,i)=>{level.object.visible=i===0;});}
 model.object.traverse(o=>{if(o.isMesh){for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));if(!shown(o))return;draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
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
test('the Ribbonwing stands on three pad contacts, pilots from the left seat and its mechanisms follow accepted state',()=>{
 const spec=VEHICLES.hover,model=createRoadVehicle('hover');
 try {
  assert.equal(spec.label,'Ribbonwing');assert.equal(spec.hover,true);assert.equal(spec.flies,true);assert.equal(spec.steeredWheels,0);assert.equal(spec.seats,2);
  assert.equal(vehicleKind('hover'),'hover');assert.equal(vehicleChauffeured('hover'),false);assert.equal(vehicleChauffeured('rolls'),true);
  assert.deepEqual(riderSeat(spec),spec.driverSeat,'the landowner rides in the pilot seat');assert.ok(spec.driverSeat[2]>0&&spec.passengerSeat[2]<0,'pilot on the left, passenger on the right');
  assert.equal(spec.driverSeat[0],spec.passengerSeat[0],'side by side');
  assert.equal(model.wheels.length,3);assert.equal(model.spinners.length,0);
  for(const wheel of model.wheels){const meshes=[];wheel.traverse(m=>{if(m.isMesh)meshes.push(m);});assert.equal(meshes.length,1);assert.equal(meshes[0].material.name,'Road tyre rubber');assert.equal(meshes[0].visible,false);}
  assert.ok(model.wheelTreads.every(samples=>samples.length>50));
  const size=new THREE.Box3().setFromObject(model.ribbonwing.levels.near).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.z-spec.width)<.12,`span ${size.z}`);assert.ok(size.y>spec.height-.12&&size.y<spec.height+.05,`height ${size.y}`);
  // Mechanisms follow the state fed in: parked shut, boarding open, aloft gear up and fans at hover.
  const canopy=model.object.getObjectByName('Ribbonwing canopy'),gear=model.object.getObjectByName('Ribbonwing left foot');
  for(let now=0;now<=3000;now+=16)model.animate(now,0);
  assert.ok(Math.abs(canopy.rotation.z)<1e-9);assert.equal(model.ribbonwing.rig.value.fanRate,0,'an empty parked craft is silent');
  model.setFlightState({phase:'boarding',boarding:true});for(let now=3016;now<=6000;now+=16)model.animate(now,0);
  assert.ok(canopy.rotation.z<-1,'the canopy opens up and back for boarding');assert.ok(model.ribbonwing.rig.value.steps>.99);
  model.setFlightState({phase:'hover',boarding:false,occupied:true,altitude:6});for(let now=6016;now<=12000;now+=16)model.animate(now,0);
  assert.ok(Math.abs(canopy.rotation.z)<1e-9);assert.equal(model.ribbonwing.rig.value.steps,0);assert.ok(Math.abs(gear.rotation.x)>1.4,'the gear retracts aloft');
  const rotor=model.object.getObjectByName('Ribbonwing left fan rotor'),before=rotor.rotation.y;model.animate(12016,0);assert.ok(rotor.rotation.y!==before,'fans spin');
  // Reduced motion slows the fans to a visible crawl and dims the thruster glow, without stopping the craft.
  model.animate(12032,0,true);const slow=rotor.rotation.y;model.animate(12048,0,true);assert.ok(Math.abs(rotor.rotation.y-slow)<.11);
  model.updateSteering(.3);assert.ok(Math.abs(model.steering.rotation.x-.3*.6)<1e-9,'the side stick tilts with steering');
  assert.ok(model.object.getObjectByName('Chrome jewel glints'));
 } finally {model.dispose();assert.equal(model.object.children.length,0);}
});
test('the Ribbonwing parks on the same streets as the car with both seats inside its envelope and canopy headroom',()=>{
 const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url))),spec=VEHICLES.hover;
 const pose={position:[world.walkSpawn[0],0,-world.walkSpawn[1]],flying:false,altitude:0};
 const parked=findCarriageParking(world,pose,[],1,false,'hover');assert.ok(parked,'parking near the spawn');
 assert.equal(parked.vehicle,'hover');
 for(const seat of [spec.driverSeat,spec.passengerSeat]) {
  assert.ok(carriageContains({vehicle:'hover',position:[0,0,0],yaw:0},seat[0],seat[1],seat[2]),`seat ${seat} inside the envelope`);
  for(const [dx,dz] of [[0,0],[.1,.12],[.1,-.12],[-.1,.12],[-.1,-.12]])assert.ok(canopyHeightAt(seat[0]+dx,seat[2]+dz)>seat[1]+1,`headroom over seat ${seat}`);
 }
 assert.equal(spec.driverSeat[1]-spec.driverFloor,spec.passengerSeat[1]-spec.passengerFloor);
});

test('the Ribbonwing climbs with lift, flies level, stops under a blocked sky, respects the ceiling and lands before anyone steps out',()=>{
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
