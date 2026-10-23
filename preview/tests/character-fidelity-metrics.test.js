import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {distributionOf, textureBytes, sceneCensus, memoryDelta} from '../src/character-fidelity-metrics.js';

test('distribution uses nearest-rank percentiles and ignores non-finite samples', () => {
  const samples = Array.from({length: 100}, (_, i) => i + 1);
  assert.deepEqual(distributionOf([...samples, NaN, Infinity].reverse()), {count: 100, min: 1, p50: 50, p95: 95, max: 100, mean: 50.5});
  assert.deepEqual(distributionOf([7]), {count: 1, min: 7, p50: 7, p95: 7, max: 7, mean: 7});
  assert.equal(distributionOf([]).p50, null);
});

test('texture bytes count RGBA texels, component size and a generated mip chain', () => {
  const plain = new THREE.DataTexture(new Uint8Array(64 * 32 * 4), 64, 32);
  assert.deepEqual(textureBytes(plain), {width: 64, height: 32, bytes: 64 * 32 * 4, compressed: false});
  const mipped = new THREE.DataTexture(new Uint8Array(64 * 64 * 4), 64, 64);
  mipped.generateMipmaps = true; mipped.minFilter = THREE.LinearMipmapLinearFilter;
  assert.equal(textureBytes(mipped).bytes, Math.round(64 * 64 * 4 * 4 / 3));
  const half = new THREE.DataTexture(new Uint16Array(8 * 8 * 4), 8, 8, THREE.RGBAFormat, THREE.HalfFloatType);
  assert.equal(textureBytes(half).bytes, 8 * 8 * 8);
  const compressed = new THREE.CompressedTexture([{data: new Uint8Array(512), width: 32, height: 32}, {data: new Uint8Array(128), width: 16, height: 16}], 32, 32);
  assert.deepEqual(textureBytes(compressed), {width: 32, height: 32, bytes: 640, compressed: true});
  assert.equal(textureBytes(new THREE.Texture()).bytes, 0);
});

function skinnedFigure() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(count * 4).fill(.25), 4));
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3), new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3)];
  const skin = new THREE.MeshPhysicalMaterial({map: new THREE.DataTexture(new Uint8Array(16 * 16 * 4), 16, 16)});
  const bones = [new THREE.Bone(), new THREE.Bone()]; bones[0].add(bones[1]);
  const body = new THREE.SkinnedMesh(geometry, skin); body.add(bones[0]); body.bind(new THREE.Skeleton(bones));
  const hairGeometry = new THREE.PlaneGeometry(1, 1);
  const hair = new THREE.SkinnedMesh(hairGeometry, new THREE.MeshStandardMaterial({alphaTest: .4, side: THREE.DoubleSide, map: skin.map}));
  hair.bind(body.skeleton);
  const group = new THREE.Group(); group.add(body, hair); return {group, geometry, hairGeometry};
}

test('census counts meshes, draws, triangles, morphs, shared skeletons and unique textures', () => {
  const {group, geometry} = skinnedFigure();
  const census = sceneCensus(group);
  assert.equal(census.meshes, 2); assert.equal(census.skinnedMeshes, 2);
  assert.equal(census.skeletons, 1); assert.equal(census.bones, 2);
  assert.equal(census.triangles, 12 + 2); assert.equal(census.drawCalls, 2);
  assert.equal(census.morphTargets, 2); assert.equal(census.maxMorphTargets, 2);
  assert.deepEqual(census.materialTypes, {MeshPhysicalMaterial: 1, MeshStandardMaterial: 1});
  assert.equal(census.alphaTested, 1); assert.equal(census.doubleSided, 1);
  assert.equal(census.textures, 1, 'a texture shared by two materials is counted once');
  assert.equal(census.textureBytes, 16 * 16 * 4);
  assert.ok(census.geometryBytes > geometry.attributes.position.array.byteLength);
});

test('census skips hidden objects, counts material groups and clamps draw ranges', () => {
  const {group} = skinnedFigure();
  group.children[1].visible = false;
  assert.equal(sceneCensus(group).meshes, 1);
  const grouped = new THREE.BoxGeometry(1, 1, 1);
  const multi = new THREE.Mesh(grouped, Array.from({length: 6}, () => new THREE.MeshBasicMaterial()));
  assert.equal(sceneCensus(multi).drawCalls, 6);
  grouped.setDrawRange(0, 9);
  assert.equal(sceneCensus(multi).triangles, 3);
});

test('a clone sharing geometry adds draws but not geometry bytes or morph targets', () => {
  const {group} = skinnedFigure(), root = new THREE.Group();
  root.add(group, group.clone());
  const one = sceneCensus(group), two = sceneCensus(root);
  assert.equal(two.drawCalls, one.drawCalls * 2);
  assert.equal(two.geometryBytes, one.geometryBytes);
  assert.equal(two.morphTargets, one.morphTargets);
});

test('memory delta reports per-resource growth', () => {
  assert.deepEqual(memoryDelta({geometries: 4, textures: 7, programs: 3}, {geometries: 4, textures: 9, programs: 3}), {geometries: 0, textures: 2, programs: 0});
});
