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
test('clicking a posed limb refreshes both cached skinned bounds',()=>{
  const geometry=new THREE.BoxGeometry(0.4,0.4,0.4),count=geometry.attributes.position.count;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
  const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial()),bone=new THREE.Bone();
  mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));mesh.userData.localId='animated-worker';
  mesh.computeBoundingBox();mesh.computeBoundingSphere();
  bone.position.x=2;mesh.updateMatrixWorld(true);mesh.skeleton.update();
  const ray=new THREE.Raycaster(new THREE.Vector3(2,0,5),new THREE.Vector3(0,0,-1));
  assert.equal(pickPerson(ray,[mesh],[],()=>true),'animated-worker');
  mesh.skeleton.dispose();geometry.dispose();mesh.material.dispose();
});

test('storefront glass uses its rendered Fresnel opacity for person picking',async()=>{
  const {thinStorefrontGlass}=await import('../src/storefront-materials.js');
  const person=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());person.userData.localId='shop-worker';
  const glass=new THREE.InstancedMesh(new THREE.PlaneGeometry(100,100),thinStorefrontGlass(),1);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,5),new THREE.Vector3(0,0,-1));
  glass.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,0,2));
  assert.equal(glass.material.opacity,1,'shader, not the opacity field, controls the clear pane');
  assert.equal(pickPerson(ray,[person],[glass],()=>true),'shop-worker','clear glass in front of camera must not block the worker');
  glass.setMatrixAt(0,new THREE.Matrix4().makeRotationY(Math.acos(0.05)).setPosition(0,0,2));
  assert.equal(pickPerson(ray,[person],[glass],()=>true),null,'nearly edge-on glass is visually opaque');
  assert.equal(pickPerson(ray,[person],[],()=>false),null,'glass does not bypass actual talking reach');
  for(const mesh of [person,glass]){mesh.geometry.dispose();mesh.material.dispose();}
});
<<<<<<< Updated upstream

test('a visible mannequin blocks picking a person behind it',()=>{
  const person=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());person.userData.localId='shopper';
  const mannequin=new THREE.Mesh(person.geometry,person.material);mannequin.position.z=2;
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,5),new THREE.Vector3(0,0,-1));
  assert.equal(pickPerson(ray,[person,mannequin],[],()=>true),null);
  mannequin.visible=false;
  assert.equal(pickPerson(ray,[person,mannequin],[],()=>true),'shopper');
  person.geometry.dispose();person.material.dispose();
});
=======
>>>>>>> Stashed changes
