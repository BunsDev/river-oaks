import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { customizedCharacterDefinition } from '../src/character-customization.js';
import { createCharacterHero } from '../src/character-hero.js';

const definition=()=>customizedCharacterDefinition('fixture','sable-human',{palette:'rose',hair:'espresso'});
test('hero loads the canonical identity and uses a fixed camera, pose and lighting',async()=>{
  const calls=[],object=new THREE.Group();let disposed=0;
  const hero=await createCharacterHero({definition:definition(),ownerId:'fixture',load:async(...args)=>{
    calls.push(args);return {object,update:(...pose)=>calls.push(pose),dispose:()=>disposed++};
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
  await assert.rejects(createCharacterHero({definition:definition(),ownerId:'fixture',load:async()=>({object:new THREE.Group(),update(){throw new Error('pose failed');},dispose:()=>disposed++})}),/pose failed/);
  assert.equal(disposed,1);
});
