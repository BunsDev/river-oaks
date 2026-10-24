import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { releaseSceneGraphics } from '../src/graphics-resources.js';

test('release detaches GPU owners once without dropping shared CPU geometry, pixels or instances', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry();
  const pixels = new Uint8Array([255, 128, 64, 255]), texture = new THREE.DataTexture(pixels, 1, 1);
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const mesh = new THREE.InstancedMesh(geometry, material, 2);
  mesh.morphTexture = new THREE.DataTexture(new Float32Array([1]), 1, 1);
  const morph = mesh.morphTexture, positions = geometry.attributes.position.array, matrices = mesh.instanceMatrix.array;
  scene.add(mesh, new THREE.Mesh(geometry, material)); scene.background = texture;
  const disposed = [];
  for (const resource of [geometry, texture, material, mesh, morph]) {
    const listener = () => { disposed.push(resource); resource.removeEventListener('dispose', listener); };
    resource.addEventListener('dispose', listener);
  }
  // Deferred canvas paint already distinguishes GPU reallocation from teardown.
  texture.addEventListener('dispose', () => { if (!texture.userData.resizing) texture.userData.disposed = true; });
  releaseSceneGraphics(scene);
  assert.equal(disposed.length, 5); assert.equal(new Set(disposed).size, 5);
  assert.equal(geometry.attributes.position.array, positions); assert.equal(texture.image.data, pixels);
  assert.equal(mesh.instanceMatrix.array, matrices); assert.equal(mesh.morphTexture, morph);
  assert.equal(scene.children.length, 2); assert.equal(texture.userData.disposed, undefined);
  assert.equal(texture.userData.resizing, undefined);
  releaseSceneGraphics(scene); assert.equal(disposed.length, 5);
});

test('release includes shader textures, skin bone textures and shadow targets', () => {
  const scene = new THREE.Scene(), texture = new THREE.Texture(), bones = new THREE.Texture();
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: { image: { value: texture } } }));
  mesh.skeleton = { boneTexture: bones };
  const light = new THREE.DirectionalLight(); light.shadow.map = new THREE.WebGLRenderTarget(8, 8);
  scene.add(mesh, light);
  const counts = new Map();
  for (const resource of [texture, bones, light.shadow.map]) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1));
  releaseSceneGraphics(scene);
  assert.deepEqual([...counts.values()], [1, 1, 1]);
  assert.equal(mesh.skeleton.boneTexture, bones); assert.ok(light.shadow.map);
});
