import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { configuredDistrictRevision, districtRevisionOf } from '../src/garden-campus-district.js';
import { attachBayouTerraces, detachBayouTerraces, validateTerracesRegistration } from '../src/bayou-terraces-world.js';
import { buildHeightsLandscape, buildHeightsNeighborhood } from '../src/bayou-heights.js';
import { createWalkingEnvironment, createWalkingState, guardedStepEnvironment, stepWalking } from '../src/walking.js';
import { createCommonsStream } from '../src/commons-stream.js';
import { createHeightsStream, heightsCommonsLayout, HEIGHTS_CHUNK_BYTES, HEIGHTS_MAX_BYTES } from '../src/heights-stream.js';
import { chessSeat, plazaSalonSeats } from '../src/plaza-salon-plan.js';
import { connectedLocationAt, HEIGHTS_NAME, MARKET_NAME, TERRACES_NAME } from '../src/world-location-label.js';
import { validateWorldManifest } from '../src/world-manifest.js';
import { STUDEWOOD_REVISION } from '../../shared/studewood-layout.js';
import { composeBayouTerraces, studewoodBaseLayout, TERRACE_RECIPES, TERRACES_REVISION, TERRACES_TABLE, inBayouTerraces } from '../../shared/bayou-terraces.js';
import { assembleNeighborhood, walkableConnectivity } from '../../shared/city-kit/assemble.js';
import { KIT_CONVENTIONS } from '../../shared/city-kit/catalog.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };

const commonsWorld = await loadDistrictData({ districtRevision: 'east-garden-commons-market-1' });
const studewoodWorld = await loadDistrictData({ districtRevision: STUDEWOOD_REVISION });
const world = await loadDistrictData({ districtRevision: TERRACES_REVISION }), layout = world.eastGardenCommons, { terraces } = layout;
// The recipe frame: metres east of the District edge and north of Market Street's centreline.
const frame = ([x, y]) => [layout.edge + x, -1335 + y];

test('the terraces compose on Studewood exactly as the client does and detach exactly', () => {
  assert.equal(configuredDistrictRevision(TERRACES_REVISION), TERRACES_REVISION);
  assert.equal(districtRevisionOf(world), TERRACES_REVISION);
  const studewood = studewoodWorld.eastGardenCommons;
  assert.deepEqual(attachBayouTerraces(studewoodWorld), world, 'server and client compose the same world');
  assert.deepEqual(detachBayouTerraces(world), studewoodWorld, 'detach restores Studewood exactly');
  assert.deepEqual(studewoodBaseLayout(layout), studewood);
  assert.deepEqual(layout.surfaces.slice(0, terraces.surfaceStart), studewood.surfaces);
  assert.deepEqual(layout.solids.slice(0, terraces.solidStart), studewood.solids);
  assert.deepEqual(layout.heights.plans.slice(terraces.planStart).map(plan => plan.id), ['bayou-terrace-north', 'bayou-terrace-south']);
  assert.deepEqual(layout.bounds, studewood.bounds, 'the terraces lie inside the composed bounds');
  assert.equal(new Set(layout.solids.map(solid => solid.id)).size, layout.solids.length);
  assert.throws(() => attachBayouTerraces(world), /composed Studewood/);
  assert.throws(() => attachBayouTerraces(commonsWorld), /composed Studewood/);
  assert.throws(() => composeBayouTerraces(layout), /composed Studewood/);
  const tampered = structuredClone(world); tampered.eastGardenCommons.surfaces.at(-1).rect[0] += 1;
  assert.throws(() => detachBayouTerraces(tampered), /differ/);
});

test('the terraces author the strips beside the Commons without enlarging them, and loading checks the registration', () => {
  const validated = validateWorldManifest(manifest), byId = id => validated.locations.find(location => location.id === id);
  const commons = byId('east-garden-commons'), heights = byId('bayou-heights');
  for (const [index, id] of ['bayou-terrace-north', 'bayou-terrace-south'].entries()) {
    const location = byId(id);
    assert.equal(location.status, 'authored'); assert.equal(location.content_revision, TERRACES_REVISION);
    assert.deepEqual(location.bounds_m, terraces.bounds[index]);
    assert.equal(location.bounds_m[0], byId('river-oaks-district').bounds_m[2], 'from the District edge');
    assert.equal(location.bounds_m[2], heights.bounds_m[0], 'to the bank, where Heights begins');
    assert.ok(location.adjacent.includes('bayou-heights') && heights.adjacent.includes(id));
  }
  assert.equal(byId('bayou-terrace-north').bounds_m[1], commons.bounds_m[3]);
  assert.equal(byId('bayou-terrace-south').bounds_m[3], commons.bounds_m[1]);
  assert.equal(validated.locations.filter(location => location.status === 'reserved').length, 0, 'no reserved land remains');
  assert.equal(validateTerracesRegistration(manifest, layout), layout);
  for (const mutate of [item => { item.content_revision = 'bayou-terraces-0'; }, item => { item.bounds_m[3] += 1; }, item => { item.entries[0].position_m[1] += 1; }, item => { item.status = 'reserved'; }]) {
    const changed = structuredClone(manifest); mutate(changed.locations.find(item => item.id === 'bayou-terrace-south'));
    assert.throws(() => validateTerracesRegistration(changed, layout), /differs|Invalid world manifest/);
  }
});

test('the recipes reproduce their locks within the kit budgets', () => {
  const lock = name => JSON.parse(readFileSync(new URL(`../../config/destinations/${name}.lock.json`, import.meta.url)));
  const { trianglesPerNeighborhood, solidsPerNeighborhood, materialsPerNeighborhood } = KIT_CONVENTIONS.budgets;
  for (const recipe of TERRACE_RECIPES) {
    const plan = assembleNeighborhood(recipe);
    assert.equal(plan.hash, lock(recipe.id).hash, recipe.id);
    assert.ok(plan.stats.triangles <= trianglesPerNeighborhood && plan.stats.solids <= solidsPerNeighborhood && plan.stats.materials <= materialsPerNeighborhood, recipe.id);
  }
});

test('only the footbridges cross the bank, landing on the greenway; the Commons green stays hedged off', () => {
  const added = layout.surfaces.slice(terraces.surfaceStart), bank = layout.heights.bounds[0];
  assert.deepEqual(added.filter(surface => surface.rect[2] > bank).map(surface => surface.id).sort(), ['bayou-terrace-north/footbridge/walk', 'bayou-terrace-south/footbridge/walk']);
  const greenway = layout.surfaces.filter(surface => /\/greenway(-south)?\/walk$/.test(surface.id));
  for (const bridge of added.filter(surface => surface.rect[2] > bank)) {
    assert.ok(greenway.some(walk => walk.rect[0] < bridge.rect[2] - .7 && bridge.rect[1] >= walk.rect[1] && bridge.rect[3] <= walk.rect[3]), `${bridge.id} overlaps the greenway by more than the walking radius`);
  }
  // Away from their landings, terrace ground touches nothing earlier. The south bridge also meets
  // Eighteenth Street's west end, which begins at the greenway.
  const landings = new Set(['yale-icehouse/eighteenth-west/walk']);
  const earlier = layout.surfaces.slice(0, terraces.surfaceStart).filter(surface => !greenway.includes(surface) && !landings.has(surface.id));
  for (const surface of added) for (const other of earlier) {
    assert.ok(!(surface.rect[0] < other.rect[2] && other.rect[0] < surface.rect[2] && surface.rect[1] < other.rect[3] && other.rect[1] < surface.rect[3]), `${surface.id} joins ${other.id}`);
  }
  const environment = createWalkingEnvironment(world), free = at => { const [x, n] = frame(at); return environment.isFree(x, -n); };
  for (const at of [[60, 40.3], [60, -40.3], [2, 100], [2, -100]]) assert.equal(free(at), false, `no terrace ground at ${at}`);
});

test('every terrace sample connects to the Heights greenway: no islands or dead-end pockets', () => {
  const greenway = layout.surfaces.filter(surface => /\/greenway(-south)?\/walk$/.test(surface.id));
  const result = walkableConnectivity({ surfaces: [...greenway, ...layout.surfaces.slice(terraces.surfaceStart)], solids: layout.solids.slice(layout.heights.solidStart) },
    { entry: frame([156.5, 20]), step: .5 });
  assert.equal(result.ratio, 1, `${result.total - result.reached} disconnected samples`);
  for (const at of [[130, 111], [105, 150], [60, 130], [31.5, 60], [130, -71], [60, -100], [31.5, -60]]) assert.ok(result.reachable(frame(at)), `frame ${at}`);
});

test('the real walking controller crosses the Twentieth Street footbridge into the north gardens and back', () => {
  const environment = createWalkingEnvironment(world), start = [...frame([156.5, 111]), 0];
  const walker = createWalkingState(environment, start, Math.PI / 2);
  // Over the bridge and the riverside walk into the gardens, short of the market stalls on the bridge axis.
  for (let i = 0; i < 1600 && walker.position[0] > layout.edge + 95; i++) stepWalking(walker, environment, { forward: 1, fast: true }, .04);
  assert.ok(walker.position[0] < layout.edge + 95, `Reached ${walker.position[0] - layout.edge} m east of the edge`);
  assert.ok(inBayouTerraces(layout, walker.position[0], -walker.position[2]));
  assert.ok(Math.abs(environment.groundAt(walker.position[0], walker.position[2]) - layout.ground) < .01, 'the terraces are level with the Commons');
  walker.yaw = -Math.PI / 2; walker.velocity = [0, 0]; walker.acceleration = [0, 0];
  for (let i = 0; i < 1600 && walker.position[0] < start[0]; i++) stepWalking(walker, environment, { forward: 1, fast: true }, .04);
  assert.ok(Math.abs(walker.position[0] - start[0]) < .1, `Returned to ${walker.position[0] - layout.edge}`);
  const before = createWalkingEnvironment(studewoodWorld), [x, n] = frame([130, 111]);
  assert.equal(before.isFree(x, -n), false, 'Studewood has no footbridge there'); assert.equal(environment.isFree(x, -n), true);
});

test('building land, the bayou and every terrace solid stay closed', () => {
  const environment = createWalkingEnvironment(world), free = at => { const [x, n] = frame(at); return environment.isFree(x, -n); };
  for (const at of [[130, 100], [130, 120], [130, -60], [130, -80]]) assert.equal(free(at), false, `bayou ${at}`);
  for (const plan of terraces.plans) for (const shell of plan.pieces.filter(piece => piece.piece === 'building/shell')) {
    const [w, s, e, n] = shell.rect, x = (w + e) / 2, y = (s + n) / 2;
    assert.equal(environment.isFree(x, -y), false, shell.id); assert.equal(environment.canFly(x, layout.ground + 3, -y), false, shell.id);
  }
  for (const solid of layout.solids.slice(terraces.solidStart)) {
    const x = (solid.rect[0] + solid.rect[2]) / 2, n = (solid.rect[1] + solid.rect[3]) / 2;
    assert.equal(environment.isFree(x, -n), false, solid.id);
  }
});

test('the location label names the Bayou Terraces, and the Commons and Heights stay as they were', () => {
  assert.equal(connectedLocationAt(world, ...frame([60, 130])), TERRACES_NAME);
  assert.equal(connectedLocationAt(world, ...frame([60, -100])), TERRACES_NAME);
  assert.equal(connectedLocationAt(world, ...frame([60, 0])), MARKET_NAME);
  assert.equal(connectedLocationAt(world, ...frame([130, 111])), HEIGHTS_NAME, 'the footbridge over the bayou is in Heights');
  assert.equal(connectedLocationAt(world, ...frame([156.5, 111])), HEIGHTS_NAME);
});

test('the terrace gardens table seats two players in the shared seat model', () => {
  const seats = plazaSalonSeats(world).filter(seat => seat.buildId.startsWith(`bench:plaza-salon-${TERRACES_TABLE}-`));
  assert.equal(seats.length, 2);
  const environment = createWalkingEnvironment(world);
  for (const [chair, seat] of seats.entries()) {
    assert.equal(seat.title, 'Terrace gardens game table');
    assert.deepEqual(chessSeat(seat.buildId), { tableId: TERRACES_TABLE, chair });
    assert.ok(environment.isFree(seat.approach[0], -seat.approach[1]), `approach ${chair}`);
    assert.ok(inBayouTerraces(layout, seat.x, seat.north));
  }
  assert.equal(plazaSalonSeats(studewoodWorld).some(seat => seat.buildId.includes(TERRACES_TABLE)), false);
});

test('terrace neighborhoods build within the kit budgets and their estimates err high', () => {
  const { drawCallsPerNeighborhood, materialsPerNeighborhood } = KIT_CONVENTIONS.budgets;
  for (const plan of terraces.plans) {
    const kit = buildHeightsNeighborhood(layout, plan), stats = kit.userData.stats(), buffers = new Set();
    assert.ok(stats.meshes <= drawCallsPerNeighborhood && stats.materials <= materialsPerNeighborhood, `${plan.id}: ${JSON.stringify(stats)}`);
    kit.traverse(item => { if (item.geometry) for (const attribute of [...Object.values(item.geometry.attributes), item.geometry.index].filter(Boolean)) buffers.add(attribute.array.buffer); });
    const bytes = [...buffers].reduce((n, buffer) => n + buffer.byteLength, 0), estimate = HEIGHTS_CHUNK_BYTES[plan.id];
    assert.ok(bytes <= estimate && estimate <= bytes * 1.25, `${plan.id}: ${bytes} against ${estimate}`);
    kit.userData.dispose(); assert.equal(kit.children.length, 0);
  }
  const landscape = buildHeightsLandscape(layout), before = buildHeightsLandscape(studewoodWorld.eastGardenCommons);
  assert.ok(landscape.getObjectByName('bayou-heights trees').userData.placements > before.getObjectByName('bayou-heights trees').userData.placements);
  landscape.userData.dispose(); before.userData.dispose();
});

test('Heights streams the terraces, gates a step onto one still loading, and the Commons gate leaves them alone', async () => {
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
  const settle = async (stream, points) => {
    let last = '', still = 0;
    for (let i = 0; i < 400 && still < 3; i++) {
      stream.update(points); await new Promise(resolve => setTimeout(resolve, 5));
      const now = JSON.stringify(stream.debug().chunks.map(chunk => chunk.state));
      still = stream.debug().pending === 0 && now === last ? still + 1 : 0; last = now;
    }
  };
  const resident = stream => stream.debug().chunks.filter(chunk => chunk.state === 'ready').map(chunk => chunk.id.replace(/^bayou-heights\/?/, '') || 'shared').sort();
  const stream = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule: standIns() });
  await settle(stream, [frame([60, 130])]);
  for (const id of ['shared', 'bayou-terrace-north']) assert.ok(resident(stream).includes(id), `${id} in ${resident(stream)}`);
  assert.ok(stream.debug().residentBytes <= HEIGHTS_MAX_BYTES);
  stream.dispose();
  // From the District, nothing streams: not the terraces beside its edge, nor anything a camera there sees.
  const district = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule: standIns() });
  const view = new THREE.PerspectiveCamera(55, 1.5, .1, 6000), gateway = frame([-19, 0]);
  view.position.set(gateway[0], layout.ground + 3, -gateway[1]); view.lookAt(frame([60, 120])[0], layout.ground + 3, -frame([60, 120])[1]); view.updateMatrixWorld();
  for (let i = 0; i < 20; i++) { district.update([gateway, frame([-2, 60])], view); await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.deepEqual(resident(district), [], 'the District gateway, looking at the north terrace, loads nothing');
  district.dispose();
  // The north terrace never loads: from the presented greenway, its footbridge waits.
  const notices = [], partial = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, onStatus: text => notices.push(text), loadModule: standIns(new Set(['bayou-terrace-north'])) });
  const trail = frame([156.5, 111]);
  await settle(partial, [trail]);
  assert.equal(partial.allowsStep(trail, frame([155.5, 111])), true, 'the greenway is presented');
  assert.equal(partial.allowsStep(trail, frame([150, 111])), false, 'the footbridge, part of the terrace, waits to load');
  assert.equal(partial.allowsStep(frame([100, 111]), frame([101, 111])), true, 'someone restored there may walk back toward the bridge');
  assert.equal(partial.allowsStep(frame([100, 111]), frame([99, 111])), false, 'but not deeper in');
  partial.update([frame([100, 111])]);
  assert.match(notices.at(-1), /Bayou Terraces/);
  // Mid-bridge the terrace's plan is still the nearer one: the way back is east, onto the greenway.
  assert.equal(partial.allowsStep(frame([130, 111]), frame([131, 111])), true, 'east over the bridge toward the greenway');
  assert.equal(partial.allowsStep(frame([130, 111]), frame([129, 111])), false, 'not west onto the unloaded terrace');
  partial.update([frame([130, 111])]);
  assert.match(notices.at(-1), /Bayou Terraces.*footbridge/, 'the notice names the terraces and the way back');
  const environment0 = createWalkingEnvironment(world), back = createWalkingState(environment0, [...frame([100, 111]), 0], -Math.PI / 2);
  const gate = [(from, to) => partial.allowsStep(from, to)];
  for (let i = 0; i < 1500 && back.position[0] < layout.edge + 153; i++) stepWalking(back, guardedStepEnvironment(environment0, [back.position[0], -back.position[2]], gate), { forward: 1 }, .04);
  assert.ok(back.position[0] > layout.edge + 152, `someone restored on the unloaded terrace walks back over the bridge: ${back.position[0] - layout.edge}`);
  partial.dispose();
  // The Commons stream gates only Commons ground, so an unloaded Commons does not hold anyone on a terrace.
  const commons = createCommonsStream({ world, layout: heightsCommonsLayout(layout), parent: new THREE.Group() });
  assert.equal(commons.ready(), false);
  assert.equal(commons.allowsStep(frame([60, 130]), frame([61, 130])), true, 'an eastward step on a terrace, which the Commons gate held before');
  assert.equal(commons.allowsStep(frame([5, 0]), frame([6, 0])), false, 'unloaded Commons entry still waits');
  commons.dispose();
  // Walking through the real gate from the greenway onto a loaded terrace proceeds.
  const loaded = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule: standIns() });
  await settle(loaded, [trail, frame([120, 111])]);
  const environment = createWalkingEnvironment(world), guards = [(from, to) => loaded.allowsStep(from, to)];
  const walker = createWalkingState(environment, [...trail, 0], Math.PI / 2);
  for (let i = 0; i < 1200 && walker.position[0] > layout.edge + 105; i++) { loaded.update([[walker.position[0], -walker.position[2]]]); stepWalking(walker, guardedStepEnvironment(environment, [walker.position[0], -walker.position[2]], guards), { forward: 1 }, .04); await new Promise(resolve => setImmediate(resolve)); }
  assert.ok(walker.position[0] < layout.edge + 110, `walked onto the terrace: ${walker.position[0] - layout.edge}`);
  loaded.dispose();
});
