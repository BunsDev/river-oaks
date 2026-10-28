import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { KIT_FINISHES, PINK_JET_AGE } from '../../shared/city-kit/catalog.js';
import { DEFAULT_FINISH, readFinishPreference } from '../src/render-quality.js';
import { COMMONS_DESTINATION_BYTES, createCommonsStream } from '../src/commons-stream.js';
import { createHeightsStream, heightsCommonsLayout, HEIGHTS_CHUNK_BYTES } from '../src/heights-stream.js';
import { buildEastGardenCommons } from '../src/east-garden-commons.js';
import { buildHeightsLandscape, buildHeightsNeighborhood } from '../src/bayou-heights.js';

// The live Commons and Heights take the city-kit finish only by opt-in (#742, under #738).
const commonsWorld = await loadDistrictData({ districtRevision: 'east-garden-commons-market-1' });
const heightsWorld = await loadDistrictData({ districtRevision: 'bayou-heights-1' });
const PINK = 'pink-jet-age', brand = new THREE.Color(PINK_JET_AGE.pink).getHexString();
const flush = () => new Promise(resolve => setTimeout(resolve, 10));
const store = (value, key = 'river-oaks-finish') => ({ getItem: name => name === key ? value : null, setItem() { throw new Error('the reader never writes'); } });
const kitsIn = group => { const kits = []; group.traverse(item => { if (item.name?.startsWith('City kit: ')) kits.push(item); }); return kits; };
// Every mesh outside the kit's per-block facade detail, with its vertex count and material name.
const shape = group => { const meshes = []; group.traverse(item => { if (item.isMesh && !item.parent?.name?.endsWith(' detail')) meshes.push([item.name, item.geometry.attributes.position.count, item.material.name]); }); return meshes; };
const colours = group => { const found = new Set(); group.traverse(item => { if (item.isMesh) found.add(item.material.color?.getHexString()); }); return found; };
const dispose = group => group.userData.dispose();

test('the finish preference is classic unless opted in, and never throws', () => {
  assert.equal(DEFAULT_FINISH, 'classic');
  assert.equal(readFinishPreference({ search: '', storage: store(null) }), 'classic');
  assert.equal(readFinishPreference({ search: '', storage: null }), 'classic');
  // Node has neither location nor localStorage: the live default.
  assert.equal(readFinishPreference(), 'classic');
  assert.equal(readFinishPreference({ search: '?finish=pink-jet-age', storage: store(null) }), PINK);
  assert.equal(readFinishPreference({ search: '?world=x', storage: store(PINK) }), PINK, 'a stored opt-in persists');
  assert.equal(readFinishPreference({ search: '?finish=classic', storage: store(PINK) }), 'classic', 'the address overrides a stored choice');
  // Malformed values read as classic here; unknown well-formed names are rejected by the builders.
  for (const value of ['', 'PINK', '<script>', 'x'.repeat(40), '../classic'])
    assert.equal(readFinishPreference({ search: `?finish=${encodeURIComponent(value)}`, storage: store(PINK) }), 'classic', value);
  assert.equal(readFinishPreference({ search: '', storage: { getItem() { throw new Error('blocked'); } } }), 'classic');
  assert.equal(readFinishPreference({ search: '', storage: store('{"mode":"pink"}') }), 'classic');
});

test('the Commons builder passes a valid finish to the kit and its pavilion, and an unknown one renders classic', () => {
  const layout = commonsWorld.eastGardenCommons, before = structuredClone(commonsWorld);
  const classic = buildEastGardenCommons(layout), pink = buildEastGardenCommons(layout, { finish: PINK });
  const unknown = buildEastGardenCommons(layout, { finish: 'brutalist' }), hostile = buildEastGardenCommons(layout, { finish: { toString: () => PINK } });
  assert.equal(classic.userData.finish, 'classic'); assert.equal(pink.userData.finish, PINK);
  assert.equal(unknown.userData.finish, 'classic'); assert.equal(hostile.userData.finish, 'classic');
  assert.deepEqual(kitsIn(classic).map(kit => kit.userData.finish), ['classic']);
  assert.deepEqual(kitsIn(pink).map(kit => kit.userData.finish), [PINK], 'the opt-in reaches buildCityKit');
  assert.deepEqual(kitsIn(unknown).map(kit => kit.userData.finish), ['classic']);
  // Classic is byte-for-byte the default, and an unknown name is classic.
  assert.deepEqual(shape(unknown), shape(classic)); assert.deepEqual([...colours(unknown)], [...colours(classic)]);
  assert.ok(!colours(classic).has(brand), 'classic shows no Pink Jet-Age pink');
  // Outside the kit's facade detail the meshes, vertices and material slots are identical.
  assert.deepEqual(shape(pink), shape(classic));
  // The pavilion's own fascia takes the kit's teal-trim slot: pink.
  const fascia = group => group.children.filter(item => item.isMesh && item.geometry.parameters?.height === .32).map(mesh => mesh.material.color.getHexString());
  assert.deepEqual(fascia(classic), [new THREE.Color('#317b7d').getHexString()]);
  assert.deepEqual(fascia(pink), [brand]);
  for (const group of [classic, pink, unknown, hostile]) dispose(group);
  assert.deepEqual(commonsWorld, before, 'rendering never writes the layout, its plan or its collision');
});

test('the Commons stream builds with the opted-in finish, and with classic by default', async () => {
  const edge = commonsWorld.eastGardenCommons.edge;
  for (const [finish, expected] of [[undefined, 'classic'], [PINK, PINK], ['neon', 'classic']]) {
    const parent = new THREE.Group(), seen = [];
    const stream = createCommonsStream({ world: commonsWorld, parent, finish,
      loadModule: async () => { const module = await import('../src/east-garden-commons.js'); return { buildEastGardenCommons: (layout, options) => { seen.push(options?.finish); return module.buildEastGardenCommons(layout, options); } }; } });
    stream.update([[edge - 10, -1335]]);
    for (let i = 0; i < 100 && !stream.ready(); i++) await flush();
    assert.equal(stream.ready(), true);
    assert.deepEqual(seen, [finish]);
    assert.equal(parent.children[0].userData.finish, expected);
    assert.deepEqual(kitsIn(parent).map(kit => kit.userData.finish), [expected]);
    stream.dispose();
  }
});

test('the Heights stream builds every neighborhood and its landmarks with the opted-in finish', async () => {
  const layout = heightsWorld.eastGardenCommons, west = layout.heights.bounds[0], before = structuredClone(heightsWorld);
  const hashes = layout.heights.plans.map(plan => plan.hash);
  assert.ok(hashes.every(hash => /^[0-9a-f]{16,}$/.test(hash)), 'every plan carries its lock hash');
  for (const [finish, expected] of [[undefined, 'classic'], [PINK, PINK], ['neon', 'classic']]) {
    const parent = new THREE.Group(), calls = [];
    const stream = createHeightsStream({ world: heightsWorld, parent, finish,
      loadModule: async () => {
        const module = await import('../src/bayou-heights.js');
        return { ...module,
          buildHeightsNeighborhood: (l, plan, options) => { calls.push(['neighborhood', options?.finish]); return module.buildHeightsNeighborhood(l, plan, options); },
          buildHeightsLandscape: (l, options) => { calls.push(['landscape', options?.finish]); return module.buildHeightsLandscape(l, options); } };
      } });
    // Until nothing is loading and the resident set holds still (heights-stream.test.js).
    for (let i = 0, last = '', still = 0; i < 400 && still < 3; i++) {
      stream.update([[west - 10, -1335]]); await flush();
      const now = JSON.stringify(stream.debug().chunks.map(chunk => chunk.state));
      still = stream.debug().pending === 0 && now === last ? still + 1 : 0; last = now;
    }
    assert.equal(stream.ready(), true);
    assert.ok(calls.some(([kind]) => kind === 'landscape') && calls.some(([kind]) => kind === 'neighborhood'));
    assert.ok(calls.every(([, value]) => value === finish), JSON.stringify(calls));
    // Neighborhood kits are renamed bayou-heights/<plan id>; the shared part is bayou-heights/landscape.
    const scene = parent.children[0], kits = scene.children.filter(part => part.name !== 'bayou-heights/landscape');
    assert.ok(kits.length >= 2, scene.children.map(part => part.name).join());
    assert.ok(kits.every(kit => kit.userData.finish === expected), `${finish}: every attached neighborhood is ${expected}`);
    assert.equal(scene.getObjectByName('bayou-heights/landscape').userData.finish, expected);
    stream.dispose();
  }
  assert.deepEqual(layout.heights.plans.map(plan => plan.hash), hashes);
  assert.deepEqual(heightsWorld, before, 'plans, hashes, solids and collision are untouched');
});

test('chunk estimates err high under every finish, so the rounded forms never overrun a streaming ceiling', async () => {
  // The latest revision composes every Heights neighborhood (Studewood, terraces, Woodland, TypeSafe Place).
  const world = await loadDistrictData({ districtRevision: 'typesafe-place-1' }), layout = world.eastGardenCommons;
  const bytes = group => { const buffers = new Set(); group.traverse(item => { if (item.geometry) for (const attribute of [...Object.values(item.geometry.attributes), item.geometry.index, item.instanceMatrix].filter(Boolean)) buffers.add(attribute.array.buffer); });
    return [...buffers].reduce((n, buffer) => n + buffer.byteLength, 0); };
  for (const finish of Object.keys(KIT_FINISHES)) {
    for (const plan of layout.heights.plans) {
      const kit = buildHeightsNeighborhood(layout, plan, { finish }), measured = bytes(kit);
      assert.ok(measured <= HEIGHTS_CHUNK_BYTES[plan.id], `${finish} ${plan.id}: ${measured} > ${HEIGHTS_CHUNK_BYTES[plan.id]}`);
      dispose(kit);
    }
    for (const presented of [commonsWorld.eastGardenCommons, heightsCommonsLayout(layout)]) {
      const group = buildEastGardenCommons(presented, { finish }); await group.userData.ready;
      assert.ok(bytes(group) <= COMMONS_DESTINATION_BYTES, `${finish} Commons: ${bytes(group)}`);
      dispose(group);
    }
  }
});

test('under the finish Heights keeps its geometry and draws its landmarks in kit slots', () => {
  const layout = heightsWorld.eastGardenCommons, plan = layout.heights.plans[0];
  const classic = buildHeightsNeighborhood(layout, plan), pink = buildHeightsNeighborhood(layout, plan, { finish: PINK });
  assert.equal(classic.userData.finish, 'classic'); assert.equal(pink.userData.finish, PINK);
  assert.deepEqual(shape(pink), shape(classic));
  assert.equal(buildHeightsNeighborhood(layout, plan, { finish: 'brutalist' }).userData.finish, 'classic');
  const landmarks = finish => buildHeightsLandscape(layout, finish ? { finish } : {}).getObjectByName('bayou-heights/landmarks');
  const plain = landmarks(), styled = landmarks(PINK), wrong = landmarks('brutalist');
  // Same merged meshes, vertices and parts; only colours change.
  assert.deepEqual(shape(styled), shape(plain)); assert.deepEqual(styled.userData.parts, plain.userData.parts);
  const colourOf = (group, name) => group.children.find(mesh => mesh.material.name === `bayou-heights/${name}`).material.color.getHexString();
  const recolour = KIT_FINISHES[PINK].materials, hex = value => new THREE.Color(value).getHexString();
  for (const [name, slot] of [['stone', 'trim-ivory'], ['rail', 'lamp-teal'], ['brass', 'metal-brass'], ['roof', 'trim-deep-teal'], ['brick', 'brick-umber'], ['glass', 'glass']]) {
    assert.equal(colourOf(styled, name), hex(recolour[slot].color), name);
    assert.equal(colourOf(wrong, name), colourOf(plain, name), `${name}: unknown is classic`);
  }
  // Water, banks and the lit clock faces are outside the finish.
  for (const name of ['water', 'bank', 'face']) assert.equal(colourOf(styled, name), colourOf(plain, name), name);
  for (const group of [classic, pink]) dispose(group);
  for (const group of [plain, styled, wrong]) group.userData.dispose();
});
