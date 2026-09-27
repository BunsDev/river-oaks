import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { AVATAR_PROFILES, instantiateAvatar } from '../src/avatars.js';
import { createArmContacts, placePalm } from '../src/arm-contact.js';
import { fitSupportedHand } from '../src/hand-support.js';


function handVertices(model,side) {
  const result=[],point=new THREE.Vector3();
  model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||! /^(young|middleage|old)_/.test(mesh.material.name))return;
    mesh.skeleton.update();
    const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
    const bones=new Set(mesh.skeleton.bones.flatMap((bone,i)=>new RegExp(`^(hand|thumb_0[123]|index_0[123]|middle_0[123]|ring_0[123]|pinky_0[123])_${side}$`).test(bone.name)?[i]:[]));
    for(let i=0;i<position.count;i++){
      let weight=0;for(let k=0;k<4;k++)if(bones.has(skinIndex.getComponent(i,k)))weight+=skinWeight.getComponent(i,k);
      if(weight<0.5)continue;
      point.fromBufferAttribute(position,i);mesh.applyBoneTransform(i,point).applyMatrix4(mesh.matrixWorld);result.push(point.clone());
    }
  });return result;
}

for(const profile of AVATAR_PROFILES)test(`${profile}: supported hand skin clears the load without stretching fingers`,async()=>{
  const source=await loadCharacterRig(profile),avatar=instantiateAvatar(source,{targetHeight:1.72,id:'worker'}),holder=new THREE.Group();holder.add(avatar.model);
  holder.position.set(-2740,18,1200);holder.rotation.y=1.3;
  const arms=createArmContacts(avatar.model,holder),original=new Map();
  avatar.model.traverse(bone=>{if(/^(thumb|index|middle|ring|pinky)_/.test(bone.name))original.set(bone,bone.position.clone());});
  for(const arm of arms)fitSupportedHand(avatar,arm,{halfWidth:0.18,halfDepth:0.125,palmX:arm.side==='l'?0.13:-0.13,palmZ:-0.15});
  for(const roll of [-0.025,0,0.025]){
    const object=new THREE.Object3D();object.position.set(0,1.04,0.4);object.rotation.z=roll;holder.add(object);holder.updateWorldMatrix(true,true);
    for(const arm of arms){
      const side=arm.side==='l'?1:-1,point=object.localToWorld(new THREE.Vector3(side*0.13,0,-0.15));
      placePalm(arm,point,object.getWorldQuaternion(new THREE.Quaternion()),holder.localToWorld(new THREE.Vector3(side*0.48,1.03,-0.05)));
      const wristBend=arm.foot.quaternion.angleTo(avatar.rest.get(arm.foot));
      assert.ok(wristBend<Math.PI/2,`wrist folds or twists excessively: ${wristBend} radians`);
      const thumb=object.worldToLocal(avatar.model.getObjectByName(`thumb_03_${arm.side}`).getWorldPosition(new THREE.Vector3()));
      const middle=object.worldToLocal(avatar.model.getObjectByName(`middle_03_${arm.side}`).getWorldPosition(new THREE.Vector3()));
      assert.ok((thumb.x-middle.x)*side<0,'palms face up, with thumbs toward the body centre');
      const vertices=handVertices(avatar.model,arm.side).map(v=>object.worldToLocal(v));
      const under=vertices.filter(v=>Math.abs(v.x)<0.18&&Math.abs(v.z)<0.125);
      assert.ok(under.length>100,`actual hand skin lies under the support surface: ${under.length}/${vertices.length}`);
      const top=Math.max(...under.map(v=>v.y));
      assert.ok(top<=0.0001,`skin penetrates the load by ${top}m`);
      assert.ok(top>=-0.002,`skin floats below the load by ${-top}m`);
      const knuckles=['index','middle','ring','pinky'].map(finger=>object.worldToLocal(avatar.model.getObjectByName(`${finger}_03_${arm.side}`).getWorldPosition(new THREE.Vector3())));
      assert.ok(knuckles.every(v=>v.y<0),'distal finger joints remain under the load');
    }
    holder.remove(object);
  }
  for(const [bone,position] of original)assert.ok(bone.position.equals(position),'finger bone lengths are preserved');
  assert.equal(source.scene.getObjectByName('middle_01_l').quaternion.equals(avatar.model.getObjectByName('middle_01_l').quaternion),false,'grip belongs to the clone');
  avatar.dispose();
});
