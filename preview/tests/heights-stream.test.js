import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { createWalkingEnvironment, createWalkingState, guardedStepEnvironment, stepWalking } from '../src/walking.js';
import { createCommonsStream } from '../src/commons-stream.js';
import { buildHeightsNeighborhood } from '../src/bayou-heights.js';
import { createHeightsStream, heightsCommonsLayout, ownedTextureBytes, HEIGHTS_CHUNK_BYTES, HEIGHTS_MAX_BYTES, HEIGHTS_VIEW_HOLD_MS, HEIGHTS_VIEW_METRES } from '../src/heights-stream.js';
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
  let time = 0, builds = 0; const load = standIns();
  const stream = createHeightsStream({ world, parent: new THREE.Group(), now: () => time,
    loadModule: async () => { const module = await load(); return { ...module, buildHeightsNeighborhood: (...args) => { builds++; return module.buildHeightsNeighborhood(...args); } }; } });
  const crossroads = at([300, -8]), points = [crossroads];
  assert.ok(Object.values(HEIGHTS_CHUNK_BYTES).reduce((n, bytes) => n + bytes * .9, 0) > HEIGHTS_MAX_BYTES, 'Heights is larger than one ceiling');
  await settle(stream, points, camera(crossroads, at([300, 100])));
  let kept = resident(stream);
  for (const id of ['shared', 'nineteenth-and-yale', 'yale-street-north']) assert.ok(kept.includes(id), `${id} in ${kept}`);
  // More of Heights is in view than the ceiling holds. The neighborhood behind the camera may use
  // room left over, never room that one still absent could take in its place.
  const { residentBytes, measuredBytes, estimatedBytes, chunks } = stream.debug(), behind = 'bayou-heights/yale-street-south';
  assert.ok(chunks.some(chunk => chunk.state === 'absent'), 'some of Heights waits for room');
  if (kept.includes('yale-street-south')) for (const { id } of chunks.filter(chunk => chunk.state === 'absent'))
    assert.ok(residentBytes - measuredBytes[behind] + estimatedBytes[id] > HEIGHTS_MAX_BYTES, `${id} would fit in place of the neighborhood behind`);
  assert.ok(residentBytes <= HEIGHTS_MAX_BYTES);
  // A glance south is not a turn: what was just in view keeps its place and nothing is rebuilt.
  const before = builds;
  time += HEIGHTS_VIEW_HOLD_MS / 2; await settle(stream, points, camera(crossroads, at([300, -100])));
  assert.ok(resident(stream).includes('yale-street-north')); assert.equal(builds, before);
  time += HEIGHTS_VIEW_HOLD_MS; await settle(stream, points, camera(crossroads, at([300, -100])));
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

test('twenty round trips over the footbridge with the real builders: every lap bounded, released whole and rebuilt alike', async () => {
  const parent = new THREE.Group(), before = structuredClone(world);
  const stream = createHeightsStream({ world, parent });
  const scene = parent.children[0], laps = [];
  for (let lap = 1; lap <= 20; lap++) {
    await settle(stream, [[west - 10, -1335]]);
    assert.equal(stream.ready(), true);
    assert.deepEqual(resident(stream), ['bayou-greenway', 'shared', 'yale-icehouse']);
    const names = scene.children.map(part => part.name);
    assert.equal(new Set(names).size, names.length, `no duplicate groups: ${names}`);
    const { residentBytes, residentTextureBytes, measuredBytes, measuredTextureBytes, estimatedBytes, loads, unloads, pending } = stream.debug();
    assert.ok(residentBytes <= HEIGHTS_MAX_BYTES && residentBytes > 0, `${residentBytes} bytes`);
    for (const [id, bytes] of Object.entries(measuredBytes)) assert.ok(bytes <= estimatedBytes[id], `${id}: ${bytes} > ${estimatedBytes[id]}`);
    // Each neighborhood's tree grate is a DataTexture it owns even headless; the sign atlases need a canvas.
    const ready = resident(stream).map(id => id === 'shared' ? 'bayou-heights' : `bayou-heights/${id}`);
    assert.equal(residentTextureBytes, ready.reduce((bytes, id) => bytes + measuredTextureBytes[id], 0));
    assert.ok(measuredTextureBytes['bayou-heights/yale-icehouse'] > 0 && measuredTextureBytes['bayou-heights/bayou-greenway'] > 0);
    assert.equal(loads, 3 * lap); assert.equal(unloads, 3 * (lap - 1)); assert.equal(pending, 0);
    const geometries = new Set(), materials = new Set(), textures = new Set(); let disposed = 0;
    scene.traverse(item => {
      if (item.geometry) geometries.add(item.geometry);
      for (const material of [item.material].flat().filter(Boolean)) { materials.add(material); for (const value of Object.values(material)) if (value?.isTexture && value.userData?.owned) textures.add(value); }
    });
    for (const item of [...geometries, ...materials, ...textures]) item.addEventListener('dispose', () => disposed++);
    laps.push([geometries.size, materials.size, textures.size, residentBytes, residentTextureBytes]);
    // Home to the District: every owned geometry, material and texture is disposed exactly once.
    stream.update([[edge - 200, -1335]]);
    assert.equal(scene.children.length, 0);
    assert.deepEqual([stream.debug().residentBytes, stream.debug().residentTextureBytes, stream.debug().pending], [0, 0, 0]);
    assert.equal(disposed, geometries.size + materials.size + textures.size);
    assert.ok(textures.size > 0);
  }
  assert.ok(laps.every(lap => JSON.stringify(lap) === JSON.stringify(laps[0])), `laps differ: ${JSON.stringify(laps)}`);
  assert.equal(stream.debug().unloads, 60);
  stream.dispose();
  assert.deepEqual(world, before);
});

test('laps along the whole chain to Woodland Heights and back, with the real builders, stay under the ceiling and release everything', async () => {
  const { loadDistrictData: load } = await import('../../server/district-data.js');
  const chain = await loadDistrictData({ districtRevision: 'woodland-heights-1' }), plans = chain.eastGardenCommons.heights.plans;
  const parent = new THREE.Group(), stream = createHeightsStream({ world: chain, parent }), scene = parent.children[0];
  const underfoot = ([x, y]) => plans.find(({ site: [w, s, e, n] }) => x >= w && x <= e && y >= s && y <= n)?.id ?? null;
  // District, the Commons, the footbridge landing, then east along the Heights' central row into Studewood and Woodland.
  const out = [[edge - 200, -1335], [edge + 60, -1335], [west - 10, -1335], [-2470, -1335], [-2360, -1335], [-2275, -1335], [-2210, -1335], [-2135, -1335]];
  const route = [...out, ...out.slice(0, -1).reverse()], laps = [];
  for (let lap = 1; lap <= 3; lap++) {
    const stops = [];
    for (const point of route) {
      await settle(stream, [point]);
      const { residentBytes, residentTextureBytes, measuredBytes, estimatedBytes, pending, chunks } = stream.debug();
      assert.ok(residentBytes <= HEIGHTS_MAX_BYTES, `${point}: ${residentBytes} bytes`);
      for (const [id, bytes] of Object.entries(measuredBytes)) assert.ok(bytes <= estimatedBytes[id], `${id}: ${bytes} > ${estimatedBytes[id]}`);
      assert.equal(pending, 0);
      const names = scene.children.map(part => part.name);
      assert.equal(new Set(names).size, names.length, `no duplicate groups at ${point}: ${names}`);
      assert.deepEqual(names.sort(), chunks.filter(chunk => chunk.state === 'ready').map(chunk => chunk.id === 'bayou-heights' ? 'bayou-heights/landscape' : chunk.id).sort(), 'the scene holds exactly the ready chunks');
      const plan = underfoot(point);
      if (plan) assert.equal(stream.state(`bayou-heights/${plan}`), 'ready', `${plan} presented at ${point}`);
      if (plan === 'woodland-heights-north') assert.deepEqual(resident(stream).filter(id => id.startsWith('yale') || id.startsWith('bayou-greenway')), [], 'the Heights west of the bayou are released by Woodland');
      stops.push([resident(stream).join(','), residentBytes, residentTextureBytes]);
    }
    assert.deepEqual([scene.children.length, stream.debug().residentBytes, stream.debug().residentTextureBytes], [0, 0, 0], 'home in the District nothing stays');
    assert.equal(stream.debug().loads, stream.debug().unloads);
    laps.push(stops);
  }
  assert.ok(laps.every(lap => JSON.stringify(lap) === JSON.stringify(laps[0])), 'every lap streams the same chunks at the same stops');
  assert.ok(laps[0].some(([ids]) => ids.includes('studewood-north')) && laps[0].some(([ids]) => ids.includes('woodland-heights-north')));
  stream.dispose();
  assert.equal(parent.children.length, 0);
});

test('owned textures are measured beside the geometry ceiling; shared textures and the ceiling itself are untouched', async () => {
  // A DataTexture makes no mipmaps unless asked; a CanvasTexture (the sign atlases) does.
  const owned = new THREE.DataTexture(new Uint8Array(64 * 64 * 4), 64, 64); owned.userData.owned = true; owned.generateMipmaps = true;
  const shared = new THREE.DataTexture(new Uint8Array(128 * 128 * 4), 128, 128), flat = new THREE.DataTexture(new Uint8Array(32 * 32 * 4), 32, 32);
  flat.generateMipmaps = false; flat.userData.owned = true;
  const textured = () => {
    const group = sized(HEIGHTS_CHUNK_BYTES['yale-icehouse'] * .9);
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), [new THREE.MeshStandardMaterial({ map: owned }), new THREE.MeshStandardMaterial({ map: shared, emissiveMap: flat })]));
    return group;
  };
  assert.equal(ownedTextureBytes(textured()), Math.round(64 * 64 * 4 * 4 / 3) + 32 * 32 * 4, 'mipmapped and flat owned textures, never the shared one');
  const stream = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule: async () => ({
    buildHeightsLandscape: () => sized(HEIGHTS_CHUNK_BYTES['bayou-heights'] * .9),
    buildHeightsNeighborhood: (_layout, plan) => plan.id === 'yale-icehouse' ? textured() : sized(HEIGHTS_CHUNK_BYTES[plan.id] * .9),
  }) });
  await settle(stream, [[west - 10, -1335]]);
  const { residentBytes, residentTextureBytes, measuredTextureBytes, measuredBytes } = stream.debug();
  assert.equal(measuredTextureBytes['bayou-heights/yale-icehouse'], 21845 + 4096);
  assert.equal(measuredTextureBytes['bayou-heights/bayou-greenway'], 0);
  assert.equal(residentTextureBytes, 21845 + 4096);
  assert.equal(residentBytes, Object.entries(measuredBytes).filter(([id]) => resident(stream).includes(id.replace(/^bayou-heights\/?/, '') || 'shared')).reduce((n, [, bytes]) => n + bytes, 0), 'the geometry ceiling counts geometry only');
  stream.update([[edge - 200, -1335]]);
  assert.equal(stream.debug().residentTextureBytes, 0);
  stream.dispose();
});

test('on the Terraces revisions, walking home into the District releases Heights instead of keeping it resident', async () => {
  const chain = await loadDistrictData({ districtRevision: 'woodland-heights-1' }), ground = chain.eastGardenCommons.ground;
  const stream = createHeightsStream({ world: chain, parent: new THREE.Group(), now: () => 0, loadModule: standIns() });
  await settle(stream, [[west - 10, -1335]]);
  assert.ok(stream.debug().residentBytes > 0 && stream.ready());
  // The camera's ground point is in the District too (main.js passes both). An invalid position still evicts nothing.
  const home = [edge - 200, -1335];
  await settle(stream, [[NaN, -1335]], camera(home, [west, -1335]));
  assert.ok(stream.debug().residentBytes > 0, 'an invalid position keeps the scene');
  await settle(stream, [home], camera(home, [west, -1335]));
  assert.deepEqual([stream.debug().residentBytes, stream.debug().pending, resident(stream)], [0, 0, []], 'the District anchors nothing in Heights');
  // Back at the footbridge it all streams in again, so the way home is not one-way.
  await settle(stream, [[west - 10, -1335]]);
  assert.equal(stream.ready(), true);
  stream.dispose();
});
