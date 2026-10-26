import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// Canvas textures draw into a context that accepts anything; the batches are what matter.
const anything = new Proxy(function () {}, { get: () => anything, apply: () => anything, set: () => true });
globalThis.document ??= { createElement: () => ({ width: 1, height: 1, getContext: () => anything }), querySelector: () => null, dispatchEvent: () => true };
const { buildStoreInteriors } = await import('../src/store-interiors.js');
const { storeRoomsFor } = await import('../src/store-rooms.js');
const { castShadowsFromProxies } = await import('../src/landscape-models.js');
const { plainDepthMaterial } = await import('../src/shadow-proxy.js');

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const interiors = buildStoreInteriors(storeRoomsFor(world).filter(room => !room.generatedPlan));
const proxies = interiors.children.filter(mesh => mesh.name === 'Interior shadow batch');
const batches = interiors.children.filter(mesh => mesh.isInstancedMesh && !proxies.includes(mesh));
const members = proxies.flatMap(proxy => proxy.userData.members);
const others = batches.filter(mesh => !members.includes(mesh));
const othersCasting = others.map(mesh => mesh.castShadow);
const matrices = mesh => Array.from({ length: mesh.count }, (_, i) => mesh.getMatrixAt(i, new THREE.Matrix4()).toArray());
// Shadow draws: batches that cast for themselves, plus the proxies the sun is given.
const casters = () => batches.filter(mesh => mesh.castShadow).length + interiors.userData.shadowProxies.length;

test('a building’s casting batches of one geometry cast through one hidden proxy of the same instances', () => {
  assert.ok(proxies.length > 0, 'the district has shared interior casters');
  assert.deepEqual(interiors.userData.shadowProxies, proxies);
  assert.equal(new Set(members).size, members.length, 'no batch belongs to two proxies');
  for (const proxy of proxies) {
    const own = proxy.userData.members;
    assert.ok(own.length >= 2, 'a proxy replaces at least two batches');
    assert.equal(proxy.castShadow, true);
    assert.equal(proxy.visible, false, 'hidden except while the sun draws its map');
    assert.ok(plainDepthMaterial(proxy.material), 'front-sided plain depth, like the casters it replaces');
    for (const mesh of own) {
      assert.equal(mesh.geometry, proxy.geometry, 'the same triangles, not a copy');
      assert.equal(mesh.castShadow, false, 'a merged batch stops casting for itself');
      assert.ok(plainDepthMaterial(mesh.material), 'only finishes the plain depth pass draws identically are merged');
    }
    assert.deepEqual(matrices(proxy), own.flatMap(matrices), 'every merged instance keeps its exact matrix');
  }
});

test('the plain depth check refuses cutout, double-sided and wireframe casters', () => {
  assert.equal(plainDepthMaterial(new THREE.MeshStandardMaterial()), true);
  assert.equal(plainDepthMaterial(new THREE.MeshStandardMaterial({ alphaTest: 0.5, map: new THREE.Texture() })), false);
  assert.equal(plainDepthMaterial(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })), false);
  assert.equal(plainDepthMaterial(new THREE.MeshStandardMaterial({ shadowSide: THREE.FrontSide })), false);
  assert.equal(plainDepthMaterial(new THREE.MeshStandardMaterial({ wireframe: true })), false);
  assert.equal(plainDepthMaterial([new THREE.MeshStandardMaterial()]), false);
});

test('switching the batching off restores every batch’s own casting, and back', () => {
  const batched = casters();
  interiors.userData.shadowBatch(false);
  const own = casters();
  assert.deepEqual(interiors.userData.shadowProxies, []);
  assert.ok(proxies.every(proxy => !proxy.visible && !interiors.userData.shadowProxies.includes(proxy)));
  assert.ok(members.every(mesh => mesh.castShadow), 'every merged batch casts for itself again');
  assert.deepEqual(others.map(mesh => mesh.castShadow), othersCasting, 'batches that were never merged are untouched');
  assert.equal(own - batched, members.length - proxies.length, 'each proxy draws once for its batches');
  assert.ok(batched <= own * 0.75, `shadow draws ${own} -> ${batched}: at least a quarter fewer`);
  interiors.userData.shadowBatch(true);
  assert.equal(casters(), batched);
  assert.deepEqual(interiors.userData.shadowProxies, proxies);
  assert.ok(members.every(mesh => !mesh.castShadow));
});

test('the sun shows a proxy only inside its shadow frustum and under shown ancestors', () => {
  const light = new THREE.DirectionalLight(); light.position.set(0, 20, 0);
  light.updateMatrixWorld(); light.target.updateMatrixWorld();
  const layer = new THREE.Group(), near = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), far = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  far.position.set(500, 0, 0); near.visible = far.visible = false;
  layer.add(near, far); layer.updateMatrixWorld(true);
  castShadowsFromProxies(light, () => [near, far]);
  light.shadow.updateMatrices(light);
  assert.equal(near.visible, true);
  assert.equal(far.visible, false, 'outside the shadow frustum');
  layer.visible = false; near.visible = false;
  light.shadow.updateMatrices(light);
  assert.equal(near.visible, false, 'a hidden layer’s proxy is never left shown');
});

test('disposing the interiors releases the proxies', () => {
  let released = 0;
  for (const proxy of proxies) proxy.addEventListener('dispose', () => released++);
  interiors.userData.dispose();
  assert.equal(released, proxies.length);
});
