import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Each oak template: a trunk and one leaf shell, enough for the instanced batches.
globalThis.document ??= { querySelector: () => null, dispatchEvent: () => true };
globalThis.CustomEvent ??= class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
GLTFLoader.prototype.loadAsync = async () => {
  const scene = new THREE.Group();
  const part = (name, geometry, y) => { const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name })); mesh.position.y = y; scene.add(mesh); };
  part('bark', new THREE.CylinderGeometry(.3, .4, 4, 6), 2); part('leaves', new THREE.IcosahedronGeometry(3, 1), 6);
  scene.updateMatrixWorld(true);
  return { scene };
};
const { buildMatureTrees, matureTreePlacements, TREE_DETAIL_TILE_M, TREE_SHADOW_TILE_M } = await import('../src/landscape-models.js');

const read = path => readFileSync(new URL(path, import.meta.url));
const world = JSON.parse(read('../public/data/district.json'));
world.vegetation = JSON.parse(read('../public/data/district-vegetation.json'));

// Every instance matrix each proxy geometry draws, as a sorted multiset.
function shadowInstances(proxies) {
  const matrix = new THREE.Matrix4(), byPart = new Map();
  for (const proxy of proxies) {
    const list = byPart.get(proxy.geometry) ?? []; byPart.set(proxy.geometry, list);
    for (let i = 0; i < proxy.count; i++) { proxy.getMatrixAt(i, matrix); list.push(matrix.elements.join(',')); }
  }
  return [...byPart.values()].map(list => list.sort());
}

// #289: the sun-shadow silhouettes batch on a coarser grid than the crown detail tiles.
test('tree shadow proxies draw the same instances in fewer, larger batches', async () => {
  const trees = buildMatureTrees(world);
  await trees.userData.ready;
  const proxies = trees.userData.shadowProxies, casting = () => trees.children.filter(mesh => mesh.castShadow);
  assert.ok(proxies.length && proxies.every(proxy => proxy.isInstancedMesh && proxy.castShadow && !proxy.visible), 'hidden instanced casters');
  assert.equal(casting().length, proxies.length, 'only the proxies cast');
  const batched = proxies.length, coarse = shadowInstances(proxies);
  assert.equal(coarse.reduce((sum, list) => sum + list.length, 0), 2 * matureTreePlacements(world).length, 'every tree once per silhouette part');
  assert.ok(TREE_SHADOW_TILE_M > TREE_DETAIL_TILE_M);
  const fine = trees.userData.shadowTile(TREE_DETAIL_TILE_M);
  assert.ok(batched * 2 <= fine, `at most half the shadow draws (${batched} vs ${fine} at ${TREE_DETAIL_TILE_M} m)`);
  assert.equal(casting().length, fine, 'retiling replaces the previous proxies');
  assert.deepEqual(shadowInstances(proxies), coarse, 'the same silhouettes at the same transforms');
  const detailTiles = new Set(matureTreePlacements(world).map(({ position: [x, , z] }) => `${Math.floor(x / 12)}:${Math.floor(z / 12)}`));
  assert.equal(trees.children.filter(mesh => !mesh.castShadow).length, detailTiles.size * 3 * 2, 'crowns keep three levels of both parts per 12 m tile');
});
