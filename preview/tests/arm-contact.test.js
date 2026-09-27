import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { AVATAR_PROFILES } from '../src/avatars.js';
import { relaxResidentArms } from '../src/avatar-stance.js';
import { createArmContacts, placePalm } from '../src/arm-contact.js';

function rig(profile) {
  const bytes=readFileSync(new URL(`../public/assets/characters/${profile}.glb`,import.meta.url));
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const nodes=gltf.nodes.map(node=>{
    const object=new THREE.Object3D();object.name=node.name??'';
    if(node.translation)object.position.fromArray(node.translation);
    if(node.rotation)object.quaternion.fromArray(node.rotation);
    if(node.scale)object.scale.fromArray(node.scale);
    if(node.matrix){object.matrix.fromArray(node.matrix);object.matrix.decompose(object.position,object.quaternion,object.scale);}
    return object;
  });
  gltf.nodes.forEach((node,i)=>node.children?.forEach(child=>nodes[i].add(nodes[child])));
  const model=new THREE.Group();gltf.scenes[gltf.scene??0].nodes.forEach(i=>model.add(nodes[i]));
  relaxResidentArms(model);return model;
}

for(const profile of AVATAR_PROFILES)test(`${profile}: palms remain on a held object through turns and torso motion`,()=>{
  const model=rig(profile),holder=new THREE.Group();holder.add(model);
  holder.position.set(-2740,18,1200);holder.rotation.y=1.3;model.scale.setScalar(1.02);
  const arms=createArmContacts(model,holder),spine=model.getObjectByName('spine_03'),rest=spine.quaternion.clone();
  const feet=['foot_l','foot_r'].map(name=>model.getObjectByName(name).getWorldPosition(new THREE.Vector3()));
  for(let frame=0;frame<=90;frame++) {
    spine.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.sin(frame/20)*0.2));
    holder.updateWorldMatrix(true,true);
    for(const arm of arms) {
      const side=arm.side==='l'?1:-1;
      const point=holder.localToWorld(new THREE.Vector3(side*0.13,1.04+Math.sin(frame/30)*0.035,0.30));
      const pole=holder.localToWorld(new THREE.Vector3(side*0.48,1.03,-0.05));
      const actual=placePalm(arm,point,holder.getWorldQuaternion(new THREE.Quaternion()),pole);
      assert.ok(actual.distanceTo(point)<0.00001,`${arm.side}: contact error ${arm.error}`);
      assert.ok(Math.abs(arm.thigh.getWorldPosition(new THREE.Vector3()).distanceTo(arm.calf.getWorldPosition(new THREE.Vector3()))-arm.upperLength)<0.00001,'upper arm does not stretch');
      assert.ok(Math.abs(arm.calf.getWorldPosition(new THREE.Vector3()).distanceTo(arm.foot.getWorldPosition(new THREE.Vector3()))-arm.lowerLength)<0.00001,'forearm does not stretch');
    }
  }
  ['foot_l','foot_r'].forEach((name,i)=>assert.ok(model.getObjectByName(name).getWorldPosition(new THREE.Vector3()).distanceTo(feet[i])<1e-8,'contact does not move the feet'));
});
