import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as expressions from '../src/character-expressions.js';
import {characterFidelityContract} from '../src/character-fidelity-contract.js';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar} from '../src/avatars.js';

for(const id of ['man-realistic-casual','woman-realistic-tailored']) test(`${id} expressions survive player instantiation and leave blink/speech independent`,async()=>{
 const source=await loadCharacterRig(id),avatar=instantiateAvatar(source,{targetHeight:source.height,id:'expression-fixture',face:{}});
 const control=expressions.createCharacterExpressions(avatar.model,characterFidelityContract(id));
 try{
  assert.deepEqual(control.supported,['neutral','smile','browRaise']);
  control.set('smile',.6);
  let driven=0;avatar.model.traverse(mesh=>{const index=mesh.morphTargetDictionary?.mouthSmileLeft;if(index!==undefined){assert.equal(mesh.morphTargetInfluences[index],.6);driven++;}const blink=mesh.morphTargetDictionary?.eyeBlinkLeft;if(blink!==undefined)assert.equal(mesh.morphTargetInfluences[blink],0);});
  assert.ok(driven>0);control.set('neutral');
  avatar.model.traverse(mesh=>{const index=mesh.morphTargetDictionary?.mouthSmileLeft;if(index!==undefined)assert.equal(mesh.morphTargetInfluences[index],0);});
  for(const [name,weight] of [['unknown',1],['smile',NaN],['smile',-1],['smile',2]])assert.throws(()=>control.set(name,weight));
 }finally{control.dispose();avatar.dispose();}
});
