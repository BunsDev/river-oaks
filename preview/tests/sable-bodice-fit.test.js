import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { fitCharacterBodice } from '../src/character-bodice-fit.js';

test('Sable side panels clear the shipped torso without changing cached skin or garment topology',async()=>{
  const {scene}=await loadCharacterRig('jevica'),body=scene.getObjectByName('Jevica'),bodice=scene.getObjectByName('Jevica_fitted_bodice');
  const source=bodice.geometry,skin=body.geometry,positions=source.attributes.position.array.slice();
  const clearance=(side,y,z)=>{
    const ray=new THREE.Raycaster(new THREE.Vector3(side*.2,y,z),new THREE.Vector3(-side,0,0),0,.2);
    const bodyHit=ray.intersectObject(body,false)[0],clothHit=ray.intersectObject(bodice,false)[0];
    assert.ok(bodyHit&&clothHit,'both surfaces exist');return side*(clothHit.point.x-bodyHit.point.x);
  };
  assert.ok(clearance(1,1,.04)<-.01,'fixture reproduces side-panel penetration');
  const fit=fitCharacterBodice(scene);
  for(const side of [-1,1])for(const y of [1,1.08])for(const z of [0,.04])assert.ok(clearance(side,y,z)>.002,`${side}, ${y}, ${z}: cloth is outside skin`);
  assert.equal(body.geometry,skin);assert.deepEqual(source.attributes.position.array,positions);
  assert.deepEqual(bodice.geometry.attributes.uv.array,source.attributes.uv.array);
  const weights=bodice.geometry.attributes.skinWeight;
  for(let i=0;i<weights.count;i++)assert.ok(Math.abs([0,1,2,3].reduce((sum,j)=>sum+weights.getComponent(i,j),0)-1)<1e-6);
  assert.deepEqual(bodice.geometry.index.array,source.index.array);
  const owned=bodice.geometry;let disposed=0;owned.addEventListener('dispose',()=>disposed++);
  fit.dispose();assert.equal(disposed,1);assert.equal(bodice.geometry,source);
  const second=fitCharacterBodice(scene);assert.notEqual(bodice.geometry,owned);second.dispose();
});

test('all authored looks sharing the bodice receive an owned fit and release it',async()=>{
  const {instantiateAvatar}=await import('../src/avatars.js');
  const {createRomanceLook}=await import('../src/romance-look.js');
  const {sharedAppearance}=await import('../src/shared-appearances.js');
  const source=await loadCharacterRig('jevica');
  for(const id of ['sable-human','woman-tailored','lyra-human','forest-aristocrat-feminine']){
    const avatar=instantiateAvatar(source,{targetHeight:source.height,id:'fit-regression'}),root=new THREE.Group();root.add(avatar.model);
    const cloth=avatar.model.getObjectByName('Jevica_fitted_bodice'),original=cloth.geometry;
    const look=createRomanceLook(avatar,root,sharedAppearance(id));
    try{assert.notEqual(cloth.geometry,original,`${id} receives its fit`);}
    finally{look.dispose();assert.equal(cloth.geometry,original);avatar.dispose();}
  }
});


test('an unsupported rig without a head does not allocate a bodice fit',async()=>{
  const {instantiateAvatar}=await import('../src/avatars.js');
  const {createRomanceLook}=await import('../src/romance-look.js');
  const {sharedAppearance}=await import('../src/shared-appearances.js');
  const avatar=instantiateAvatar(await loadCharacterRig('jevica'),{targetHeight:1.685,id:'headless-fit'});
  const root=new THREE.Group();root.add(avatar.model);
  const head=avatar.model.getObjectByName('head'),cloth=avatar.model.getObjectByName('Jevica_fitted_bodice'),original=cloth.geometry;
  head.name='unsupported-head';
  const look=createRomanceLook(avatar,root,sharedAppearance('sable-human'));
  try{assert.equal(cloth.geometry,original,'early rejection retains the source geometry');}
  finally{look.dispose();avatar.dispose();}
});
