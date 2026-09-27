import test from 'node:test';
import assert from 'node:assert/strict';
import {instantiateAvatar,AVATAR_PROFILES} from '../src/avatars.js';
import {loadCharacterRig} from './helpers/character-rig.js';
import {createSpeechBinding} from '../src/speech-avatar.js';

test('all seven speech bindings preserve blinks, reuse body bones and restore original geometry',async()=>{
 for(const profile of [...AVATAR_PROFILES,'jevica']){
  const source=await loadCharacterRig(profile),donor=await loadCharacterRig(`speech/${profile}`),rig=instantiateAvatar(source,{targetHeight:1.7});
  const before=[];rig.model.traverse(m=>{if(m.isMesh)before.push({mesh:m,geometry:m.geometry,keys:m.morphTargetDictionary,influences:m.morphTargetInfluences,length:m.morphTargetInfluences?.length});});
  const binding=createSpeechBinding(rig,donor.scene),skin=before.find(x=>x.keys?.eyeBlinkLeft!==undefined).mesh;
  skin.morphTargetInfluences[skin.morphTargetDictionary.eyeBlinkLeft]=.73;
  binding.setWeights({viseme_aa:.8,viseme_PP:.1});
  assert.equal(skin.morphTargetInfluences[skin.morphTargetDictionary.eyeBlinkLeft],.73);
  assert.equal(skin.morphTargetInfluences[skin.morphTargetDictionary.viseme_aa],.8);
  const oral=[];rig.model.traverse(m=>{if(['teeth','tongue01'].includes(m.material?.name))oral.push(m);});
  assert.equal(oral.length,2);assert.ok(oral.every(m=>m.visible&&rig.skeletons.has(m.skeleton)));
  skin.visible=false;binding.setWeights({viseme_aa:1});assert.ok(oral.every(m=>!m.visible),'An invisible body must not reveal floating teeth or tongue');skin.visible=true;
  binding.setWeights({});assert.ok(oral.every(m=>!m.visible));
  binding.dispose();binding.dispose();
  for(const old of before){assert.equal(old.mesh.geometry,old.geometry);assert.equal(old.mesh.morphTargetDictionary,old.keys);assert.equal(old.mesh.morphTargetInfluences,old.influences);assert.equal(old.mesh.morphTargetInfluences?.length,old.length);}
  assert.equal(skin.morphTargetInfluences[skin.morphTargetDictionary.eyeBlinkLeft],.73);
  assert.ok(oral.every(m=>!m.parent));assert.equal(binding.setWeights({viseme_aa:1}),false);rig.dispose();
 }
});
