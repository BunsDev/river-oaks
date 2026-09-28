import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar,AVATAR_PROFILES} from '../src/avatars.js';
import {createConversationBody} from '../src/conversation-body.js';

const point=(avatar,name)=>avatar.model.getObjectByName(name).getWorldPosition(new THREE.Vector3());
const phrase={lean:.022,turn:.02,tilt:.01,left:1,right:.85,leftBeat:.04,rightBeat:-.03};

test('conversation hands rise forward with soft elbows while planted feet and gaze stay stable on every rig',async()=>{
 for(const profile of [...AVATAR_PROFILES,'jevica','prince-jev']) {
  const avatar=instantiateAvatar(await loadCharacterRig(profile),{targetHeight:1.7}),root=new THREE.Group();root.add(avatar.model);
  root.position.set(40,2,-30);root.rotation.y=.8;root.scale.setScalar(1.2);
  const rotation=root.getWorldQuaternion(new THREE.Quaternion()),forward=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
  const hands=['l','r'].map(side=>point(avatar,`hand_${side}`)),feet=['l','r'].map(side=>point(avatar,`foot_${side}`));
  const head=avatar.model.getObjectByName('head'),gaze=head.getWorldQuaternion(new THREE.Quaternion()).normalize();
  createConversationBody(avatar).apply(phrase);
  for(const [index,side] of ['l','r'].entries()) {
   const hand=point(avatar,`hand_${side}`),travel=hand.clone().sub(hands[index]);
   assert.ok(travel.dot(forward)>.12,`${profile}/${side}: hands present toward the listener`);
   assert.ok(travel.y>.06&&travel.y<.35,`${profile}/${side}: hands lift naturally below the chest (${travel.y})`);
   const shoulder=point(avatar,`upperarm_${side}`),elbow=point(avatar,`lowerarm_${side}`);
   const flex=180-shoulder.sub(elbow).angleTo(hand.sub(elbow))*180/Math.PI;
   assert.ok(flex>35&&flex<110,`${profile}/${side}: a comfortably bent elbow (${flex})`);
   assert.ok(point(avatar,`foot_${side}`).distanceTo(feet[index])<1e-8,'Conversation never slides the feet');
  }
  const gazeDrift=head.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(gaze);
  assert.ok(gazeDrift<1e-6,`${profile}: torso movement preserves gaze (${gazeDrift})`);
  avatar.dispose();
 }
});

test('workers keep authored arm rotations for the contact solver; a neutral phrase changes nothing',async()=>{
 const avatar=instantiateAvatar(await loadCharacterRig('man-workwear'),{targetHeight:1.78}),motion=createConversationBody(avatar);
 const arms=avatar.bones.filter(b=>/arm|hand|clavicle/.test(b.name));
 const rest=arms.map(b=>b.quaternion.clone());
 motion.apply(phrase,{hands:false});
 arms.forEach((bone,i)=>assert.deepEqual(bone.quaternion.toArray(),rest[i].toArray(),'Supported hands remain owned by their task'));
 for(const [bone,q]of avatar.rest)bone.quaternion.copy(q);
 motion.apply({lean:0,turn:0,tilt:0,left:0,right:0,leftBeat:0,rightBeat:0});
 for(const [bone,q]of avatar.rest)assert.deepEqual(bone.quaternion.toArray(),q.toArray(),'Neutral does not alter the authored pose');
 avatar.dispose();
});
