import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { createSkinnedVertexSampler } from '../src/skinned-vertex-sampler.js';

test('cloth sampling matches Three skinning across poses, parent transforms and changing morph geometry',async()=>{
  const {scene}=await loadCharacterRig('jevica'),body=scene.getObjectByName('Jevica');
  const sample=createSkinnedVertexSampler(body),actual=new THREE.Vector3(),expected=new THREE.Vector3();
  const original=body.geometry;
  for(let frame=0;frame<4;frame++) {
    scene.position.set(100+frame,3,-80);scene.rotation.y=frame*.8;scene.scale.set(1.1,1.3,.9);
    scene.getObjectByName('thigh_l').rotation.x=frame*.2;
    scene.getObjectByName('calf_r').rotation.x=-frame*.15;
    if(frame===2) {
      body.geometry=original.clone();body.geometry.morphTargetsRelative=true;
      const delta=new Float32Array(body.geometry.attributes.position.count*3);
      for(let i=0;i<delta.length;i++)delta[i]=Math.sin(i)*.01;
      body.geometry.morphAttributes.position=[new THREE.BufferAttribute(delta,3)];
      body.updateMorphTargets();body.morphTargetInfluences[0]=.6;
    }
    if(frame===3) {body.geometry.dispose();body.geometry=original;body.updateMorphTargets();}
    scene.updateMatrixWorld(true);sample.update();
    for(let index=0;index<body.geometry.attributes.position.count;index+=13) {
      sample.getVertexPosition(index,actual);body.getVertexPosition(index,expected);
      assert.ok(actual.distanceTo(expected)<1e-10,`Frame ${frame}, vertex ${index}`);
    }
  }
});

test('a sampling pass computes bone transforms once and leaves the renderer skeleton cache untouched',async()=>{
  const {scene}=await loadCharacterRig('jevica'),body=scene.getObjectByName('Jevica');
  scene.updateMatrixWorld(true);
  const sample=createSkinnedVertexSampler(body),point=new THREE.Vector3();
  const matrices=body.skeleton.boneMatrices.slice(),original=THREE.Matrix4.prototype.multiplyMatrices;
  let multiplies=0;
  THREE.Matrix4.prototype.multiplyMatrices=function(a,b){multiplies++;return original.call(this,a,b);};
  try {
    sample.update();
    for(let i=0;i<body.geometry.attributes.position.count;i++)sample.getVertexPosition(i,point);
    assert.ok(multiplies<=body.skeleton.bones.length,'Work scales with bones, not vertices');
    assert.deepEqual(body.skeleton.boneMatrices,matrices,'Sampling cannot mark the shared GPU skeleton current');
  } finally {THREE.Matrix4.prototype.multiplyMatrices=original;}
});
