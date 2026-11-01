import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { planStoreRooms } from '../src/store-rooms.js';
import { isCartierRoom, brassRoughnessPixels } from '../src/cartier-pilot.js';
import { buildStoreInteriors } from '../src/store-interiors.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const rooms = planStoreRooms(world), cartier = rooms.find(room => room.name === 'Cartier');
// Procedural canvas calls only: GPU rendering is verified by the browser journey.
const context = () => new Proxy({}, { get: (target, name) => name === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : target[name] ?? (() => {}), set: (target, name, value) => { target[name] = value; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: context }) };
globalThis.requestIdleCallback = () => 0;

test('only the mapped Cartier jewelry room receives the pilot', () => {
  assert.deepEqual(rooms.filter(isCartierRoom), [cartier]);
  assert.equal(isCartierRoom({ ...cartier, name: 'Renamed salon' }), true, 'identity survives a display-name change');
  for (const room of [null, {}, { ...cartier, storeId: 'unrelated' }, { ...cartier, theme: 'fashion' }, { ...cartier, generatedPlan: {} }]) assert.equal(isCartierRoom(room), false);
});

test('brushed brass roughness is deterministic, directional and bounded', () => {
  const { data, width, height } = brassRoughnessPixels();
  assert.equal(width, 128); assert.equal(height, 128);
  assert.deepEqual(brassRoughnessPixels().data, data);
  let across = 0, along = 0;
  for (let y = 0; y < height - 1; y++) for (let x = 0; x < width - 1; x++) {
    const i = (y * width + x) * 4;
    assert.ok(data[i] >= 160 && data[i] <= 230);
    assert.equal(data[i], data[i + 1]); assert.equal(data[i], data[i + 2]); assert.equal(data[i + 3], 255);
    across += Math.abs(data[i] - data[i + width * 4]);
    along += Math.abs(data[i] - data[i + 4]);
  }
  assert.ok(across > along * 4, 'grain runs along the horizontal brush direction');
});

const pilotMeshes = group => { const found = []; group.traverse(item => { if (item.material?.name.startsWith('cartier-')) found.push(item); }); return found; };
test('renderer selects Cartier finishes, preserves plans and keeps other-store fallback', () => {
  const before = JSON.stringify(rooms), other = rooms.find(room => room.theme === 'jewelry' && room !== cartier);
  const generic = buildStoreInteriors([other]);
  assert.equal(pilotMeshes(generic).length, 0);
  assert.ok(generic.children.some(item => item.material?.name === 'interior-brass'));
  generic.userData.dispose();
  const group = buildStoreInteriors([cartier, other]);
  const meshes = pilotMeshes(group), names = new Set(meshes.map(item => item.material.name));
  for (const name of ['brass', 'lacquer', 'velvet', 'stone', 'glass', 'wall']) assert.ok(names.has(`cartier-${name}`), `${name} is rendered`);
  assert.ok(group.children.some(item => item.material?.name === 'interior-brass'), 'neighbour retains generic brass');
  assert.ok(meshes.every(item => item.isInstancedMesh), 'finish changes preserve instancing');
  assert.equal(JSON.stringify(rooms), before, 'rendering does not mutate authoritative layout or fixtures');
  const brass = meshes.find(item => item.material.name === 'cartier-brass').material;
  assert.equal(brass.roughnessMap.colorSpace, THREE.NoColorSpace);
  assert.equal(brass.roughnessMap.wrapS, THREE.RepeatWrapping);
  const resources = new Set();
  for (const mesh of meshes) {
    resources.add(mesh.material);
    for (const value of Object.values(mesh.material)) if (value?.isTexture) resources.add(value);
  }
  const disposals = new Map();
  for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  group.userData.dispose();
  for (const resource of resources) assert.equal(disposals.get(resource), 1, `${resource.name || resource.type} disposed exactly once`);
  assert.equal(group.children.length, 0);
});

test('source-matched comparison disables only the pilot and keeps geometry identical', () => {
  const baseline = buildStoreInteriors([cartier], { cartierPilot: false });
  const pilot = buildStoreInteriors([cartier]);
  assert.equal(pilotMeshes(baseline).length, 0, 'comparison must use original finishes');
  const placements = group => {
    const values = [];
    group.traverse(item => {
      if (!item.isInstancedMesh) return;
      for (let i = 0; i < item.count; i++) {
        const matrix = new THREE.Matrix4(); item.getMatrixAt(i, matrix);
        values.push(JSON.stringify([item.geometry.type, matrix.elements]));
      }
    });
    return values.sort();
  };
  assert.deepEqual(placements(pilot), placements(baseline), 'all fixture positions and scales match the baseline');
  for (const group of [baseline, pilot]) group.userData.dispose();
});
