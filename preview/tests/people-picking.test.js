import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pickPerson, withinTalkingReach } from '../src/people-picking.js';

test('talking reach follows player position, room and altitude, independent of the camera', () => {
  const local={position:[0,0,0],storeId:'cafe'},pose={position:[0,1.68,4],ground:0,altitude:0,roomId:'cafe'};
  assert.equal(withinTalkingReach(local,pose,()=>true),true);
  for(const change of [{roomId:null},{altitude:3},{position:[0,1.68,5]}])assert.equal(withinTalkingReach(local,{...pose,...change},()=>true),false);
  assert.equal(withinTalkingReach(local,pose,()=>false),false);
});
test('pointer respects opaque fixtures, hidden parents and the first person hit', () => {
  const mesh=(z,id)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());m.position.z=z;if(id)m.userData.localId=id;return m;};
  const person=mesh(0,'seated-guest'),wall=mesh(2),ray=new THREE.Raycaster(new THREE.Vector3(0,0,5),new THREE.Vector3(0,0,-1));
  assert.equal(pickPerson(ray,[person],[],()=>true),'seated-guest');
  assert.equal(pickPerson(ray,[person],[wall],()=>true),null);
  assert.equal(ray.far,Infinity);
  wall.material.transparent=true;wall.material.opacity=0.2;
  assert.equal(pickPerson(ray,[person],[wall],()=>true),'seated-guest');
  const hidden=new THREE.Group();hidden.add(person);hidden.visible=false;
  assert.equal(pickPerson(ray,[person],[],()=>true),null);
  hidden.visible=true;
  const nearer=mesh(2,'neighbor');
  assert.equal(pickPerson(ray,[person,nearer],[],id=>id==='seated-guest'),null,'cannot reach through another character');
  for(const item of [person,wall,nearer]){item.geometry.dispose();item.material.dispose();}
});
