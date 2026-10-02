import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar, AVATAR_PROFILES } from '../src/avatars.js';
import { FACE_SHAPES, residentFaceFor, bakeResidentFace } from '../src/resident-face.js';

const ids=Array.from({length:48},(_,i)=>`local-${String(i).padStart(2,'0')}`);

test('every resident gets a stable face recipe of a few moderate traits; player characters keep theirs',()=>{
  const faces=ids.map(residentFaceFor);
  assert.deepEqual(residentFaceFor('local-07'),residentFaceFor('local-07'));
  assert.ok(faces.every(face=>Object.keys(face).length>=2&&Object.keys(face).length<=14),'two to fourteen morphs each');
  assert.ok(faces.every(face=>Object.entries(face).every(([name,weight])=>FACE_SHAPES.includes(name)&&weight>=0.25&&weight<=0.7)));
  // Left/right pairs are driven together.
  assert.ok(faces.every(face=>Object.keys(face).every(name=>!/^[lr]-/.test(name)||face[name.replace(/^[lr]-/,name.startsWith('l-')?'r-':'l-')]===face[name])));
  const distinct=new Set(faces.map(face=>JSON.stringify(face)));
  assert.equal(distinct.size,faces.length,'48 residents, 48 different faces');
  assert.deepEqual(residentFaceFor('player'),{});assert.deepEqual(residentFaceFor('remote-abc'),{});
});

test('the shipped rigs carry every face shape as a morph, and baking keeps the blink pair live',async()=>{
  for(const profile of AVATAR_PROFILES){
    const rig=await loadCharacterRig(profile);
    let body;rig.scene.traverse(mesh=>{if(mesh.isSkinnedMesh&&/^(young|middleage|old)_/.test(mesh.material?.name??''))body=mesh;});
    assert.ok(body,`${profile}: body with blink morphs`);
    for(const name of FACE_SHAPES)assert.notEqual(body.morphTargetDictionary[name],undefined,`${profile}: ${name}`);
    const avatar=instantiateAvatar(rig,{targetHeight:1.7,id:'local-03',face:residentFaceFor('local-03')});
    let baked;avatar.model.traverse(mesh=>{if(mesh.isSkinnedMesh&&/^(young|middleage|old)_/.test(mesh.material?.name??''))baked=mesh;});
    assert.deepEqual(Object.keys(baked.morphTargetDictionary).sort(),['eyeBlinkLeft','eyeBlinkRight'],`${profile}: face morphs stripped, blinks kept`);
    assert.equal(baked.morphTargetInfluences.length,2);
    assert.equal(baked.geometry.morphAttributes.position.length,2);
    assert.deepEqual(avatar.model.userData.face,residentFaceFor('local-03'));
    avatar.dispose();
  }
});

test('baking changes only the face and leaves the shared template untouched',async()=>{
  const rig=await loadCharacterRig('man-casual');
  const skin=mesh=>mesh.isSkinnedMesh&&/^(young|middleage|old)_/.test(mesh.material?.name??'');
  let template;rig.scene.traverse(mesh=>{if(skin(mesh))template=mesh;});
  const before=template.geometry.attributes.position.array.slice();
  const face={'nose-hump-incr':0.6,'chin-width-incr':0.5,'l-eye-trans-out':0.4,'r-eye-trans-out':0.4};
  const a=instantiateAvatar(rig,{targetHeight:1.8,face}),b=instantiateAvatar(rig,{targetHeight:1.8});
  const bodyOf=avatar=>{let body;avatar.model.traverse(mesh=>{if(skin(mesh))body=mesh;});return body;};
  const pa=bodyOf(a).geometry.attributes.position,pb=bodyOf(b).geometry.attributes.position;
  assert.notEqual(pa,pb,'the baked avatar has its own positions');
  assert.deepEqual(template.geometry.attributes.position.array,before,'template unchanged');
  assert.equal(bodyOf(a).geometry.attributes.uv,bodyOf(b).geometry.attributes.uv,'unchanged attributes stay shared');
  assert.equal(bodyOf(b).geometry.attributes.position,template.geometry.attributes.position,'an untouched face shares its positions with the template');
  assert.deepEqual(Object.keys(bodyOf(b).morphTargetDictionary),['eyeBlinkLeft','eyeBlinkRight'],'every instance drops the idle face morphs');
  const headY=a.model.getObjectByName('head').getWorldPosition(new THREE.Vector3()).y/a.model.scale.y-a.model.position.y;
  let moved=0,movedBelowNeck=0,maxShift=0;
  for(let i=0;i<pa.count;i++){const d=Math.hypot(pa.getX(i)-pb.getX(i),pa.getY(i)-pb.getY(i),pa.getZ(i)-pb.getZ(i));if(d>1e-6){moved++;maxShift=Math.max(maxShift,d);if(pb.getY(i)<headY-0.25)movedBelowNeck++;}}
  assert.ok(moved>50&&moved<pa.count*0.3,`a face's worth of vertices moved (${moved} of ${pa.count})`);
  assert.equal(movedBelowNeck,0,'nothing below the neck moved');
  assert.ok(maxShift<0.03,`largest shift ${(maxShift*100).toFixed(1)} cm stays subtle`);
  // Both eyeballs moved with their sockets, so gaze pivots measured afterwards are right.
  let eyesA,eyesB;a.model.traverse(mesh=>{if(mesh.isSkinnedMesh&&/^brown(?:\.\d+)?$/.test(mesh.material?.name??''))eyesA=mesh;});b.model.traverse(mesh=>{if(mesh.isSkinnedMesh&&/^brown(?:\.\d+)?$/.test(mesh.material?.name??''))eyesB=mesh;});
  const ea=eyesA.geometry.attributes.position,eb=eyesB.geometry.attributes.position;let eyeMoved=0;for(let i=0;i<ea.count;i++)if(Math.abs(ea.getX(i)-eb.getX(i))>1e-5)eyeMoved++;
  assert.ok(eyeMoved>ea.count*0.5,'eye-trans-out moves the eyeballs too');
  const made=bakeResidentFace(a.model,face);assert.equal(made.length,0,'already baked: nothing left to bake');
  a.dispose();b.dispose();
});
