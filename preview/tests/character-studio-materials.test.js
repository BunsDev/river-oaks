import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar } from '../src/avatars.js';
import { createRomanceLook } from '../src/romance-look.js';
import { sharedAppearance } from '../src/shared-appearances.js';
import { customizedCharacterDefinition } from '../src/character-customization.js';
import { createCharacterMaterials } from '../src/character-studio-materials.js';
for(const id of ['sable-human'])test(`${id}: colors cover actual outfit and hair, reset exactly and keep sibling rig unchanged`,async()=>{
  const source=await loadCharacterRig('jevica'),avatar=instantiateAvatar(source,{targetHeight:1.685,id:'fixture'}),other=instantiateAvatar(source,{targetHeight:1.685,id:'sibling'});
  const root=new THREE.Group();root.add(avatar.model);const look=createRomanceLook(avatar,root,sharedAppearance(id));
  const untouched=[...other.materials.values()].map(m=>m.color.getHex()),colors=createCharacterMaterials(root);
  try{
    assert.ok(colors.slots.outfit>=2);assert.ok(colors.slots.hair>=1);
    const before=[];root.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())before.push([m,m.color.clone()]);});
    colors.apply(customizedCharacterDefinition('fixture',id,{palette:'rose',hair:'espresso'}));
    assert.ok(before.some(([m,c])=>!m.color.equals(c)));
    assert.deepEqual([...other.materials.values()].map(m=>m.color.getHex()),untouched);
    colors.apply(customizedCharacterDefinition('fixture',id));assert.ok(before.every(([m,c])=>m.color.equals(c)));
  }finally{colors.dispose();look.dispose();avatar.dispose();other.dispose();}
});
