import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { isOcclusionExcluded } from '../src/render-pipeline.js';
import { createFlightVehicle } from '../src/flight-vehicles.js';
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

for(const form of ['jevica']) test(`${form} has finite geometry and follows the rig under rotation, translation and disposal`,()=>{
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

test('retired characters cannot create costumes or flight vehicles',()=>{
  for(const form of ['witch','alien','dorothy']) {
    assert.throws(()=>createPlayerCostume(avatarFixture(),form),/Unknown playable form/);
    assert.throws(()=>createFlightVehicle(form),/Unknown playable form/);
  }
});

test('Jevica bubble retains finite geometry and releases its owned resources',()=>{
  const vehicle=createFlightVehicle('jevica'),resources=new Set();
  vehicle.object.traverse(item=>{
    if(!item.isMesh)return;
    assert.ok(item.geometry.attributes.position.array.every(Number.isFinite));
    resources.add(item.geometry);resources.add(item.material);
  });
  assert.ok(resources.size>0);
  let disposed=0;for(const resource of resources)resource.addEventListener('dispose',()=>disposed++);
  vehicle.dispose();assert.equal(disposed,resources.size);
});

test('wand glow stays out of the opaque AO depth pass',()=>{
  const avatar=avatarFixture(),costume=createPlayerCostume(avatar,'jevica');
  try {
    const sprites=[];avatar.object.traverse(item=>{if(item.isSprite)sprites.push(item);});
    assert.ok(sprites.length>0);
    for(const sprite of sprites)assert.ok(isOcclusionExcluded(sprite),'An additive glow must not cast a rectangular occlusion shadow');
  } finally {costume.dispose();}
});

test('spell emission follows the actual wand tip under hand and player rotations',()=>{
  const avatar=avatarFixture(),costume=createPlayerCostume(avatar,'jevica');
  try {
    avatar.object.position.set(40,3,-20);avatar.object.rotation.y=1.3;
    avatar.rig.model.getObjectByName('hand_r').rotation.set(.4,.2,-.3);
    costume.update(false,1000);
    let glow;avatar.object.traverse(item=>{if(item.isSprite)glow=item;});
    const expected=glow.getWorldPosition(new THREE.Vector3()),actual=new THREE.Vector3();
    assert.equal(costume.getWandTip(actual),actual);
    assert.ok(actual.distanceTo(expected)<1e-9);
    assert.ok(actual.distanceTo(avatar.rig.model.getObjectByName('hand_r').getWorldPosition(new THREE.Vector3()))>.5);
  } finally {costume.dispose();}
});

test('jewels retain close-up refraction but avoid a scene transmission pass at small projected sizes',()=>{
  const avatar=avatarFixture(),costume=createPlayerCostume(avatar,'jevica');
  try {
    costume.update(false,1000);
    const camera=new THREE.PerspectiveCamera(36,1,.01,100),height=900;
    let crystal;avatar.object.traverse(item=>{if(item.material?.transmission>0)crystal=item.material;});
    const full=crystal.transmission,geometry=[];avatar.object.traverse(item=>{if(item.geometry)geometry.push(item.geometry);});
    const sample=pixels=>{
      camera.position.set(0,1.45,.032*height*.5*camera.projectionMatrix.elements[5]/pixels);
      camera.lookAt(0,1.45,0);costume.updateOptics(camera,height);return crystal.transmission;
    };
    assert.equal(sample(4),0,'Sub-detail jewels must not trigger a full-scene refraction texture');
    assert.equal(sample(24),full,'Close-up jewels keep their original optics');
    assert.ok(Math.abs(sample(12)-full*.5)<1e-8,'Optics blend through the size transition');
    assert.ok(sample(8.01)<.00001,'No visible step when the extra render pass becomes necessary');
    assert.equal(sample(16),full);
    const after=[];avatar.object.traverse(item=>{if(item.geometry)after.push(item.geometry);});
    assert.deepEqual(after,geometry,'No jewelry or character geometry is removed');
    assert.equal(crystal.clearcoat,1);assert.equal(crystal.ior,1.8);
  } finally {costume.dispose();}
});
