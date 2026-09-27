import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFacialMotion} from '../src/facial-motion.js';
import {instantiateAvatar,AVATAR_PROFILES} from '../src/avatars.js';
import {loadCharacterRig} from './helpers/character-rig.js';

function model() {
 const object=new THREE.Group(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));
 geometry.morphAttributes.position=[new THREE.Float32BufferAttribute([0,-.01,0],3),new THREE.Float32BufferAttribute([0,-.01,0],3)];geometry.morphTargetsRelative=true;
 for(let i=0;i<2;i++){const mesh=new THREE.Mesh(geometry);mesh.morphTargetDictionary={eyeBlinkLeft:0,eyeBlinkRight:1};object.add(mesh);}
 return object;
}

test('eyelids close completely and reopen between independently timed blinks at 30, 60 and 120 Hz',()=>{
 const traces=[];
 for(const hz of [30,60,120]){
  const face=createFacialMotion(model(),{seed:'worker'}),trace=[];let closed=0,open=0;
  for(let i=0;i<hz*20;i++){
   const pose=face.update(1/hz);assert.ok(pose.left>=0&&pose.left<=1&&pose.right>=0&&pose.right<=1);
   if(pose.left===1&&pose.right===1)closed++;if(pose.left===0&&pose.right===0)open++;
   if((i+1)%(hz/10)===0)trace.push({...pose});
  }
  assert.ok(closed>=3,'Each blink fully covers both eyes');assert.ok(open>hz*17,'Eyes stay open through quiet intervals');traces.push(trace);
 }
 for(let i=0;i<traces[0].length;i++)for(const trace of traces.slice(1))assert.ok(Math.abs(trace[i].left-traces[0][i].left)<1e-8,'Blink timing is independent of refresh rate');
 const one=createFacialMotion(model(),{seed:'a'}),two=createFacialMotion(model(),{seed:'b'});let different=false;
 for(let i=0;i<600;i++)if(Math.abs(one.update(1/60).left-two.update(1/60).left)>.5)different=true;
 assert.ok(different,'Neighbors do not blink in unison');
});

test('skin, brows and lashes share eyelid weights without mutating a cached geometry or another instance',()=>{
 const first=model(),second=first.clone(true),face=createFacialMotion(first,{seed:'person'});let moved=false;
 for(let i=0;i<500;i++){
  const pose=face.update(1/60);if(pose.left>.9)moved=true;
  for(const mesh of first.children)assert.deepEqual(mesh.morphTargetInfluences,[pose.left,pose.right]);
  for(const mesh of second.children)assert.deepEqual(mesh.morphTargetInfluences,[0,0]);
 }
 assert.ok(moved);assert.equal(first.children[0].geometry,second.children[0].geometry);
 assert.deepEqual([...first.children[0].geometry.attributes.position.array],[0,0,0]);
});

test('reduced motion and invalid or suspended time cannot produce a blink jump',()=>{
 const face=createFacialMotion(model(),{seed:'person'});let pose;
 for(let i=0;i<500;i++){pose=face.update(1/60);if(pose.left>.2)break;}
 assert.ok(pose.left>.2);const before={...pose};
 for(const dt of [0,-1,NaN,Infinity,8])assert.deepEqual(face.update(dt),before);
 const reduced=createFacialMotion(model(),{seed:'person',reducedMotion:true});
 for(let i=0;i<600;i++)assert.deepEqual(reduced.update(1/60),{left:0,right:0});
});

test('every shipped character binds its real facial meshes, including Jevica lashes, with independent instances',async()=>{
 for(const profile of [...AVATAR_PROFILES,'jevica']){
  const source=await loadCharacterRig(profile),first=instantiateAvatar(source,{targetHeight:1.7}),second=instantiateAvatar(source,{targetHeight:1.7});
  const face=createFacialMotion(first.model,{seed:profile}),bound=[];first.model.traverse(m=>{if(m.morphTargetDictionary?.eyeBlinkLeft!==undefined)bound.push(m);});
  assert.ok(bound.length>=1,profile);if(profile==='jevica')assert.ok(bound.some(m=>m.material.name==='eyelashes01'));
  let closed=false;
  for(let i=0;i<600;i++){const pose=face.update(1/60);if(pose.left===1&&pose.right===1){closed=true;break;}}
  assert.ok(closed,`${profile}: both eyes close`);
  for(const mesh of bound){assert.deepEqual(mesh.morphTargetInfluences,[1,1]);assert.ok(mesh.geometry.morphAttributes.position.every(a=>a.array.every(Number.isFinite)));}
  second.model.traverse(m=>{if(m.morphTargetDictionary?.eyeBlinkLeft!==undefined)assert.deepEqual(m.morphTargetInfluences,[0,0]);});
  first.dispose();second.dispose();
 }
});
