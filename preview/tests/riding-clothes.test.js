import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar} from '../src/avatars.js';
import {createRidingClothes} from '../src/riding-clothes.js';
test('opaque riding trousers cover the actual lower-body skin and share its posing skeleton without covering hands',async()=>{
 const source=await loadCharacterRig('jevica'),rig=instantiateAvatar(source,{targetHeight:1.685}),body=rig.model.getObjectByName('Jevica'),clothes=createRidingClothes(rig.model),mesh=clothes.object;
 try{assert.equal(mesh.skeleton,body.skeleton);assert.notEqual(mesh.geometry,body.geometry);assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.opacity,1);assert.equal(mesh.material.side,THREE.DoubleSide);
 const covered=new Set(mesh.geometry.index.array),p=body.geometry.attributes.position,{skinIndex,skinWeight}=body.geometry.attributes;
 let legs=0,hands=0;for(let i=0;i<p.count;i++){let lower=0,hand=0;for(let k=0;k<4;k++){const bone=body.skeleton.bones[skinIndex.getComponent(i,k)].name,w=skinWeight.getComponent(i,k);if(/^(thigh|calf|pelvis)/.test(bone))lower+=w;if(/^hand/.test(bone))hand+=w;}if(lower>.99){legs++;assert.ok(covered.has(i),'every hip and leg vertex has opaque coverage');}if(hand>.99){hands++;assert.ok(!covered.has(i),'hands retain skin');}}
 assert.ok(legs>100);assert.ok(hands>10);clothes.update(true);assert.equal(mesh.visible,true);clothes.update(false);assert.equal(mesh.visible,false);
 }finally{clothes.dispose();rig.dispose();}
});
