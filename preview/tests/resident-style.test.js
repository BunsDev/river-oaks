import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RESIDENT_STYLES, residentStyleFor, applyResidentStyle, HAIR_COLORS, residentHairFor, applyResidentHair } from '../src/resident-style.js';

function fixture() {
  const model=new THREE.Group(), materials=new Map();
  for(const name of ['young_caucasian_female','brown','bob01','female_casualsuit01','shoes01']) {
    const original=new THREE.MeshStandardMaterial({name,color:'#ddd0b8',map:new THREE.Texture(),roughness:0.61});
    const material=original.clone();materials.set(original,material);
    model.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
  }
  return {model,materials};
}

test('human residents receive stable, varied fashion across encounter identities',()=>{
  const names=new Set(Array.from({length:24},(_,i)=>residentStyleFor(`local-${String(i).padStart(2,'0')}`).name));
  assert.equal(names.size,RESIDENT_STYLES.length);
  assert.equal(residentStyleFor('local-04'),residentStyleFor('local-04'));
});

test('fashion preserves human skin, eyes, geometry, source materials and uniform identity',()=>{
  const avatar=fixture(), before=avatar.model.children.map(mesh=>({geometry:mesh.geometry,visible:mesh.visible}));
  const originals=[...avatar.materials.keys()].map(material=>material.color.getHex());
  const style=applyResidentStyle(avatar,'local-04');
  assert.equal(avatar.model.userData.residentStyle,style.name);
  assert.equal(avatar.model.children.length,before.length,'no head replacements or hats');
  for(const [index,mesh] of avatar.model.children.entries()) {
    assert.equal(mesh.geometry,before[index].geometry);assert.equal(mesh.visible,before[index].visible);
  }
  for(const [index,[original,material]] of [...avatar.materials].entries()) {
    assert.equal(original.color.getHex(),originals[index]);assert.equal(material.map,original.map);
    if(original.name==='bob01') {
      // Hair follows residentHairFor: recoloured, or the rig's authored colour.
      assert.equal(material.color.getHex()===original.color.getHex(),residentHairFor('local-04')===null);
      assert.equal(material.roughness,original.roughness);
    } else if(!original.name.includes('suit')) {
      assert.equal(material.color.getHex(),original.color.getHex());assert.equal(material.roughness,original.roughness);
    } else assert.notEqual(material.color.getHex(),original.color.getHex());
  }
  const staff=fixture(),guest=fixture();
  applyResidentStyle(staff,'store-cafe-person-1',{staff:true});applyResidentStyle(guest,'store-cafe-person-1');
  const suit=rig=>[...rig.materials.values()].find(material=>material.name.includes('suit'));
  const base=new THREE.Color('#ddd0b8').toArray();
  const distance=color=>color.toArray().reduce((sum,n,index)=>sum+(n-base[index])**2,0);
  assert.ok(distance(suit(staff).color)<distance(suit(guest).color),'uniform receives a restrained accent');
});

test('hair colour tells residents on the same rig apart, and keeps some authored looks',()=>{
  const ids=Array.from({length:24},(_,i)=>`local-${String(i).padStart(2,'0')}`),hair=ids.map(residentHairFor);
  assert.equal(residentHairFor('local-04'),residentHairFor('local-04'),'stable per resident');
  assert.ok(new Set(hair.filter(Boolean)).size>=6,'at least six distinct colours across the district');
  const authored=hair.filter(colour=>colour===null).length;
  assert.ok(authored>=3&&authored<=12,`some residents keep the rig's own hair (${authored} of 24)`);
  assert.ok(HAIR_COLORS.every(colour=>colour===null||/^#[0-9a-f]{6}$/.test(colour)));
});

test('hair recolouring maps a dark texture to its target and touches only hair',()=>{
  const id=Array.from({length:40},(_,i)=>`local-${i}`).find(candidate=>residentHairFor(candidate)!==null);
  const avatar=fixture(),before=new Map([...avatar.materials].map(([original,material])=>[original.name,material.color.getHex()]));
  assert.equal(applyResidentHair(avatar,id),residentHairFor(id));
  for(const [original,material] of avatar.materials) {
    if(original.name==='bob01') {
      assert.notEqual(material.color.getHex(),before.get('bob01'));
      // bob01's texture is near-black, so reaching the target needs a gain above 1, limited as a whole.
      assert.ok(Math.max(material.color.r,material.color.g,material.color.b)>1);
      assert.ok([material.color.r,material.color.g,material.color.b].every(channel=>channel<=48));
    } else assert.equal(material.color.getHex(),before.get(original.name));
  }
  const authored=Array.from({length:40},(_,i)=>`local-${i}`).find(candidate=>residentHairFor(candidate)===null),plain=fixture();
  assert.equal(applyResidentHair(plain,authored),null);
  assert.ok([...plain.materials.values()].every(material=>material.color.getHex()===new THREE.Color('#ddd0b8').getHex()));
});
