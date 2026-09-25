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
