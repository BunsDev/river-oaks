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
    const {position,normal}=tail.children[0].geometry.attributes;
    const ring=profile==='woman-casual'?32:12,center=new THREE.Vector3();
    for(let i=0;i<ring;i++)center.add(new THREE.Vector3().fromBufferAttribute(position,i));
    center.divideScalar(ring);
    const radial=new THREE.Vector3().fromBufferAttribute(position,0).sub(center).normalize();
    assert.ok(radial.dot(new THREE.Vector3().fromBufferAttribute(normal,0))>0,`${profile} tail surface faces outward`);
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

test('Sable replaces the human face without changing the shared template or a second avatar',async()=>{
  const source=await loadCharacterRig('jevica'),avatar=instantiateAvatar(source,{targetHeight:source.height,id:'player'});
  const neighbor=instantiateAvatar(source,{targetHeight:source.height,id:'remote-neighbor'});
  const skin=avatar.model.getObjectByName('Jevica'),original=skin.geometry;
  const before=Array.from(original.index.array),root=new THREE.Group();root.add(avatar.model);
  const look=createRomanceLook(avatar,root,sharedAppearance('woman-casual'));
  assert.notEqual(skin.geometry,original);
  assert.ok(skin.geometry.index.count<original.index.count,'the human head triangles are removed');
  assert.deepEqual(Array.from(original.index.array),before,'cached indices are untouched');
  assert.equal(neighbor.model.getObjectByName('Jevica').geometry,original);
  assert.equal(avatar.model.getObjectByName('Jevicalong01').visible,false);
  assert.equal(neighbor.model.getObjectByName('Jevicalong01').visible,true);
  const tail=root.getObjectByName('fox tail');assert.equal(tail.parent.name,'pelvis');
  const rest=tail.quaternion.clone();look.update(1200);assert.ok(tail.quaternion.angleTo(rest)>.01);
  look.update(1300,{reducedMotion:true});assert.ok(tail.quaternion.angleTo(rest)<1e-6,'reduced motion restores the rest pose');
  const eye=root.getObjectByName('Sable eyelid opening');
  look.update(1400,{blink:{left:1,right:1},gaze:[{yaw:.2,pitch:.1}]});
  assert.equal(eye.scale.y,.04);assert.equal(eye.position.x,0,'gaze does not move the eyelids');
  assert.ok(eye.getObjectByName('Sable iris gaze').position.x>0);
  assert.ok(eye.userData.irisMap.offset.x<0,'the iris follows gaze within the fixed eye opening');
  look.update(1500,{reducedMotion:true,blink:{left:1,right:1}});assert.equal(eye.scale.y,1);
  let released=0;skin.geometry.addEventListener('dispose',()=>released++);
  const texture=tail.children[0].material.bumpMap;texture.addEventListener('dispose',()=>released++);
  look.dispose();assert.equal(released,2);assert.equal(skin.geometry,original);assert.equal(avatar.model.getObjectByName('Jevicalong01').visible,true);
  avatar.dispose();neighbor.dispose();
});


test('Sable detailed face has finite textured contours and independently owned eye maps',async()=>{
  const source=await loadCharacterRig('jevica'),avatar=instantiateAvatar(source,{targetHeight:source.height,id:'player'});
  const root=new THREE.Group();root.add(avatar.model);
  const look=createRomanceLook(avatar,root,sharedAppearance('woman-casual'));
  const face=root.getObjectByName('Sable sculpted face'),{position,normal,uv}=face.geometry.attributes;
  assert.ok(uv,'fur relief has texture coordinates');
  for(const attribute of [position,normal,uv])assert.ok(Array.from(attribute.array).every(Number.isFinite));
  let front=0;for(let i=0;i<position.count;i++){
    if(Math.abs(position.getX(i))<.001&&position.getZ(i)>.05&&position.getY(i)>.01&&position.getY(i)<.10){
      assert.ok(normal.getZ(i)>0,'front-facing facial surface has outward normals');front++;
    }
  }
  assert.ok(front>0);
  const eyes=[];root.traverse(item=>{if(item.name==='Sable eyelid opening')eyes.push(item);});
  assert.equal(eyes.length,2);assert.notEqual(eyes[0].userData.irisMap,eyes[1].userData.irisMap);
  look.update(1000,{gaze:[{yaw:10,pitch:-10},{yaw:-10,pitch:10}],blink:{left:.5,right:0}});
  assert.notEqual(eyes[0].userData.irisMap.offset.x,eyes[1].userData.irisMap.offset.x);
  for(const eye of eyes){const gaze=eye.getObjectByName('Sable iris gaze');assert.ok(Math.abs(gaze.position.x)<=.003&&Math.abs(gaze.position.y)<=.002);}
  assert.equal(eyes[0].scale.y,1);assert.equal(eyes[1].scale.y,.5,'independent blink moves its own lid');
  const owned=new Set([face.material.bumpMap,...eyes.map(eye=>eye.userData.irisMap)]);let released=0;
  for(const texture of owned)texture.addEventListener('dispose',()=>released++);
  look.dispose();assert.equal(released,owned.size,'new face and eye textures are released');avatar.dispose();
});

test('Sable has volumetric ears and unobstructed eye surfaces without sunglasses',async()=>{
  const source=await loadCharacterRig('jevica'),avatar=instantiateAvatar(source,{targetHeight:source.height,id:'player'});
  const root=new THREE.Group();root.add(avatar.model);
  const look=createRomanceLook(avatar,root,sharedAppearance('woman-casual'));
  try{
    root.updateMatrixWorld(true);
    const head=root.getObjectByName('fox face'),face=root.getObjectByName('Sable sculpted face');
    const ears=[],eyes=[];
    head.traverse(item=>{
      assert.doesNotMatch(item.name,/sunglasses/i);
      if(item.name==='Sable ear')ears.push(item);
      if(item.name==='Sable chestnut eye')eyes.push(item);
      if(item.geometry)for(const attribute of Object.values(item.geometry.attributes))assert.ok(Array.from(attribute.array).every(Number.isFinite),item.name);
    });
    assert.equal(ears.length,2);
    for(const ear of ears){
      const mesh=new THREE.Mesh(ear.geometry,ear.material);
      mesh.updateMatrixWorld(true);
      for(const [origin,direction] of [[[0,.058,1],[0,0,-1]],[[0,.058,-1],[0,0,1]],[[1,.058,0],[-1,0,0]],[[-1,.058,0],[1,0,0]]]){
        const hits=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(mesh);
        assert.ok(hits.length>0,'ear is visible from front, rear and both profiles');
        assert.ok(hits[0].distance<.997,'ear retains thickness instead of collapsing to a flat card');
      }
    }
    const direction=new THREE.Vector3(0,0,-1).transformDirection(head.matrixWorld);
    assert.equal(eyes.length,2);
    for(const eye of eyes){
      const {position,uv}=eye.geometry.attributes;let samples=0;
      for(let i=0;i<position.count;i+=13){
        if(uv.getX(i)<.2||uv.getX(i)>.8||uv.getY(i)<.4||uv.getY(i)>.6)continue;
        const p=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(eye.matrixWorld).addScaledVector(direction,-1);
        const hits=new THREE.Raycaster(p,direction).intersectObjects([face,eye]);
        assert.equal(hits[0]?.object,eye,'fur must not protrude through the visible eye');samples++;
      }
      assert.ok(samples>10,'check the interior, not just the outline');
    }
  }finally{look.dispose();avatar.dispose();}
});
