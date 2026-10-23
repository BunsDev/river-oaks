import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectCharacterAsset, auditCharacterAssets } from '../character-assets-audit.mjs';
import { CHARACTER_ASSETS } from '../../preview/src/character-assets.js';

const root=new URL('../../',import.meta.url);
const original=await readFile(new URL('preview/public/assets/characters/jevica.glb',root));
const receipt=JSON.parse(await readFile(new URL('preview/public/assets/characters/jevica.sources.json',root),'utf8'));
const changed=(edit)=>{
  const length=original.readUInt32LE(12),gltf=JSON.parse(original.subarray(20,20+length)),binary=Buffer.from(original.subarray(28+length));
  edit(gltf,binary);
  const json=Buffer.from(JSON.stringify(gltf)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
  const bytes=Buffer.alloc(28+padded.length+binary.length);original.copy(bytes,0,0,20);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded.length,12);padded.copy(bytes,20);bytes.writeUInt32LE(binary.length,20+padded.length);bytes.writeUInt32LE(0x004e4942,24+padded.length);binary.copy(bytes,28+padded.length);
  const asset={...CHARACTER_ASSETS.jevica,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  return {bytes,asset,receipt:{...receipt,bytes:asset.bytes,sha256:asset.sha256}};
};

test('all pinned shipped assets pass receipt, skeleton, geometry and embedded texture audit',async()=>{
  const report=await auditCharacterAssets({root});assert.deepEqual(report.assets.map(item=>item.id),Object.keys(CHARACTER_ASSETS));
  for(const item of report.assets){assert.equal(item.license,'CC0-1.0');assert.equal(item.joints,53);assert.ok(item.vertices>15000);assert.ok(item.textures.every(t=>t.width<=2048&&t.height<=2048));assert.ok(item.rgba8TextureBytes>0);}
  assert.deepEqual(report.assets.filter(item=>['jevica','man-casual','man-tailored'].includes(item.id)).map(a=>a.triangles),[108636,27106,35786]);
  assert.deepEqual(report.assets.filter(item=>item.id.includes('-realistic-')).map(a=>a.triangles),[84550,88544]);
});
test('changed shipped bytes and mismatched or unlicensed source receipts fail closed',()=>{
  const input={bytes:original,asset:CHARACTER_ASSETS.jevica,receipt};
  const corrupt=Buffer.from(original);corrupt[100]^=1;
  assert.throws(()=>inspectCharacterAsset({...input,bytes:corrupt}),/hash/);
  for(const patch of [{license:'unknown'},{sha256:'bad'},{path:'https://unapproved.test/a.glb'}])assert.throws(()=>inspectCharacterAsset({...input,receipt:{...receipt,...patch}}),/receipt/);
});
test('future catalog updates cannot silently admit broken skeletons, weights or geometry',()=>{
  const cases=[
    [j=>j.nodes[j.skins[0].joints[1]].name='missing-pelvis',/skeleton/],
    [j=>j.skins[0].joints[1]=j.skins[0].joints[0],/skeleton/],
    [(j,b)=>b.writeFloatLE(NaN,j.bufferViews[j.accessors[0].bufferView].byteOffset),/position/],
    [(j,b)=>b.writeFloatLE(20,j.bufferViews[j.accessors[0].bufferView].byteOffset),/position/],
    [(j,b)=>b.writeFloatLE(0,j.bufferViews[j.accessors[4].bufferView].byteOffset),/weight/],
    [(j,b)=>b.writeUInt8(250,j.bufferViews[j.accessors[3].bufferView].byteOffset),/joint/],
    [j=>j.accessors[0].count=100000000,/accessor/],
    [(j,b)=>{const a=j.accessors[j.skins[0].inverseBindMatrices],v=j.bufferViews[a.bufferView];b.fill(0,v.byteOffset,v.byteOffset+64);},/skeleton bind/],
    [(j,b)=>{const a=j.accessors[j.meshes[0].primitives[0].targets[0].POSITION],v=j.bufferViews[a.sparse.values.bufferView];b.writeFloatLE(NaN,v.byteOffset+(a.sparse.values.byteOffset??0));},/morph/],
  ];
  for(const [edit,error] of cases)assert.throws(()=>inspectCharacterAsset(changed(edit)),error);
});
test('external, truncated and oversized texture payloads fail before rendering',()=>{
  assert.throws(()=>inspectCharacterAsset(changed(j=>j.materials[0].pbrMetallicRoughness.baseColorTexture.index=999)),/material texture/);
  assert.throws(()=>inspectCharacterAsset(changed(j=>j.images[0].uri='https://unapproved.test/a.webp')),/embedded/);
  assert.throws(()=>inspectCharacterAsset(changed(j=>j.bufferViews[j.images[0].bufferView].byteLength=15)),/texture/);
  assert.throws(()=>inspectCharacterAsset(changed((j,b)=>b.writeUInt16LE(8192,j.bufferViews[j.images[0].bufferView].byteOffset+26))),/texture/);
});

test('invalid node transforms cannot collapse or explode a pinned rig',()=>{
  for(const patch of [{scale:[]},{scale:[0,0,0]},{scale:[1e9,1e9,1e9]},{translation:[1]},{rotation:[0,0,0,0]},{rotation:[0,0,0,2]},{matrix:Array(16).fill(0)},{matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],scale:[1,1,1]}]){
    assert.throws(()=>inspectCharacterAsset(changed(j=>Object.assign(j.nodes[j.skins[0].joints[1]],patch))),/transform/);
  }
});
