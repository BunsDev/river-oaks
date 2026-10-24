import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { customizedCharacterDefinition } from '../src/character-customization.js';
import { createCharacterHero } from '../src/character-hero.js';
import { defaultAppearanceRealism } from '../src/default-appearance-realism.js';

const definition=()=>customizedCharacterDefinition('fixture','sable-human',{palette:'rose',hair:'espresso'});
test('hero loads the canonical identity and uses a fixed camera, pose and lighting',async()=>{
  const calls=[],object=new THREE.Group();let disposed=0;
  const hero=await createCharacterHero({definition:definition(),ownerId:'fixture',load:async(...args)=>{
    calls.push(args);return {object,rig:{model:object,materials:new Map()},update:(...pose)=>calls.push(pose),dispose:()=>disposed++};
  }});
  assert.equal(calls[0][2],'jevica');assert.equal(calls[0][3].appearanceId,'sable-human');assert.deepEqual(calls[0][3].faceRecipe,{});
  assert.equal(calls[1][0],0);assert.equal(calls[1][1],'idle');assert.equal(calls[1][3].speed,0);
  assert.equal(hero.definition.palette,'rose');assert.deepEqual(hero.camera.position.toArray(),[0,1.08,3.8]);
  assert.equal(hero.camera.aspect,16/9);assert.equal(hero.camera.fov,30);assert.equal(hero.scene.children.filter(x=>x.isLight).length,3);
  hero.dispose();hero.dispose();assert.equal(disposed,1);assert.equal(object.parent,null);
});
test('foreign owner fails before loading and failed preparation releases the loaded avatar',async()=>{
  let loads=0,disposed=0;
  await assert.rejects(createCharacterHero({definition:definition(),ownerId:'foreign',load:async()=>{loads++;}}));assert.equal(loads,0);
  await assert.rejects(createCharacterHero({definition:definition(),ownerId:'fixture',load:async()=>{const object=new THREE.Group();return {object,rig:{model:object,materials:new Map()},update(){throw new Error('pose failed');},dispose:()=>disposed++};}}),/pose failed/);
  assert.equal(disposed,1);
});

test('hero teardown releases renderer transmission targets before disposing materials', async () => {
  const object = new THREE.Group(), material = new THREE.MeshPhysicalMaterial({transmission: .35});
  object.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const target = new THREE.WebGLRenderTarget(4, 4); let released = 0;
  target.addEventListener('dispose', () => released++);
  const renderer = {properties: {get: () => ({uniforms: {transmissionSamplerMap: {value: target.texture}}})}};
  const hero = await createCharacterHero({definition: definition(), ownerId: 'fixture', load: async () => ({object, rig: {model: object, materials: new Map()}, update() {}, dispose() {assert.equal(released, 1);}})});
  hero.dispose(renderer); hero.dispose(renderer);
  assert.equal(released, 1);
});

test('an explicit realism tier reaches the hero rig and is removed before avatar disposal', async () => {
  const original = new THREE.MeshPhysicalMaterial({name:'young_asian_female'}), material = original.clone();
  const model = new THREE.Group(); model.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const rig = {model, materials:new Map([[original, material]])};
  const hero = await createCharacterHero({definition:definition(), ownerId:'fixture', realism:'high',
    loadRealismTextures:async () => ({roughness:new THREE.Texture()}),
    load:async () => ({object:model, rig, update(){}, dispose(){assert.ok(material.roughnessMap === null, 'tier removed first');}})});
  assert.equal(hero.realismReport?.skin, 1);
  assert.ok(material.roughnessMap);
  hero.dispose();
});

test('hero preserves material fallback when optional roughness loading fails',async()=>{
 const original=new THREE.MeshPhysicalMaterial({name:'young_asian_female'}),material=original.clone(),model=new THREE.Group();model.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
 const hero=await createCharacterHero({definition:definition(),ownerId:'fixture',realism:'high',loadRealismTextures:async()=>{throw new Error('roughness unavailable');},load:async()=>({object:model,rig:{model,materials:new Map([[original,material]])},update(){},dispose(){assert.equal(material.normalMap,null);}})});
 assert.equal(hero.realismReport.tier,'standard');assert.equal(hero.realismReport.fallback,'roughness_unavailable');hero.dispose();
});

test('named defaults follow quality with only their trial components, and a caller can choose others',async()=>{
 const scene=()=>{const original=new THREE.MeshPhysicalMaterial({name:'young_asian_female',roughness:.62}),material=original.clone(),model=new THREE.Group();model.add(new THREE.Mesh(new THREE.BoxGeometry(),material));return {model,material,rig:{model,materials:new Map([[original,material]])}};};
 const textures=async()=>({roughness:new THREE.Texture()});
 let figure=scene();
 const hero=await createCharacterHero({definition:definition(),ownerId:'fixture',loadRealismTextures:textures,load:async()=>({object:figure.model,rig:figure.rig,update(){},dispose(){}})});
 assert.equal(hero.realismReport.tier,'high');assert.deepEqual(hero.realismReport.components,defaultAppearanceRealism('sable-human'));
 assert.ok(figure.material.roughnessMap);assert.equal(figure.material.sheen,0,'sheen is not part of the trial');hero.dispose();
 figure=scene();
 const chosen=await createCharacterHero({definition:definition(),ownerId:'fixture',realism:'standard',components:['coverage'],loadRealismTextures:textures,load:async()=>({object:figure.model,rig:figure.rig,update(){},dispose(){}})});
 assert.deepEqual(chosen.realismReport.components,['coverage']);assert.equal(figure.material.roughnessMap,null);chosen.dispose();
});
