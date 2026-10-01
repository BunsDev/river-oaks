import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar } from '../src/avatars.js';
import { createRomanceLook } from '../src/romance-look.js';
import { SHARED_APPEARANCES, sharedAppearance } from '../src/shared-appearances.js';

test('every selectable character has a stable ID, shipped rig, and reference for authored looks',()=>{
  assert.equal(new Set(SHARED_APPEARANCES.map(character=>character.id)).size,SHARED_APPEARANCES.length);
  assert.equal(new Set(SHARED_APPEARANCES.map(character=>character.label)).size,SHARED_APPEARANCES.length);
  for(const character of SHARED_APPEARANCES){
    assert.equal(sharedAppearance(character.id),character);
    assert.ok(character.role&&character.description.length>50);
    assert.ok(existsSync(new URL(`../public/assets/characters/${character.rig??character.id}.glb`,import.meta.url))||character.id==='jevica');
    if(character.reference)assert.ok(existsSync(new URL(`../public${character.reference}`,import.meta.url)),character.reference);
  }
  assert.deepEqual(SHARED_APPEARANCES.filter(character=>character.identity==='midnight-host').map(character=>character.variant),['human','hybrid','wolf']);
  assert.deepEqual(SHARED_APPEARANCES.filter(character=>character.identity==='starlight-maker').map(character=>character.variant),['formal','explorer','noir']);
  assert.deepEqual(SHARED_APPEARANCES.filter(character=>character.identity==='forest-aristocrat').map(character=>[character.variant,character.rig]),[['masculine','man-casual'],['feminine','jevica']]);
  assert.deepEqual(SHARED_APPEARANCES.filter(character=>character.kind==='fox'||character.kind==='lynx').map(character=>character.kind),['fox','lynx']);
});

test('anthropomorphic details attach to owned bones, animate, and release their resources',async()=>{
  for(const profile of ['woman-casual','man-casual','woman-daywear','midnight-host-wolf']){
    const appearance=sharedAppearance(profile),source=await loadCharacterRig(appearance.rig??profile),avatar=instantiateAvatar(source,{targetHeight:source.height,id:'player'});
    const root=new THREE.Group();root.add(avatar.model);
    const originalColors=[...source.scene.getObjectsByProperty('isMesh',true)].map(mesh=>mesh.material.color?.getHex());
    const look=createRomanceLook(avatar,root,appearance);
    const face=avatar.model.getObjectByName(`${appearance.kind} face`);
    const tail=root.getObjectByName(`${appearance.kind} tail`);
    assert.ok(face?.parent?.isBone,`${profile} face follows the head bone`);
    assert.ok(tail?.children[0]?.geometry.attributes.normal,`${profile} tail has smooth surface normals`);
    assert.ok(tail.children[0].geometry.attributes.uv,`${profile} tail carries fur texture coordinates`);
    assert.ok(tail.children[0].geometry.attributes.normal.getX(0)>0,`${profile} tail surface faces outward`);
    look.update(1200);assert.notEqual(tail.rotation.y,0);
    look.update(0,{reducedMotion:true});assert.ok(Number.isFinite(tail.rotation.y));
    assert.deepEqual([...source.scene.getObjectsByProperty('isMesh',true)].map(mesh=>mesh.material.color?.getHex()),originalColors,'cached rig stays untouched');
    let disposed=0;const geometries=new Set();face.traverse(item=>{if(item.geometry)geometries.add(item.geometry);});tail.traverse(item=>{if(item.geometry)geometries.add(item.geometry);});
    for(const geometry of geometries)geometry.addEventListener('dispose',()=>disposed++);
    look.dispose();assert.equal(face.parent,null);assert.equal(root.getObjectByName(`${appearance.kind} tail`),undefined);assert.equal(disposed,geometries.size);
    avatar.dispose();
  }
});

test('reference outfits and both midnight host identities attach to moving bones and dispose',async()=>{
  const expected={
    'woman-casual':['Sable ivory mini dress'],
    'man-casual':[],
    'woman-tailored':['Vesper velvet wrap skirt'],
    'man-tailored':[],
    'midnight-host-hybrid':['wolf ears'],
    'man-workwear':[],
    'kai-explorer':[],
    'kai-noir':[],
    'forest-aristocrat':['Forest aristocrat drape'],
    'forest-aristocrat-feminine':['Forest aristocrat drape'],
  };
  for(const [profile,names] of Object.entries(expected)){
    const appearance=sharedAppearance(profile),source=await loadCharacterRig(appearance.rig??profile);
    const avatar=instantiateAvatar(source,{targetHeight:source.height,id:`test-${profile}`}),root=new THREE.Group();root.add(avatar.model);
    const look=createRomanceLook(avatar,root,appearance);
    for(const name of names)assert.ok(root.getObjectByName(name),`${profile}: ${name}`);
    if(appearance.identity==='midnight-host'&&appearance.variant==='hybrid')assert.ok(root.getObjectByName('wolf tail'));
    const attachments=[];for(const boneName of ['head','spine_03','pelvis']){
      const bone=avatar.model.getObjectByName(boneName);
      attachments.push(...bone.children.filter(child=>child.isGroup));
    }
    assert.ok(attachments.length>=2,`${profile}: outfit follows skeleton bones`);
    const materials=new Set(),geometries=new Set();for(const group of attachments)group.traverse(item=>{if(item.isMesh){materials.add(item.material);geometries.add(item.geometry);}});
    let disposed=0;for(const geometry of geometries)geometry.addEventListener('dispose',()=>disposed++);
    look.dispose();assert.ok(disposed>=geometries.size,`${profile}: attached geometry is released`);
    for(const group of attachments)assert.equal(group.parent,null);
    avatar.dispose();
  }
});
