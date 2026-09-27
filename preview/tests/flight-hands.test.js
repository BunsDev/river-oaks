import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';import {instantiateAvatar} from '../src/avatars.js';import {createFlightHands} from '../src/flight-hands.js';
test('flight hands fit the real prince arm reach with a relaxed forward and supporting hand',async()=>{
 const rig=instantiateAvatar(await loadCharacterRig('prince-jev'),{targetHeight:1.74}),holder=new THREE.Group();holder.add(rig.model);
 const pose=createFlightHands(rig.model,holder);holder.rotation.set(1.25,.5,-.1,'YXZ');holder.position.set(10,8,-4);
 try {
  pose.update({amount:1,speed:7});
  for(const arm of pose.contacts){assert.ok(arm.error<.04,`${arm.side} palm error ${arm.error}`);assert.ok(arm.foot.quaternion.toArray().every(Number.isFinite));}
  const right=holder.worldToLocal(rig.model.getObjectByName('hand_r').getWorldPosition(new THREE.Vector3()));
  const left=holder.worldToLocal(rig.model.getObjectByName('hand_l').getWorldPosition(new THREE.Vector3()));
  assert.ok(right.y>1.8);assert.ok(left.y>1&&left.y<1.4);assert.ok(left.z>.15);
 }finally{rig.dispose();}
});
