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
  assert.deepEqual(SHARED_APPEARANCES.filter(character=>character.character==='aurel').map(character=>[character.id,character.form]),[['man-tailored','human']]);
  assert.deepEqual(SHARED_APPEARANCES.filter(character=>character.character==='kai').map(character=>[character.variant,character.form]),
    [['formal','human'],['explorer','human'],['noir','human']]);
  assert.deepEqual(SHARED_APPEARANCES.filter(character=>character.character==='silvan').map(character=>[character.variant,character.form,character.rig]),
    [['masculine','human','man-casual'],['feminine','human','jevica']]);
  assert.ok(SHARED_APPEARANCES.every(character=>character.form==='human'));
});

test('reference outfits attach to moving bones on human characters and dispose',async()=>{
  const expected={
    'sable-human':['Sable ivory mini dress'],
    'rowan-human':[],
    'woman-tailored':['Vesper velvet wrap skirt'],
    'man-tailored':[],
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

test('Lyra has opaque coverage around her hips on the human rig',async()=>{
  for(const profile of ['lyra-human']){
    const appearance=sharedAppearance(profile),source=await loadCharacterRig(appearance.rig);
    const avatar=instantiateAvatar(source,{targetHeight:source.height,id:'player'}),root=new THREE.Group();root.add(avatar.model);
    const look=createRomanceLook(avatar,root,appearance);
    try{
      const wrap=root.getObjectByName('Lyra velvet wrap');
      assert.ok(wrap,profile+': velvet wrap is present');
      assert.equal(wrap.material.transparent,false);
      assert.equal(wrap.material.opacity,1);
      // Cast through the actual indexed geometry, including the back and seam.
      avatar.model.updateMatrixWorld(true);
      const frame=new THREE.Matrix4().compose(avatar.model.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3()),avatar.model.getWorldQuaternion(new THREE.Quaternion()),avatar.model.getWorldScale(new THREE.Vector3()));
      for(let i=0;i<72;i++){
        const angle=i/72*Math.PI*2,origin=new THREE.Vector3(Math.sin(angle)*.5,-.08,Math.cos(angle)*.5);
        const target=new THREE.Vector3(0,-.08,0);
        origin.applyMatrix4(frame);target.applyMatrix4(frame);
        const ray=new THREE.Raycaster(origin,target.sub(origin).normalize());
        assert.ok(ray.intersectObject(wrap).length,profile+': opaque hip coverage at angle '+angle);
      }
    }finally{look.dispose();avatar.dispose();}
  }
});

test('human styling preserves the source head and adds no animal anatomy',async()=>{
  for(const appearance of SHARED_APPEARANCES){
    const source=await loadCharacterRig(appearance.rig??appearance.id),avatar=instantiateAvatar(source,{targetHeight:source.height,id:'human'}),root=new THREE.Group();root.add(avatar.model);
    const head=avatar.model.getObjectByName('head'),children=head.children.slice();
    const look=createRomanceLook(avatar,root,appearance);
    try{assert.equal(avatar.model.getObjectByName('head'),head);for(const child of children)assert.equal(child.parent,head);
      root.traverse(item=>assert.doesNotMatch(item.name,/fox face|wolf face|lynx face|fox tail|wolf tail/i));
    }finally{look.dispose();avatar.dispose();}
  }
});
