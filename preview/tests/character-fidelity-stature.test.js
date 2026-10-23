import test from 'node:test';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadResidentAvatar} from '../src/avatars.js';
import {characterFidelityContract} from '../src/character-fidelity-contract.js';
import {loadCharacterRig} from './helpers/character-rig.js';

test('realistic bundles keep the same target stature in Studio, player, peer and crowd callers',async t=>{
 const previousLoad=GLTFLoader.prototype.loadAsync,previousWindow=globalThis.window,previousDocument=globalThis.document;
 globalThis.window={matchMedia:()=>({matches:false})};
 globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})};
 t.after(()=>{GLTFLoader.prototype.loadAsync=previousLoad;globalThis.window=previousWindow;globalThis.document=previousDocument;});
 for(const [profile,appearanceId,height] of [['man-realistic-casual','morgan-human',1.78],['woman-realistic-tailored','imani-human',1.66]]){
  const source=await loadCharacterRig(profile);GLTFLoader.prototype.loadAsync=async()=>({scene:source.scene});
  for(const index of [-1,0,1,4,8]){
   const avatar=await loadResidentAvatar(index,`remote-stature-${index}`,profile,{folk:false,appearanceId,faceRecipe:{},realism:'off'});
   try{assert.ok(Math.abs(avatar.rig.model.scale.y*source.height-height)<1e-6,`${profile} caller index ${index} changes stature`);}
   finally{avatar.dispose();}
  }
  assert.equal(characterFidelityContract(profile).targetHeightM,height);
 }
});
