import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createPlayerCostume } from '../src/player-costume.js';

test('Jevica ships a self-contained, skinned hero asset with a reproducible receipt', () => {
  const root=new URL('../public/assets/characters/',import.meta.url);
  const receipt=JSON.parse(readFileSync(new URL('jevica.sources.json',root)));
  const bytes=readFileSync(new URL('jevica.glb',root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
  assert.equal(bytes.length,receipt.bytes);assert.ok(bytes.length<12*1024*1024);
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  assert.equal(gltf.skins.length,1);
  assert.ok(gltf.images.every(image=>image.bufferView!==undefined));
  assert.ok(gltf.buffers.every(buffer=>!buffer.uri));
  const names=new Set(gltf.nodes.map(node=>node.name));
  for(const joint of ['head','clavicle_l','clavicle_r','spine_01','spine_03','hand_r','foot_l','foot_r']) assert.ok(names.has(joint),joint);
  const triangles=gltf.meshes.flatMap(mesh=>mesh.primitives).reduce((sum,p)=>sum+gltf.accessors[p.indices].count/3,0);
  assert.ok(triangles>50000 && triangles<150000,`Hero triangle budget: ${triangles}`);
  const eyes=gltf.materials.find(material=>material.name==='brown');
  assert.equal(eyes.alphaMode,'BLEND','Source corneal alpha must survive export');
  assert.equal(receipt.license,'CC0-1.0');
});

function avatarFixture() {
  const object=new THREE.Group(),model=new THREE.Group();object.add(model);
  for(const name of ['head','neck_01','clavicle_l','clavicle_r','spine_01','spine_02','spine_03','hand_l','hand_r','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r','thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r']) {
    const bone=new THREE.Bone();bone.name=name;bone.position.y=name==='head'?1.45:1;model.add(bone);
  }
  return {object,rig:{model,materials:new Map()}};
}

for(const form of ['jevica','witch']) test(`${form} has finite geometry and follows the rig under rotation, translation and disposal`,()=>{
  const avatar=avatarFixture(), originalChildren=avatar.object.children.length;
  const costume=createPlayerCostume(avatar,form);
  avatar.object.position.set(40,3,-20);avatar.object.rotation.y=1.3;
  avatar.rig.model.getObjectByName('head').rotation.z=0.18;
  costume.update(false);
  let triangles=0,geometries=new Set(),materials=new Set();
  avatar.object.traverse(item=>{
    assert.ok(item.matrixWorld.elements.every(Number.isFinite),`${form}: finite transforms`);
    if(!item.isMesh)return;
    assert.ok(item.geometry.attributes.position.array.every(Number.isFinite),`${form}: finite vertices`);
    item.geometry.computeBoundingSphere();assert.ok(Number.isFinite(item.geometry.boundingSphere.radius));
    triangles+=(item.geometry.index?.count??item.geometry.attributes.position.count)/3;
    geometries.add(item.geometry);materials.add(item.material);
  });
  assert.ok(triangles>0 && triangles<75000,`${form}: costume budget ${triangles}`);
  let disposed=0;
  for(const resource of [...geometries,...materials])resource.addEventListener('dispose',()=>disposed++);
  costume.dispose();
  assert.equal(avatar.object.children.length,originalChildren);
  assert.equal(disposed,geometries.size+materials.size,'Every attached geometry and material is released');
});

test('Grey costume detaches without disposing shared species assets',()=>{
  const avatar=avatarFixture(),head=avatar.rig.model.getObjectByName('head');
  const outfit=createPlayerCostume(avatar,'alien');
  const anatomy=head.children.find(child=>child.name==='Grey anatomy');assert.ok(anatomy);
  let disposed=0;
  for(const part of anatomy.children){part.geometry.addEventListener('dispose',()=>disposed++);part.material.addEventListener('dispose',()=>disposed++);}
  outfit.update();outfit.dispose();
  assert.equal(anatomy.parent,null);assert.equal(disposed,0,'species geometry is a cached template shared by clones');
  assert.throws(()=>createPlayerCostume(avatar,'dorothy'),/Unknown playable form/);
});
