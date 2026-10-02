import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar, AVATAR_PROFILES } from '../src/avatars.js';
import { measureHead } from '../src/head-fit.js';
import { HAIRSTYLES, residentHairstyleFor, transplantHairstyle } from '../src/resident-hairstyle.js';

test('about half the residents wear another rig\'s hairstyle, never their own, stably',()=>{
  const choices=Array.from({length:48},(_,i)=>[`local-${i}`,AVATAR_PROFILES[i%6]]).map(([id,profile])=>[profile,residentHairstyleFor(id,profile)]);
  assert.ok(choices.every(([profile,donor])=>donor!==profile));
  assert.ok(choices.every(([,donor])=>donor===null||donor in HAIRSTYLES));
  const swapped=choices.filter(([,donor])=>donor).length;
  assert.ok(swapped>=16&&swapped<=32,`${swapped} of 48 swapped`);
  assert.equal(new Set(choices.map(([,donor])=>donor).filter(Boolean)).size,6,'every hairstyle is worn somewhere');
  assert.equal(residentHairstyleFor('local-7','man-casual'),residentHairstyleFor('local-7','man-casual'));
  assert.equal(residentHairstyleFor('player','jevica'),null,'rigs without a listed hairstyle are left alone');
});

test('a transplanted hairstyle replaces the rig hair and sits on the measured head',async()=>{
  const recipient=instantiateAvatar(await loadCharacterRig('man-casual'),{targetHeight:1.8});
  const donor=await loadCharacterRig('woman-daywear');
  const own=[];recipient.model.traverse(mesh=>{if(mesh.isSkinnedMesh&&/^short/.test(mesh.material.name))own.push(mesh);});
  assert.ok(own.length>0);
  const [material]=transplantHairstyle(recipient,donor);
  assert.equal(material.name,'ponytail01');
  assert.ok(own.every(mesh=>!mesh.visible),'the rig\'s own hair is hidden');
  const head=recipient.model.getObjectByName('head'),fitted=[];
  recipient.model.traverse(mesh=>{if(mesh.name==='ponytail01 (fitted)')fitted.push(mesh);});
  assert.equal(fitted.length,1);
  assert.ok(fitted[0].isSkinnedMesh,'skinned like the authored hair');
  assert.equal([...recipient.materials.values()].includes(material),true,'registered for styling and disposal');
  recipient.model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(fitted[0]),origin=head.getWorldPosition(new THREE.Vector3()),skull=measureHead(recipient).skull;
  assert.ok([box.min.x,box.min.y,box.max.x,box.max.y].every(Number.isFinite));
  // Covers the crown and stays near the head: no floating or sinking.
  assert.ok(box.max.y-origin.y>=skull.top*0.98&&box.max.y-origin.y<=skull.top*1.25,`top ${(box.max.y-origin.y).toFixed(3)} vs skull ${skull.top.toFixed(3)}`);
  assert.ok(box.max.x-box.min.x<=skull.radius*2*1.6,'no wider than the head allows');
  const geometry=fitted[0].geometry;let disposed=false;geometry.addEventListener('dispose',()=>{disposed=true;});
  recipient.dispose();assert.ok(disposed,'transplanted geometry is released with the avatar');
});

test('a transplanted ponytail bends with the neck and back instead of swinging with the skull',async()=>{
  const recipient=instantiateAvatar(await loadCharacterRig('man-casual'),{targetHeight:1.8});
  transplantHairstyle(recipient,await loadCharacterRig('woman-daywear'));
  let fitted;recipient.model.traverse(mesh=>{if(mesh.name==='ponytail01 (fitted)')fitted=mesh;});
  const world=i=>{fitted.skeleton.update();return fitted.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(fitted.geometry.attributes.position,i)).applyMatrix4(fitted.matrixWorld);};
  recipient.model.updateMatrixWorld(true);
  const count=fitted.geometry.attributes.position.count,rest=Array.from({length:count},(_,i)=>world(i));
  // The tail tip: the lowest vertex. It should be weighted mostly to the upper back.
  const tip=rest.reduce((low,p,i)=>p.y<rest[low].y?i:low,0);
  const names=fitted.skeleton.bones.map(bone=>bone.name),{skinIndex,skinWeight}=fitted.geometry.attributes;
  const tipBones=Object.fromEntries([0,1,2,3].map(k=>[names[skinIndex.getComponent(tip,k)],skinWeight.getComponent(tip,k)]));
  assert.ok((tipBones.spine_03??0)>0.5,`tail tip follows the upper back (${JSON.stringify(tipBones)})`);
  // Nod the head 0.5 rad: a point rigid on the skull would sweep through the back.
  const head=recipient.model.getObjectByName('head'),rigid=rest[tip].clone();
  head.updateMatrixWorld(true);const local=head.worldToLocal(rigid.clone());
  head.rotateX(0.5);recipient.model.updateMatrixWorld(true);
  const rigidMoved=head.localToWorld(local.clone()).distanceTo(rest[tip]),skinnedMoved=world(tip).distanceTo(rest[tip]);
  assert.ok(skinnedMoved<rigidMoved*0.5,`tip moves ${skinnedMoved.toFixed(3)} m, a rigid one ${rigidMoved.toFixed(3)} m`);
});

test('fitted hair sits exactly on its refitted position at rest',async()=>{
  const recipient=instantiateAvatar(await loadCharacterRig('woman-tailored'),{targetHeight:1.66});
  transplantHairstyle(recipient,await loadCharacterRig('man-workwear'));
  let fitted;recipient.model.traverse(mesh=>{if(mesh.name==='short02 (fitted)')fitted=mesh;});
  recipient.model.updateMatrixWorld(true);fitted.skeleton.update();
  const head=recipient.model.getObjectByName('head').getWorldPosition(new THREE.Vector3()),skull=measureHead(recipient).skull;
  let top=-Infinity;
  for(let i=0;i<fitted.geometry.attributes.position.count;i++){const p=fitted.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(fitted.geometry.attributes.position,i)).applyMatrix4(fitted.matrixWorld);top=Math.max(top,p.y-head.y);}
  // Short hair caps the skull: its top sits just above the measured crown, not floating or sunk.
  assert.ok(top>=skull.top*0.99&&top<=skull.top*1.2,`top ${top.toFixed(3)} vs skull ${skull.top.toFixed(3)}`);
});
