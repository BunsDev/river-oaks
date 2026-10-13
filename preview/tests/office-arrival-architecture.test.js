import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildOfficeArrival } from '../src/office-arrival-architecture.js';
import { ARRIVAL, arrivalFrame } from '../src/office-arrival-model.js';

function canvas(t,{failAt=Infinity}={}){
 const previous=globalThis.document;let created=0;
 globalThis.document={createElement(){created++;return {getContext:()=>created===failAt?null:{fillRect(){},fillText(){}}};}};
 t.after(()=>{globalThis.document=previous;});
}
test('both lift portals open only for their landing and clear the office wall trim',t=>{
 canvas(t);const lift=buildOfficeArrival();t.after(()=>lift.dispose());
 assert.ok(lift.frontDoors.every(d=>d.position.z-d.scale.z/2>.18));
 for(const [time,rear,front]of [[0,true,false],[6,false,false],[ARRIVAL.openingEnd,false,true]]){
  lift.update(arrivalFrame(time));
  for(const[doors,open]of [[lift.rearDoors,rear],[lift.frontDoors,front]]){
   const inner=doors[1].position.x-doors[1].scale.x/2;
   assert.equal(inner>ARRIVAL.doorWidth/2,open);
  }
 }
});
test('arrival teardown releases instance buffers, shared geometry and label textures once',t=>{
 canvas(t);const lift=buildOfficeArrival(),resources=new Set(),counts=new Map();
 lift.object.traverse(n=>{if(n.isInstancedMesh)resources.add(n);if(n.geometry)resources.add(n.geometry);if(n.material){resources.add(n.material);if(n.material.map)resources.add(n.material.map);}});
 for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,(counts.get(r)??0)+1));
 lift.dispose();lift.dispose();assert.equal(lift.object.children.length,0);
 for(const r of resources)assert.equal(counts.get(r),1,r.type);
});
test('shared lobby returns meet the portal back without coplanar front faces',t=>{
 canvas(t);const lift=buildOfficeArrival({facade:false});t.after(()=>lift.dispose());
 const matrix=new THREE.Matrix4(),bounds=new THREE.Box3(),unit=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5));
 const returns=[];
 lift.object.traverse(n=>{if(!n.isInstancedMesh)return;for(let i=0;i<n.count;i++){
  n.getMatrixAt(i,matrix);bounds.copy(unit).applyMatrix4(matrix);
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  if(size.z>4&&((Math.abs(center.x)>2.5&&center.y<3)||center.y>4.4))returns.push(bounds.clone());
 }});
 assert.equal(returns.length,5,'two returns, two skirting boards and the ceiling');
 for(const box of returns){assert.ok(Math.abs(box.min.z-4)<1e-6);assert.ok(box.max.z<=ARRIVAL.facadeOffset-1.3+1e-6);}
});
test('a label construction failure releases resources created before the error',t=>{
 canvas(t,{failAt:2});const counts={geometry:0,material:0,texture:0};
 for(const[kind,prototype]of [['geometry',THREE.BufferGeometry.prototype],['material',THREE.Material.prototype],['texture',THREE.Texture.prototype]]){
  const original=prototype.dispose;t.mock.method(prototype,'dispose',function(){counts[kind]++;return original.call(this);});
 }
 assert.throws(()=>buildOfficeArrival(),TypeError);
 assert.ok(counts.geometry>=2);assert.ok(counts.material>=8);assert.equal(counts.texture,2);
});
