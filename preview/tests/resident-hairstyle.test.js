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
  const head=recipient.model.getObjectByName('head'),fitted=head.children.filter(child=>child.name==='ponytail01 (fitted)');
  assert.equal(fitted.length,1);
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
