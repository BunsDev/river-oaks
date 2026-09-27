import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWishVisual } from '../src/wish-effects.js';
function setup() {
  const holder=new THREE.Group(),model=new THREE.Group();holder.add(model);holder.position.y=2;
  const skin=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());skin.material.name='young_skin';
  const clothes=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());clothes.material.name='shirt';model.add(skin,clothes);
  const effects=createWishVisual(holder,model);
  return {holder,model,skin,clothes,effects};
}
test('invisibility hides skin but keeps clothing and restores original visibility',()=>{
  const {skin,clothes,effects}=setup();effects.update({kind:'invisibility',age:4,phase:'gift'});
  assert.equal(skin.visible,false);assert.equal(clothes.visible,true);
  effects.update(null);assert.equal(skin.visible,true);effects.dispose();
});
test('flight rises without accumulating offsets and lands when revoked',()=>{
  const {holder,effects}=setup();
  for(let i=0;i<120;i++)effects.update({kind:'flight',age:5,phase:'trouble'});
  assert.ok(holder.position.y>4&&holder.position.y<6);
  effects.update(null);assert.equal(holder.position.y,2);effects.dispose();
});
test('dog replaces the body, egg hatches into a dragon, and disposal restores resident',()=>{
  const {holder,model,effects}=setup();effects.update({kind:'dog',age:12,phase:'trouble'});assert.equal(model.visible,false);
  effects.update({kind:'dragon',age:2,phase:'gift'});assert.equal(model.visible,true);
  assert.equal(holder.getObjectByName('Wish egg').visible,true);assert.equal(holder.getObjectByName('Wish dragon').visible,false);
  effects.update({kind:'dragon',age:15,phase:'trouble'});
  assert.equal(holder.getObjectByName('Wish egg').visible,false);assert.equal(holder.getObjectByName('Wish dragon').visible,true);
  holder.traverse(item=>{if(item.isMesh)assert.ok(item.geometry.attributes.position.array.every(Number.isFinite));});
  effects.dispose();assert.equal(holder.children.length,1);assert.equal(model.visible,true);
});

test('dragon has grounded clawed feet, textured skin and a bounded bat-wing silhouette',()=>{
  const {holder,effects}=setup();holder.userData.localId='maya';
  effects.update({kind:'dragon',age:15,phase:'trouble'});
  const dragon=holder.getObjectByName('Wish dragon');
  const feet=[];dragon.traverse(item=>{if(item.name.startsWith('Dragon foot '))feet.push(item);});
  assert.equal(feet.length,4,'four independently grounded feet');
  let meshes=0,triangles=0,textured=false;
  dragon.traverse(item=>{
    if(!item.isMesh)return;
    meshes++;triangles+=(item.geometry.index?.count??item.geometry.attributes.position.count)/3;
    assert.equal(item.userData.localId,'maya');
    assert.ok(item.geometry.attributes.position.array.every(Number.isFinite));
    assert.ok(item.geometry.attributes.normal.array.every(Number.isFinite));
    if(item.material.normalMap||item.material.bumpMap)textured=true;
  });
  assert.ok(textured,'skin carries scale relief');
  assert.ok(meshes<=32,`bounded draw calls: ${meshes}`);
  assert.ok(triangles<90000,`bounded geometry: ${triangles}`);
  const tail=dragon.getObjectByName('Dragon tail').children.find(item=>item.isMesh&&item.material.name==='Dragon moss scales');
  let volume=0;
  const vertices=tail.geometry.attributes.position;
  for(let i=0;i<vertices.count;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(vertices,i),b=new THREE.Vector3().fromBufferAttribute(vertices,i+1),c=new THREE.Vector3().fromBufferAttribute(vertices,i+2);
    volume+=a.dot(b.cross(c))/6;
  }
  assert.ok(volume>0,'tapered skin faces outward instead of disappearing under back-face culling');
  holder.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(dragon),size=bounds.getSize(new THREE.Vector3());
  assert.ok(size.x<3&&size.z<3.4&&size.y<2.2,`district footprint: ${size.toArray()}`);
  const soles=feet.map(foot=>new THREE.Box3().setFromObject(foot).min.y);
  for(let step=0;step<60;step++){
    effects.update({kind:'dragon',age:15+step/10,phase:'trouble'});holder.updateMatrixWorld(true);
    feet.forEach((foot,i)=>assert.ok(Math.abs(new THREE.Box3().setFromObject(foot).min.y-soles[i])<1e-6,'breathing never lifts or sinks feet'));
  }
  soles.forEach(y=>assert.ok(Math.abs(y-holder.position.y)<0.015,`foot touches ground: ${y}`));
  effects.dispose();
});

test('dragon reduced motion freezes its pose and undo disposes each shared resource once',()=>{
  const {holder,effects}=setup();
  effects.update({kind:'dragon',age:15,phase:'trouble'},{reducedMotion:true});
  const dragon=holder.getObjectByName('Wish dragon'),resources=new Set();
  dragon.traverse(item=>{
    if(!item.isMesh)return;
    resources.add(item.geometry);resources.add(item.material);
    for(const value of Object.values(item.material))if(value?.isTexture)resources.add(value);
  });
  holder.updateMatrixWorld(true);
  const matrices=[];dragon.traverse(item=>matrices.push(item.matrixWorld.toArray()));
  effects.update({kind:'dragon',age:30,phase:'pleading'},{reducedMotion:true});holder.updateMatrixWorld(true);
  const after=[];dragon.traverse(item=>after.push(item.matrixWorld.toArray()));
  assert.deepEqual(after,matrices);
  const disposed=new Map([...resources].map(resource=>[resource,0]));
  for(const resource of resources)resource.addEventListener('dispose',()=>disposed.set(resource,disposed.get(resource)+1));
  effects.update(null);
  assert.ok(resources.size>5);
  for(const count of disposed.values())assert.equal(count,1);
  assert.equal(holder.getObjectByName('Wish dragon'),undefined);
  effects.dispose();
});
