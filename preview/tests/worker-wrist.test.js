import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { AVATAR_PROFILES, instantiateAvatar } from '../src/avatars.js';
import { createWorkerTask } from '../src/work-props.js';

for(const profile of AVATAR_PROFILES)test(`${profile}: carrying a tray does not kink the wrists sideways`,async()=>{
  const source=await loadCharacterRig(profile);
  for(const targetHeight of profile.startsWith('woman')?[1.64,1.715]:[1.75,1.84]){
  const avatar=instantiateAvatar(source,{targetHeight,id:'worker'}),holder=new THREE.Group();holder.add(avatar.model);
  const task=createWorkerTask(avatar,holder,{theme:'dining',floor:0,fixtures:[]},{pose:'carry'});
  const spine=avatar.model.getObjectByName('spine_03'),rest=spine.quaternion.clone();
  for(const turn of [-0.2,0,0.2]){
    spine.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),turn));
    task.update(6,1);holder.updateMatrixWorld(true);
    for(const side of ['l','r']){
      const wrist=avatar.model.getObjectByName(`hand_${side}`).getWorldPosition(new THREE.Vector3());
      const elbow=avatar.model.getObjectByName(`lowerarm_${side}`).getWorldPosition(new THREE.Vector3());
      const finger=avatar.model.getObjectByName(`middle_01_${side}`).getWorldPosition(new THREE.Vector3());
      const forearm=wrist.clone().sub(elbow),palm=finger.clone().sub(wrist);
      forearm.y=palm.y=0;
      const deviation=forearm.angleTo(palm);
      assert.ok(deviation<THREE.MathUtils.degToRad(20),`${side}: sideways wrist bend ${THREE.MathUtils.radToDeg(deviation)} degrees`);
    }
    assert.ok(task.contacts.every(contact=>contact.error<0.00001),'angled hands still support the load');
    assert.ok(task.object.quaternion.angleTo(new THREE.Quaternion())<1e-6,'loaded tray stays level');
  }
  task.dispose();avatar.dispose();
  }
});
