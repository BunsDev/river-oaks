import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar,AVATAR_PROFILES} from '../src/avatars.js';

const point=new THREE.Vector3();
function eyes(model){const result=[];model.traverse(m=>{if(m.isSkinnedMesh&&/^brown(?:\.\d+)?$/.test(m.material.name))result.push(m);});return result;}
function vertices(mesh){mesh.skeleton.update();return Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));}

test('all seven eye rigs preserve neutral skinned positions, materials and cached geometry, with owned pivots',async()=>{
 for(const profile of [...AVATAR_PROFILES,'jevica']){
  const source=await loadCharacterRig(profile),original=eyes(source.scene)[0],positions=vertices(original);
  const avatar=instantiateAvatar(source,{targetHeight:source.height}),mesh=eyes(avatar.model)[0];
  assert.ok(avatar.eyes,'Independent eye tracking must be installed');
  assert.equal(avatar.eyes.pose.length,2);assert.notEqual(mesh.geometry,original.geometry);
  avatar.model.updateMatrixWorld(true);
  const moved=vertices(mesh);for(let i=0;i<moved.length;i++)assert.ok(moved[i].distanceTo(positions[i].clone().add(new THREE.Vector3(0,-source.floor,0)))<1e-6,`${profile} neutral vertex ${i}`);
  assert.equal(mesh.material.name,original.material.name);assert.deepEqual([...mesh.geometry.attributes.position.array],[...original.geometry.attributes.position.array]);
  avatar.dispose();
 }
});

test('eyes converge on a nearby world target independently of model scale and rotated head',async()=>{
 const source=await loadCharacterRig('woman-casual'),avatar=instantiateAvatar(source,{targetHeight:1.85}),root=new THREE.Group();root.rotation.y=1.2;root.position.set(14,3,-7);root.add(avatar.model);
 const head=avatar.model.getObjectByName('head');head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(head).x,.12));root.updateMatrixWorld(true);
 assert.ok(avatar.eyes,'Eye tracking must exist');
 const target=new THREE.Vector3(.12,1.72,2).applyMatrix4(root.matrixWorld);
 for(let i=0;i<120;i++)avatar.eyes.update(target.toArray(),1/60);
 root.updateMatrixWorld(true);
 for(const pose of avatar.eyes.pose){
  const bone=avatar.model.getObjectByName(pose.name),direction=target.clone().sub(bone.getWorldPosition(point)).normalize();
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(forward.angleTo(direction)<.01,`eye misses target: ${forward.angleTo(direction)}`);
 }
 assert.notEqual(avatar.eyes.pose[0].yaw,avatar.eyes.pose[1].yaw,'Each eye converges from its own origin');avatar.dispose();
});

test('eye motion is continuous and bounded, returns to neutral, and does not alter a second clone',async()=>{
 const source=await loadCharacterRig('man-casual'),one=instantiateAvatar(source,{targetHeight:1.8}),two=instantiateAvatar(source,{targetHeight:1.8});assert.ok(one.eyes);
 let previous=one.eyes.pose,maxStep=0;
 for(let i=0;i<90;i++){
  one.eyes.update([20,10,2],1/60);const pose=one.eyes.pose;
  pose.forEach((p,j)=>{assert.ok(Math.abs(p.yaw)<=.3+1e-8&&Math.abs(p.pitch)<=.18+1e-8);maxStep=Math.max(maxStep,Math.abs(p.yaw-previous[j].yaw),Math.abs(p.pitch-previous[j].pitch));});previous=pose;
 }
 assert.ok(maxStep<.06&&maxStep>.01);assert.ok(two.eyes.pose.every(p=>p.yaw===0&&p.pitch===0));
 const before=one.eyes.pose;for(const dt of [0,-1,NaN,Infinity,10]){one.eyes.update(null,dt);assert.deepEqual(one.eyes.pose,before);}
 for(let i=0;i<120;i++)one.eyes.update([0,1.7,-2],1/60);
 assert.ok(one.eyes.pose.every(p=>Math.abs(p.yaw)<1e-8&&Math.abs(p.pitch)<1e-8),'Targets behind the face release eye contact');
 for(let i=0;i<90;i++)one.eyes.update([.3,1.7,2],1/60);
 for(let i=0;i<120;i++)one.eyes.update(null,1/60);
 assert.ok(one.eyes.pose.every(p=>Math.abs(p.yaw)<1e-8&&Math.abs(p.pitch)<1e-8));one.dispose();two.dispose();
});

test('eye acquisition and release agree at 30, 60 and 120 Hz',async()=>{
 const source=await loadCharacterRig('woman-tailored'),traces=[];
 for(const hz of [30,60,120]){
  const avatar=instantiateAvatar(source,{targetHeight:1.7}),trace=[];
  for(let i=0;i<hz*3;i++){
   avatar.eyes.update(i<hz?[.4,1.65,2]:null,1/hz);
   if((i+1)%(hz/10)===0)trace.push(avatar.eyes.pose);
  }
  traces.push(trace);avatar.dispose();
 }
 for(let i=0;i<traces[0].length;i++)for(const trace of traces.slice(1))for(let eye=0;eye<2;eye++)for(const axis of ['yaw','pitch'])assert.ok(Math.abs(traces[0][i][eye][axis]-trace[i][eye][axis])<1e-8);
});
