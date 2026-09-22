import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { AVATAR_PROFILES, instantiateAvatar } from '../src/avatars.js';
import { createWorkerTask } from '../src/work-props.js';

for(const profile of AVATAR_PROFILES)test(`${profile}: tablet worker supports the load and taps with the other hand`,async()=>{
  const source=await loadCharacterRig(profile),avatar=instantiateAvatar(source,{targetHeight:profile.startsWith('woman')?1.64:1.75,id:'worker'});
  const holder=new THREE.Group();holder.add(avatar.model);
  const task=createWorkerTask(avatar,holder,{theme:'gallery',floor:0,fixtures:[]},{pose:'attend'});
  let touches=0,hover=0,previous=null;
  for(let frame=0;frame<=720;frame++){
    task.update(frame/60,0);holder.updateMatrixWorld(true);
    const left=task.contacts.find(c=>c.side==='l'),right=task.contacts.find(c=>c.side==='r');
    assert.equal(right.kind,'touch','right hand operates the screen');
    assert.ok(left.error<0.0001&&right.error<0.0001,'both contacts remain reachable');
    for(const side of ['l','r']){
      const hand=avatar.model.getObjectByName(`hand_${side}`),elbow=avatar.model.getObjectByName(`lowerarm_${side}`),shoulder=avatar.model.getObjectByName(`upperarm_${side}`);
      assert.ok(hand.quaternion.angleTo(avatar.rest.get(hand))<Math.PI/2,'wrist stays within a right angle of rest');
      assert.ok(elbow.getWorldPosition(new THREE.Vector3()).y<shoulder.getWorldPosition(new THREE.Vector3()).y,'elbow stays below shoulder');
    }
    const tip=task.object.worldToLocal(new THREE.Vector3(...right.actual));
    assert.ok(tip.y>=0.022-0.0001,'fingertip never enters the screen');
    if(tip.y<0.023)touches++;if(tip.y>0.04)hover++;
    if(previous)assert.ok(tip.distanceTo(previous)<0.004,'no fingertip teleport between tap positions');
    previous=tip;
    if(frame%60===0){
      avatar.model.traverse(mesh=>{
        if(!mesh.isSkinnedMesh||! /^(young|middleage|old)_/.test(mesh.material?.name??''))return;
        mesh.skeleton.update();const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
        const indices=new Set(mesh.skeleton.bones.flatMap((bone,i)=>/^(hand|thumb_0[123]|index_0[123]|middle_0[123]|ring_0[123]|pinky_0[123])_r$/.test(bone.name)?[i]:[]));
        for(let i=0;i<position.count;i++){
          let weight=0;for(let k=0;k<4;k++)if(indices.has(skinIndex.getComponent(i,k)))weight+=skinWeight.getComponent(i,k);
          if(weight<0.5)continue;
          const point=new THREE.Vector3().fromBufferAttribute(position,i);mesh.applyBoneTransform(i,point).applyMatrix4(mesh.matrixWorld);task.object.worldToLocal(point);
          if(Math.abs(point.x)<0.18&&Math.abs(point.z)<0.125)assert.ok(point.y>=0.0215,`right-hand skin enters tablet: ${point.y} at ${frame/60}s`);
        }
      });
    }
  }
  assert.ok(touches>30&&hover>30,'separate contact and lift phases');
  task.dispose();avatar.dispose();
});
