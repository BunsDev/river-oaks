import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createJevicaCarriage } from '../src/jevica-carriage.js';
import { CARRIAGE_WHEELS, fitCarriageToGround } from '../src/carriage-motion.js';

for(const [label,groundAt,distance] of [
  ['rotated',(x,z)=>Math.abs(x-(-1.78+.02))<.003?.004:0,.02],
  ['inclined',(x,z)=>-.04*x+.025*z+(Math.abs(x-(-1.78154))<.003?.004:0),0],
])test(`${label} rendered treads rest on a narrow raised road detail`,()=>{
  const carriage=createJevicaCarriage(),point=new THREE.Vector3();
  const state={position:[0,0,0],yaw:0,distance};
  fitCarriageToGround(state,groundAt,carriage.wheelTreads);
  carriage.object.position.fromArray(state.position);
  carriage.object.rotation.set(state.pitch,state.yaw,state.roll,'YXZ');
  const up=new THREE.Vector3(0,1,0).applyQuaternion(carriage.object.quaternion.clone().invert());
  carriage.wheels.forEach((wheel,i)=>{
    wheel.position.fromArray(CARRIAGE_WHEELS[i]).addScaledVector(up,state.wheelOffsets[i]);
    wheel.rotation.z=state.distance/CARRIAGE_WHEELS[i][1];
  });
  carriage.object.updateMatrixWorld(true);
  for(const wheel of carriage.wheels) {
    let gap=Infinity;
    wheel.traverse(mesh=>{
      if(!mesh.isMesh||mesh.material.name!=='Dark leather wheel treads')return;
      for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
        point.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
        gap=Math.min(gap,point.y-groundAt(point.x,point.z));
      }
    });
    assert.ok(Math.abs(gap)<.00001,`rendered tyre clearance ${gap}`);
  }
  carriage.dispose();
});

test('carriage has four grounded wheels, finite detail and a bounded render cost',()=>{
  const carriage=createJevicaCarriage();
  assert.equal(carriage.wheels.length,4);
  let triangles=0,draws=0;
  carriage.object.updateMatrixWorld(true);
  carriage.object.traverse(part=>{
    assert.ok(part.matrixWorld.elements.every(Number.isFinite));
    if(!part.isMesh)return;
    assert.ok(part.geometry.attributes.position.array.every(Number.isFinite));
    triangles+=(part.geometry.index?.count??part.geometry.attributes.position.count)/3;
    draws++;
  });
  const bounds=new THREE.Box3().setFromObject(carriage.object),size=bounds.getSize(new THREE.Vector3());
  assert.ok(size.x>5&&size.x<6.5,`length ${size.x}`);
  assert.ok(size.y>3&&size.y<4,`height ${size.y}`);
  assert.ok(size.z>2&&size.z<2.8,`width ${size.z}`);
  for(const wheel of carriage.wheels) {
    const wheelBounds=new THREE.Box3().setFromObject(wheel);
    assert.ok(Math.abs(wheelBounds.min.y)<0.002,`wheel contact ${wheelBounds.min.y}`);
  }
  assert.ok(triangles<450000,`triangle budget ${triangles}`);
  assert.ok(draws<85,`batched draw calls ${draws}`);
  carriage.dispose();
});

test('carriage instances own and release all their geometry, materials and textures once',()=>{
  const first=createJevicaCarriage(),second=createJevicaCarriage(),resources=new Set();
  first.object.traverse(part=>{
    if(!part.isMesh)return;
    resources.add(part.geometry);resources.add(part.material);
    for(const value of Object.values(part.material))if(value?.isTexture)resources.add(value);
  });
  second.object.traverse(part=>{
    if(part.isMesh)assert.ok(!resources.has(part.geometry)&&!resources.has(part.material));
  });
  let disposed=0;for(const resource of resources)resource.addEventListener('dispose',()=>disposed++);
  first.dispose();first.dispose();assert.equal(disposed,resources.size);
  assert.ok(second.object.children.length>0);second.dispose();
});
