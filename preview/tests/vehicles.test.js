import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VEHICLES, drivingInput, chauffeurCommand } from '../src/vehicle-config.js';
import { createRoadVehicle } from '../src/road-vehicles.js';

test('chauffeur inputs accept only finite bounded controls and known commands',()=>{
 assert.deepEqual(drivingInput({forward:Infinity,turn:NaN,strafe:'1'}),{forward:0,turn:0,strafe:0});
 assert.deepEqual(drivingInput({forward:9,turn:-3,strafe:.2}),{forward:1,turn:-1,strafe:.2});
 assert.equal(chauffeurCommand({mode:'teleport',position:[1,2,3]}),null);
 assert.equal(chauffeurCommand({mode:'tour'}),'tour');
});
for(const kind of ['rolls','motorcycle'])test(`${kind}: model, wheels and seats use real-scale vehicle dimensions with bounded rendering`,()=>{
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

import { fitCarriageToGround, stepCarriage } from '../src/carriage-motion.js';
import { carriageContains, findCarriageParking } from '../src/carriage-parking.js';
import { readFileSync } from 'node:fs';
for(const kind of ['rolls','motorcycle'])test(`${kind}: parking, swept driving, steering tyre contact and exit envelope use its own size`,()=>{
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
 assert.equal(model.spinners.length,6);model.animate(0,4);for(let now=16;now<=1600;now+=16)model.animate(now,4);
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
