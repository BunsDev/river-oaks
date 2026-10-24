import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { createWalkingEnvironment, createWalkingState, guardedStepEnvironment, stepWalking } from '../src/walking.js';
import { createCommonsStream } from '../src/commons-stream.js';
import { buildHeightsNeighborhood } from '../src/bayou-heights.js';
import { createHeightsStream, heightsCommonsLayout, HEIGHTS_CHUNK_BYTES, HEIGHTS_MAX_BYTES, HEIGHTS_VIEW_METRES } from '../src/heights-stream.js';
const world = await loadDistrictData({ districtRevision: 'bayou-heights-1' });
const layout = world.eastGardenCommons, edge = layout.edge, west = layout.heights.bounds[0], MiB = 1024 * 1024;
const at = ([x, y]) => [edge + x, -1335 + y];
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 5)); };
// Until nothing is loading and the resident set holds still.
const settle = async (stream, points, camera) => {
  let last = '', still = 0;
  for (let i = 0; i < 400 && still < 3; i++) {
    stream.update(points, camera); await flush();
    const now = JSON.stringify(stream.debug().chunks.map(chunk => chunk.state));
    still = stream.debug().pending === 0 && now === last ? still + 1 : 0; last = now;
  }
};
const resident = stream => stream.debug().chunks.filter(chunk => chunk.state === 'ready').map(chunk => chunk.id.replace(/^bayou-heights\/?/, '') || 'shared').sort();
// Stand-ins that own exactly `bytes` of geometry; a failed id never loads.
const sized = bytes => {
  const group = new THREE.Group(), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.round(bytes / 4)), 1));
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  Object.assign(group.userData, { ready: Promise.resolve(), update() {}, shadowProxies: [], stats: () => ({ meshes: 1, triangles: 0 }), dispose() { geometry.dispose(); } });
  return group;
};
const standIns = (failing = new Set()) => async () => ({
  buildHeightsLandscape: () => sized(HEIGHTS_CHUNK_BYTES['bayou-heights'] * .9),
  buildHeightsNeighborhood(_layout, plan) { if (failing.has(plan.id)) throw new Error('offline'); return sized(HEIGHTS_CHUNK_BYTES[plan.id] * .9); },
});
const camera = (from, toward) => {
  const view = new THREE.PerspectiveCamera(55, 1.5, .1, 6000);
  view.position.set(from[0], layout.ground + 3, -from[1]); view.lookAt(toward[0], layout.ground + 3, -toward[1]); view.updateMatrixWorld();
  return view;
};

test('Heights streams in parts near the footbridge and is released in the District, without changing world data', async () => {
  const parent = new THREE.Group(), before = structuredClone(world), scenes = [];
  const stream = createHeightsStream({ world, parent, onScene: scene => scenes.push(scene) });
  const scene = scenes[0], counts = [];
  assert.equal(scene.name, 'Bayou Heights'); assert.equal(parent.children[0], scene);
  for (let i = 0; i < 4; i++) {
    await settle(stream, [[west - 10, -1335]]);
    assert.equal(stream.ready(), true);
    assert.deepEqual(resident(stream), ['bayou-greenway', 'shared', 'yale-icehouse'], 'the footbridge brings in the shared part and the two nearest neighborhoods');
    assert.deepEqual(scene.children.map(part => part.name).sort(), ['bayou-heights/bayou-greenway', 'bayou-heights/landscape', 'bayou-heights/yale-icehouse']);
    const { residentBytes, measuredBytes, estimatedBytes } = stream.debug();
    assert.ok(residentBytes <= HEIGHTS_MAX_BYTES, `${residentBytes} bytes`);
    for (const [id, bytes] of Object.entries(measuredBytes)) assert.ok(bytes <= estimatedBytes[id], `${id}: ${bytes} > ${estimatedBytes[id]}`);
    const geometries = new Set(), materials = new Set(); let disposed = 0;
    scene.traverse(item => { if (item.geometry) geometries.add(item.geometry); if (item.material) materials.add(item.material); });
    for (const item of [...geometries, ...materials]) item.addEventListener('dispose', () => disposed++);
    counts.push([geometries.size, materials.size, residentBytes]);
    stream.update([[edge - 200, -1335]]);
    assert.equal(scene.children.length, 0); assert.equal(stream.debug().residentBytes, 0);
    assert.equal(disposed, geometries.size + materials.size);
  }
  assert.ok(counts.every(count => JSON.stringify(count) === JSON.stringify(counts[0])));
  stream.dispose();
  assert.equal(parent.children.length, 0); assert.deepEqual(scenes, [scene, null]);
  assert.deepEqual(world, before);
});

test('chunk estimates err high: each neighborhood owns no more geometry than its estimate', () => {
  for (const plan of layout.heights.plans) {
    const kit = buildHeightsNeighborhood(layout, plan), buffers = new Set();
    kit.traverse(item => { if (item.geometry) for (const attribute of [...Object.values(item.geometry.attributes), item.geometry.index].filter(Boolean)) buffers.add(attribute.array.buffer); });
    const bytes = [...buffers].reduce((n, buffer) => n + buffer.byteLength, 0), estimate = HEIGHTS_CHUNK_BYTES[plan.id];
    assert.ok(bytes <= estimate && estimate <= bytes * 1.25, `${plan.id}: ${(bytes / MiB).toFixed(2)} MiB against ${(estimate / MiB).toFixed(2)} MiB`);
    kit.userData.dispose();
  }
});

test('under the ceiling the shared part, the neighborhood underfoot and those in view stay; turning brings the one behind back', async () => {
  const stream = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule: standIns() });
  const crossroads = at([300, -8]), points = [crossroads];
  assert.ok(Object.values(HEIGHTS_CHUNK_BYTES).reduce((n, bytes) => n + bytes * .9, 0) > HEIGHTS_MAX_BYTES, 'Heights is larger than one ceiling');
  await settle(stream, points, camera(crossroads, at([300, 100])));
  let kept = resident(stream);
  for (const id of ['shared', 'nineteenth-and-yale', 'yale-street-north']) assert.ok(kept.includes(id), `${id} in ${kept}`);
  assert.equal(kept.includes('yale-street-south'), false, 'the neighborhood behind the camera streams out');
  assert.ok(stream.debug().residentBytes <= HEIGHTS_MAX_BYTES);
  await settle(stream, points, camera(crossroads, at([300, -100])));
  kept = resident(stream);
  for (const id of ['shared', 'nineteenth-and-yale', 'yale-street-south']) assert.ok(kept.includes(id), `${id} in ${kept}`);
  assert.equal(kept.includes('yale-street-north'), false);
  assert.ok(stream.debug().residentBytes <= HEIGHTS_MAX_BYTES);
  stream.dispose();
});

test('crossing the footbridge, or into a neighborhood still loading, waits; the Commons gate does not hold anyone in Heights', async () => {
  let release; const loaded = new Promise(resolve => { release = resolve; });
  const stream = createHeightsStream({ world, parent: new THREE.Group(), loadModule: () => loaded });
  const shared = createWalkingEnvironment(world), guards = [(from, to) => stream.allowsStep(from, to)];
  const walker = createWalkingState(shared, [west - 3, -1335, 0], -Math.PI / 2);
  stream.update([[west - 3, -1335]]); await flush();
  for (let i = 0; i < 100; i++) stepWalking(walker, guardedStepEnvironment(shared, [walker.position[0], -walker.position[2]], guards), { forward: 1 }, .04);
  assert.ok(walker.position[0] <= west - .35, 'entry waits for presentation');
  assert.equal(stream.allowsStep([west + 20, -1335], [west + 19, -1335]), true, 'someone restored in Heights can retreat west');
  assert.equal(stream.allowsStep([west + 20, -1335], [west + 21, -1335]), false);
  release(await import('../src/bayou-heights.js')); await settle(stream, [[west - 3, -1335]]);
  for (let i = 0; i < 100; i++) stepWalking(walker, guardedStepEnvironment(shared, [walker.position[0], -walker.position[2]], guards), { forward: 1 }, .04);
  assert.ok(walker.position[0] > west + 5, 'the loaded crossing proceeds');
  stream.dispose();
  // Yale Street North never loads: from presented Nineteenth & Yale ground, its edge waits.
  const notices = [], partial = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, onStatus: text => notices.push(text), loadModule: standIns(new Set(['yale-street-north'])) });
  const lane = at([300, 62]);
  await settle(partial, [lane]);
  assert.equal(partial.allowsStep(lane, at([300, 63])), true);
  assert.equal(partial.allowsStep(lane, at([300, 65])), false, 'the next neighborhood waits to load');
  assert.equal(partial.allowsStep(lane, at([300, 60])), true);
  assert.match(notices.at(-1), /Bayou Heights is still loading/);
  partial.dispose();
  // The Commons, streamed with its bayou opened for the bridge, gates only its own ground.
  const commons = createCommonsStream({ world, layout: heightsCommonsLayout(layout), parent: new THREE.Group() });
  assert.equal(commons.ready(), false);
  assert.equal(commons.allowsStep([west + 50, -1335], [west + 51, -1335]), true, 'an unloaded Commons does not hold Heights walkers');
  assert.equal(commons.allowsStep([edge + 5, -1335], [edge + 6, -1335]), false, 'unloaded Commons entry still waits');
  commons.dispose();
});

test('a camera streams in the Heights it can see from the Commons, not from the District gateway', async () => {
  const stream = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule: standIns() });
  const gateway = at([-19, 0]), plaza = at([60, -1.5]), deep = [west - HEIGHTS_VIEW_METRES - 40, -1335];
  await settle(stream, [deep], camera(deep, at([300, 0])));
  assert.deepEqual(resident(stream), [], 'deep in the District, looking east loads nothing');
  await settle(stream, [gateway], camera(gateway, at([300, 0])));
  assert.deepEqual(resident(stream), [], 'nor does the District gateway looking down Market Street');
  await settle(stream, [plaza], camera(plaza, at([300, 0])));
  assert.equal(stream.ready(), true, 'the Commons plaza looking east sees the footbridge and the greenway');
  await settle(stream, [gateway], camera(gateway, at([-300, 0])));
  assert.deepEqual(resident(stream), [], 'back at the gateway looking west, it is released');
  stream.dispose();
});

test('the footbridge explains loading, failure and recovery; arrival elsewhere stays quiet', async () => {
  let time = 0, attempts = 0; const notices = [];
  const stream = createHeightsStream({ world, parent: new THREE.Group(), now: () => time, onStatus: text => notices.push(text),
    loadModule: async () => { if (++attempts === 1) throw new Error('offline'); return import('../src/bayou-heights.js'); } });
  stream.update([[edge + 30, -1335]]);
  assert.deepEqual(notices, [], 'the Commons plaza says nothing about Heights');
  stream.update([[west - 5, -1335]]); await flush(); stream.update([[west - 5, -1335]]);
  assert.match(notices.at(-1), /Bayou Heights is still loading\. Retrying/);
  time = 1001; await settle(stream, [[west - 5, -1335]]);
  assert.equal(stream.ready(), true); assert.equal(notices.at(-1), '');
  stream.dispose();
  const restored = [], waiting = createHeightsStream({ world, parent: new THREE.Group(), onStatus: text => restored.push(text), loadModule: () => new Promise(() => {}) });
  waiting.update([[west + 150, -1300]]); await flush(); waiting.update([[west + 150, -1300]]);
  assert.match(restored.at(-1), /You can return west while it loads/, 'someone restored deep in Heights is told why they wait');
  waiting.dispose();
});
