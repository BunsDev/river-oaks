import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AVATAR_PROFILES, avatarProfile } from '../src/avatars.js';

const root=new URL('../public/assets/characters/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('sources.json',root)));

test('every resident references a shipped, bounded and self-contained skinned character',()=>{
  assert.deepEqual(new Set(manifest.files.map(file=>file.id)),new Set(AVATAR_PROFILES));
  let bytes=0;
  for(const file of manifest.files) {
    const body=readFileSync(new URL(`${file.id}.glb`,root)); bytes+=body.length;
    assert.equal(body.toString('utf8',0,4),'glTF');
    assert.equal(createHash('sha256').update(body).digest('hex'),file.sha256);
    assert.equal(body.length,file.bytes);
    const gltf=JSON.parse(body.toString('utf8',20,20+body.readUInt32LE(12)));
    assert.equal(gltf.skins.length,1);
    assert.ok(gltf.skins[0].joints.length>=40);
    assert.ok(gltf.images.every(image=>image.bufferView!==undefined && image.mimeType==='image/webp'));
    assert.ok(gltf.buffers.every(buffer=>!buffer.uri));
    let triangles=0;
    for(const mesh of gltf.meshes) for(const primitive of mesh.primitives) {
      assert.ok(primitive.attributes.JOINTS_0!==undefined && primitive.attributes.WEIGHTS_0!==undefined);
      triangles+=gltf.accessors[primitive.indices].count/3;
    }
    assert.ok(triangles>10000 && triangles<50000,`${file.id}: unexpected mesh budget ${triangles}`);
    assert.equal(file.license,'CC0-1.0');
  }
  assert.ok(bytes<12*1024*1024,'The complete shared population asset set must stay below 12 MiB');
  for(let index=0;index<24;index++) assert.ok(manifest.files.some(file=>file.id===avatarProfile(index)));
});
