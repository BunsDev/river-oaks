import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as runtime from '../src/character-fidelity-runtime.js';

function rig(){const original=new THREE.MeshPhysicalMaterial({name:'young_caucasian_male'}),material=original.clone(),model=new THREE.Group();model.add(new THREE.Mesh(new THREE.BoxGeometry(),material));return {model,materials:new Map([[original,material]]),material};}
test('quality tiers preserve the rig and remove material effects on teardown',async()=>{
 const avatar=rig(),geometry=avatar.model.children[0].geometry;
 const control=runtime.createCharacterFidelity(avatar,{loadTextures:async()=>({roughness:new THREE.Texture()})});
 for(const [quality,tier] of [[{mode:'sharp',scale:1,occlusion:true},'high'],[{mode:'smooth',scale:.75,occlusion:false},'standard'],[{mode:'auto',scale:.6,occlusion:false},'low']]){
  await control.setQuality(quality);assert.equal(control.report.tier,tier);assert.equal(avatar.model.children[0].geometry,geometry);
 }
 await control.setTier('high');control.dispose();assert.ok(avatar.material.normalMap===null);
});
test('late map loading cannot mutate a disposed rig or override a newer tier',async()=>{
 const avatar=rig();let resolve;const control=runtime.createCharacterFidelity(avatar,{loadTextures:()=>new Promise(done=>{resolve=done;})});
 const pending=control.setTier('high');await control.setTier('off');resolve({roughness:new THREE.Texture()});await pending;assert.equal(control.report.tier,'off');assert.ok(avatar.material.normalMap===null);
 const pending2=control.setTier('high');control.dispose();resolve({roughness:new THREE.Texture()});await pending2;assert.ok(avatar.material.normalMap===null);
});
test('a missing map has an explicit fallback and unknown tiers fail closed',async()=>{
 const avatar=rig(),control=runtime.createCharacterFidelity(avatar,{loadTextures:async()=>{throw new Error('missing asset');}});
 await control.setTier('high');assert.equal(control.report.tier,'standard');assert.equal(control.report.fallback,'roughness_unavailable');
 await assert.rejects(control.setTier('unknown'),/Unknown realism tier/);control.dispose();
});

test('a missing roughness map preserves the low quality floor',async()=>{
 const avatar=rig(),control=runtime.createCharacterFidelity(avatar,{loadTextures:async()=>{throw new Error('missing');}});
 await control.setTier('low');assert.equal(control.report.tier,'low');assert.equal(control.report.fallback,'roughness_unavailable');assert.equal(avatar.material.normalMap,null);control.dispose();
});
test('initial quality follows and awaits a downgrade during delayed map loading',async()=>{
 const avatar=rig(),resolvers=[];let quality={mode:'sharp',scale:1,occlusion:true},listener;
 const control=runtime.createCharacterFidelity(avatar,{loadTextures:()=>new Promise(resolve=>resolvers.push(resolve))});
 const ready=runtime.followCharacterQuality(control,{snapshot:()=>quality,subscribe:fn=>{listener=fn;return()=>{listener=null;};}});
 quality={mode:'auto',scale:.6,occlusion:false};listener(quality);
 resolvers[0]({});await Promise.resolve();resolvers[1]({});const unsubscribe=await ready;
 assert.equal(control.report.tier,'low');unsubscribe();assert.equal(listener,null);control.dispose();
});
test('the same quality tier can recover after optional maps become available',async()=>{
 for(const tier of ['low','standard','high']){
  const avatar=rig(),roughness=new THREE.Texture();let loads=0;
  const control=runtime.createCharacterFidelity(avatar,{loadTextures:async()=>{if(++loads===1)throw new Error('temporarily unavailable');return {roughness};}});
  await control.setTier(tier);assert.equal(control.report.fallback,'roughness_unavailable');
  await control.setTier(tier);assert.equal(loads,2);assert.equal(control.report.fallback,undefined);assert.equal(avatar.material.roughnessMap,roughness);
  control.dispose();
 }
});

for (const appliedTier of ['high','standard','low','off']) {
 test(`returning to applied ${appliedTier} cancels an older pending tier`,async()=>{
  const avatar=rig(),roughness=new THREE.Texture();let delay=false,resolve;
  const control=runtime.createCharacterFidelity(avatar,{loadTextures:()=>delay?new Promise(done=>{resolve=done;}):Promise.resolve({roughness})});
  await control.setTier(appliedTier);
  const expected=control.report,normal=avatar.material.normalMap,map=avatar.material.roughnessMap;
  // Leave another tier's maps unresolved while the latest request reaffirms
  // the existing appearance. Its eventual completion must not replace it.
  delay=true;
  const older=control.setTier(appliedTier==='high'?'low':'high');
  await control.setTier(appliedTier);
  resolve({roughness});await older;
  assert.deepEqual(control.report,expected);
  assert.equal(avatar.material.normalMap,normal);
  assert.equal(avatar.material.roughnessMap,map);
  control.dispose();roughness.dispose();
 });
}

test('a component list reaches every tier and skips the roughness load when roughness is omitted',async()=>{
 const avatar=rig();let loads=0;
 const control=runtime.createCharacterFidelity(avatar,{components:['pores','coverage'],loadTextures:async()=>{loads++;return {roughness:new THREE.Texture()};}});
 for(const tier of ['high','standard','low']){
  await control.setTier(tier);
  assert.equal(control.report.tier,tier);assert.deepEqual(control.report.components,['pores','coverage']);assert.equal(control.report.fallback,undefined);
  assert.equal(avatar.material.roughnessMap,null);
 }
 assert.equal(loads,0);assert.ok(avatar.model.children.length===1);
 control.dispose();assert.equal(avatar.material.normalMap,null);
});
test('edits made underneath the applied tier survive re-tiers and keep the report',async()=>{
 const avatar=rig(),roughness=new THREE.Texture();
 const control=runtime.createCharacterFidelity(avatar,{loadTextures:async()=>({roughness}),components:['roughness']});
 assert.equal(control.underneath(()=>'before any tier'),'before any tier');
 await control.setTier('high');
 control.underneath(()=>{assert.equal(avatar.material.roughnessMap,null,'the edit sees base materials');avatar.material.roughness=.58;});
 assert.equal(avatar.material.roughnessMap,roughness);assert.equal(avatar.material.roughness,1);assert.equal(control.report.requestedTier,'high');
 await control.setTier('standard');assert.equal(avatar.material.roughness,1);
 await control.setTier('off');assert.equal(avatar.material.roughnessMap,null);assert.equal(avatar.material.roughness,.58,'off keeps the edit');
 const missing=runtime.createCharacterFidelity(rig(),{loadTextures:async()=>{throw new Error('missing');},components:['roughness']});
 await missing.setTier('high');missing.underneath(()=>{});assert.equal(missing.report.fallback,'roughness_unavailable');assert.equal(missing.report.requestedTier,'high');
 control.dispose();missing.dispose();assert.equal(control.underneath(()=>'after dispose'),'after dispose');
});
