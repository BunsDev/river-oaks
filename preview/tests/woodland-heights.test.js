import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { configuredDistrictRevision, districtRevisionOf } from '../src/garden-campus-district.js';
import { attachBayouTerraces } from '../src/bayou-terraces-world.js';
import { attachWoodlandHeights, detachWoodlandHeights, validateWoodlandRegistration } from '../src/woodland-heights-world.js';
import { buildHeightsLandscape, buildHeightsNeighborhood } from '../src/bayou-heights.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';
import { createHeightsStream, HEIGHTS_CHUNK_BYTES, HEIGHTS_MAX_BYTES, HEIGHTS_SHARED_PLACEMENT_BYTES } from '../src/heights-stream.js';
import { cityKitLandscape } from '../src/city-kit/render.js';
import { chessSeat, plazaSalonSeats } from '../src/plaza-salon-plan.js';
import { connectedLocationAt, STUDEWOOD_NAME, WOODLAND_NAME } from '../src/world-location-label.js';
import { validateWorldManifest, locationWorldBounds } from '../src/world-manifest.js';
import { STUDEWOOD_REVISION } from '../../shared/studewood-layout.js';
import { TERRACES_REVISION } from '../../shared/bayou-terraces-layout.js';
import { composeWoodlandHeights, terracesBaseLayout, WOODLAND_RECIPES, WOODLAND_REVISION, WOODLAND_TABLE, inWoodlandHeights } from '../../shared/woodland-heights.js';
import { assembleNeighborhood, walkableConnectivity } from '../../shared/city-kit/assemble.js';
import { KIT_CONVENTIONS } from '../../shared/city-kit/catalog.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };

const studewoodWorld = await loadDistrictData({ districtRevision: STUDEWOOD_REVISION });
const terracesWorld = await loadDistrictData({ districtRevision: TERRACES_REVISION });
const world = await loadDistrictData({ districtRevision: WOODLAND_REVISION }), layout = world.eastGardenCommons, { woodland } = layout;
// The recipe frame: metres east of the District edge and north of Market Street's centreline.
const frame = ([x, y]) => [layout.edge + x, -1335 + y];
const MiB = 1024 * 1024;

test('Woodland Heights composes on the Terraces exactly as the client does and detaches exactly', () => {
  assert.equal(configuredDistrictRevision(WOODLAND_REVISION), WOODLAND_REVISION);
  assert.equal(districtRevisionOf(world), WOODLAND_REVISION);
  const terraces = terracesWorld.eastGardenCommons;
  assert.deepEqual(attachWoodlandHeights(terracesWorld), world, 'server and client compose the same world');
  assert.deepEqual(detachWoodlandHeights(world), terracesWorld, 'detach restores the Terraces exactly');
  assert.equal(JSON.stringify(detachWoodlandHeights(world)), JSON.stringify(terracesWorld), 'byte for byte, so the Terraces world fingerprint holds');
  assert.deepEqual(terracesBaseLayout(layout), terraces);
  // Earlier revisions keep every index: their surfaces, solids and plans are a prefix of Woodland's.
  assert.deepEqual(layout.surfaces.slice(0, woodland.surfaceStart), terraces.surfaces);
  assert.deepEqual(layout.solids.slice(0, woodland.solidStart), terraces.solids);
  assert.deepEqual(layout.heights.plans.slice(0, woodland.planStart), terraces.heights.plans);
  assert.deepEqual(layout.heights.plans.slice(woodland.planStart).map(plan => plan.id), ['woodland-heights-north', 'woodland-heights-south']);
  assert.deepEqual(layout.districtBounds, terraces.districtBounds, 'District build bounds are unchanged');
  assert.deepEqual(layout.bounds, [...terraces.bounds.slice(0, 2), woodland.bounds[2], terraces.bounds[3]], 'the composed bounds reach the new east edge');
  assert.deepEqual(world.bounds_m, layout.bounds);
  assert.equal(new Set(layout.solids.map(solid => solid.id)).size, layout.solids.length);
  assert.throws(() => attachWoodlandHeights(world), /composed Bayou Terraces/);
  assert.throws(() => attachWoodlandHeights(studewoodWorld), /composed Bayou Terraces/, 'Woodland composes only onto the Terraces');
  assert.deepEqual(attachBayouTerraces(studewoodWorld), terracesWorld, 'and the Terraces still compose onto Studewood alone');
  assert.throws(() => composeWoodlandHeights(layout), /composed Bayou Terraces/);
  const tampered = structuredClone(world); tampered.eastGardenCommons.surfaces.at(-1).rect[0] += 1;
  assert.throws(() => detachWoodlandHeights(tampered), /differs/);
});

test('Woodland Heights registers new land east of Studewood, and loading checks the registration', () => {
  const validated = validateWorldManifest(manifest), byId = id => validated.locations.find(location => location.id === id);
  const location = byId('woodland-heights'), studewood = byId('studewood');
  assert.equal(location.status, 'authored'); assert.equal(location.content_revision, WOODLAND_REVISION);
  assert.deepEqual(location.bounds_m, woodland.bounds);
  // Studewood's east edge, 45 m further east, and the District's north/south span.
  assert.deepEqual(location.bounds_m, [studewood.bounds_m[2], studewood.bounds_m[1], -2113.4479977351207, studewood.bounds_m[3]]);
  assert.ok(Math.abs(location.bounds_m[2] - location.bounds_m[0] - 45) < 1e-9);
  assert.deepEqual(locationWorldBounds(location), location.bounds_m);
  assert.ok(location.adjacent.includes('studewood') && studewood.adjacent.includes('woodland-heights'));
  // New land: wholly east of the original envelope, which every other location still partitions.
  assert.ok(validated.locations.every(item => item.id === 'woodland-heights' || item.bounds_m[2] <= location.bounds_m[0]));
  assert.equal(validateWoodlandRegistration(manifest, layout), layout);
  for (const mutate of [item => { item.content_revision = 'woodland-heights-0'; }, item => { item.bounds_m[2] += 1; }, item => { item.entries[0].position_m[1] += 1; }, item => { item.status = 'reserved'; }]) {
    const changed = structuredClone(manifest); mutate(changed.locations.find(item => item.id === 'woodland-heights'));
    assert.throws(() => validateWoodlandRegistration(changed, layout), /differs|Invalid world manifest/);
  }
});

test('the recipes reproduce their locks within the kit budgets', () => {
  const lock = name => JSON.parse(readFileSync(new URL(`../../config/destinations/${name}.lock.json`, import.meta.url)));
  const { trianglesPerNeighborhood, solidsPerNeighborhood, materialsPerNeighborhood } = KIT_CONVENTIONS.budgets;
  for (const recipe of WOODLAND_RECIPES) {
    const plan = assembleNeighborhood(recipe);
    assert.equal(plan.hash, lock(recipe.id).hash, recipe.id);
    assert.ok(plan.stats.triangles <= trianglesPerNeighborhood && plan.stats.solids <= solidsPerNeighborhood && plan.stats.materials <= materialsPerNeighborhood, recipe.id);
  }
});

test('only the two cross streets reach back into Studewood, through seams that meet its streets and cross no building', () => {
  const added = layout.surfaces.slice(woodland.surfaceStart), west = woodland.bounds[0];
  assert.deepEqual(added.filter(surface => surface.rect[0] < west).map(surface => surface.id).sort(),
    ['woodland-heights-north/twentieth-woodland/walk', 'woodland-heights-south/eighteenth-woodland/walk', 'woodland-heights/eighteenth-seam', 'woodland-heights/twentieth-seam']);
  for (const surface of added) assert.ok(surface.rect[0] >= layout.edge + 506.5 && surface.rect[2] <= woodland.bounds[2], surface.id);
  // The seams overlap the Studewood cross streets they continue, so the walking radius does not wall them off.
  const earlier = layout.surfaces.slice(0, woodland.surfaceStart), street = id => earlier.find(surface => surface.id === id).rect;
  for (const [seam, id] of [['twentieth', 'studewood-north/twentieth-studewood/walk'], ['eighteenth', 'studewood-south/eighteenth-studewood/walk']]) {
    const rect = added.find(surface => surface.id === `woodland-heights/${seam}-seam`).rect, other = street(id);
    assert.ok(rect[0] < other[2] - .7 && rect[1] === other[1] && rect[3] === other[3], `${seam} overlaps ${id}`);
  }
  const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const buildings = layout.heights.plans.slice(0, woodland.planStart).flatMap(plan => plan.pieces.filter(piece => piece.piece === 'building/shell'));
  for (const surface of added) for (const { id, rect } of buildings) assert.ok(!overlaps(surface.rect, rect), `${surface.id} crosses ${id}`);
  // Away from the seams Woodland ground touches nothing earlier: Studewood's hedged east edge stays closed.
  for (const surface of added.filter(surface => surface.rect[0] >= west)) for (const other of earlier) assert.ok(!overlaps(surface.rect, other.rect), `${surface.id} joins ${other.id}`);
  const environment = createWalkingEnvironment(world), free = at => { const [x, n] = frame(at); return environment.isFree(x, -n); };
  for (const at of [[507.7, 50], [507.7, 140], [507.7, -30], [507.7, -100]]) assert.equal(free(at), false, `no crossing at ${at}`);
  for (const at of [[507.7, 111], [507.7, -71]]) assert.equal(free(at), true, `the cross street continues at ${at}`);
});

test('every Woodland sample connects to Studewood\'s cross streets: no islands or dead-end pockets', () => {
  const streets = layout.surfaces.slice(0, woodland.surfaceStart).filter(surface => ['studewood-north/twentieth-studewood/walk', 'studewood-south/eighteenth-studewood/walk'].includes(surface.id));
  const result = walkableConnectivity({ surfaces: [...streets, ...layout.surfaces.slice(woodland.surfaceStart)], solids: layout.solids.slice(layout.heights.solidStart) },
    { entry: frame([495, 111]), step: .5 });
  assert.equal(result.ratio, 1, `${result.total - result.reached} disconnected samples`);
  for (const at of [[530, 160], [530, -115], [545, 40], [514, 30], [546, 145], [520, -100], [545, -100], [546, -8], [550, -71], [550, 111]]) assert.ok(result.reachable(frame(at)), `frame ${at}`);
});

test('the real walking controller walks from Studewood along Twentieth Street into Woodland Heights and back', () => {
  const environment = createWalkingEnvironment(world), start = [...frame([495, 111]), 0];
  const walker = createWalkingState(environment, start, -Math.PI / 2);
  for (let i = 0; i < 1600 && walker.position[0] < layout.edge + 540; i++) stepWalking(walker, environment, { forward: 1, fast: true }, .04);
  assert.ok(walker.position[0] > layout.edge + 540, `Reached ${walker.position[0] - layout.edge} m east of the edge`);
  assert.ok(inWoodlandHeights(layout, walker.position[0]));
  assert.ok(Math.abs(environment.groundAt(walker.position[0], walker.position[2]) - layout.ground) < .01, 'Woodland is level with Studewood');
  walker.yaw = Math.PI / 2; walker.velocity = [0, 0]; walker.acceleration = [0, 0];
  for (let i = 0; i < 1600 && walker.position[0] > start[0]; i++) stepWalking(walker, environment, { forward: 1, fast: true }, .04);
  assert.ok(Math.abs(walker.position[0] - start[0]) < .1, `Returned to ${walker.position[0] - layout.edge}`);
  // The Terraces revision has no ground beyond the end of Studewood's Twentieth Street.
  const terracesEnvironment = createWalkingEnvironment(terracesWorld), [x, n] = frame([515, 111]);
  assert.equal(terracesEnvironment.isFree(x, -n), false);
  assert.equal(environment.isFree(x, -n), true);
});

test('building land, the location edge and every Woodland solid stay closed', () => {
  const environment = createWalkingEnvironment(world), free = at => { const [x, n] = frame(at); return environment.isFree(x, -n); };
  for (const at of [[553.2, 50], [553.2, 111], [530, 168], [530, -123]]) assert.equal(free(at), false, `outside ${at}`);
  for (const plan of woodland.plans) for (const shell of plan.pieces.filter(piece => piece.piece === 'building/shell')) {
    const [w, s, e, n] = shell.rect, x = (w + e) / 2, y = (s + n) / 2;
    assert.equal(environment.isFree(x, -y), false, shell.id); assert.equal(environment.canFly(x, layout.ground + 3, -y), false, shell.id);
  }
  for (const solid of layout.solids.slice(woodland.solidStart)) {
    const x = (solid.rect[0] + solid.rect[2]) / 2, n = (solid.rect[1] + solid.rect[3]) / 2;
    assert.equal(environment.isFree(x, -n), false, solid.id);
  }
  assert.equal(environment.isAreaFree(...(([x, n]) => [x, -n])(frame([545, 40])), 2), true, 'open green lawn');
});

test('the location label names Woodland Heights beyond Studewood and Studewood before it', () => {
  assert.equal(connectedLocationAt(world, ...frame([520, 111])), WOODLAND_NAME);
  assert.equal(connectedLocationAt(world, ...frame([545, 40])), WOODLAND_NAME);
  assert.equal(connectedLocationAt(world, ...frame([520, -100])), WOODLAND_NAME);
  assert.equal(connectedLocationAt(world, ...frame([495, 111])), STUDEWOOD_NAME);
  assert.equal(connectedLocationAt(world, ...frame([507.3, 111])), STUDEWOOD_NAME, 'the seam is in Studewood up to its edge');
  assert.equal(connectedLocationAt(terracesWorld, ...frame([495, 111])), STUDEWOOD_NAME);
});

test('the Woodland green table seats two players in the shared seat model', () => {
  const seats = plazaSalonSeats(world).filter(seat => seat.buildId.startsWith(`bench:plaza-salon-${WOODLAND_TABLE}-`));
  assert.equal(seats.length, 2);
  const environment = createWalkingEnvironment(world);
  for (const [chair, seat] of seats.entries()) {
    assert.equal(seat.title, 'Woodland green game table');
    assert.deepEqual(chessSeat(seat.buildId), { tableId: WOODLAND_TABLE, chair });
    assert.ok(environment.isFree(seat.approach[0], -seat.approach[1]), `approach ${chair}`);
    assert.ok(inWoodlandHeights(layout, seat.x));
  }
  assert.equal(plazaSalonSeats(terracesWorld).some(seat => seat.buildId.includes(WOODLAND_TABLE)), false, 'the Terraces revision has no Woodland table');
});

test('Woodland neighborhoods build within the kit budgets, leave their trees to the shared landscape and dispose', () => {
  const { drawCallsPerNeighborhood, materialsPerNeighborhood, trianglesPerNeighborhood, solidsPerNeighborhood } = KIT_CONVENTIONS.budgets;
  for (const plan of woodland.plans) {
    const kit = buildHeightsNeighborhood(layout, plan), stats = kit.userData.stats();
    // As for Heights: the kit budgets an assembled plan's materials, triangles and solids,
    // and a drawn plan's meshes (city-kit.test.js, scripts/destination.mjs).
    assert.ok(plan.stats.materials <= materialsPerNeighborhood && plan.stats.triangles <= trianglesPerNeighborhood
      && plan.stats.solids <= solidsPerNeighborhood, `${plan.id}: ${JSON.stringify(plan.stats)}`);
    assert.ok(stats.meshes <= drawCallsPerNeighborhood, `${plan.id}: ${JSON.stringify(stats)}`);
    assert.equal(kit.getObjectByName(`${plan.id} trees`).children.length, 0);
    kit.userData.dispose(); assert.equal(kit.children.length, 0);
  }
  const landscape = buildHeightsLandscape(layout), before = buildHeightsLandscape(terracesWorld.eastGardenCommons);
  assert.ok(landscape.getObjectByName('bayou-heights trees').userData.placements > before.getObjectByName('bayou-heights trees').userData.placements, 'Woodland trees draw in the shared landscape');
  landscape.userData.dispose(); before.userData.dispose();
});

test('Heights streams Woodland as two more neighborhoods, within the ceiling, and gates a step into one still loading', async () => {
  // Estimates err high, within a quarter of the measured geometry.
  for (const plan of woodland.plans) {
    const kit = buildHeightsNeighborhood(layout, plan), buffers = new Set();
    kit.traverse(item => { if (item.geometry) for (const attribute of [...Object.values(item.geometry.attributes), item.geometry.index].filter(Boolean)) buffers.add(attribute.array.buffer); });
    const bytes = [...buffers].reduce((n, buffer) => n + buffer.byteLength, 0), estimate = HEIGHTS_CHUNK_BYTES[plan.id];
    assert.ok(bytes <= estimate && estimate <= bytes * 1.25, `${plan.id}: ${(bytes / MiB).toFixed(2)} MiB against ${(estimate / MiB).toFixed(2)} MiB`);
    kit.userData.dispose();
  }
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
  assert.deepEqual(stream.debug().chunks.map(chunk => chunk.id).filter(id => id.includes('woodland')), ['bayou-heights/woodland-heights-north', 'bayou-heights/woodland-heights-south']);
  // Woodland's trees and planted beds draw in the shared part, so its estimate grows by their allowances; the Terraces' is unchanged.
  const added = woodland.plans.map(plan => cityKitLandscape(plan, { groundAt: () => layout.ground, ground: layout.ground }))
    .reduce((bytes, { trees, planters }) => bytes + trees.length * HEIGHTS_SHARED_PLACEMENT_BYTES.tree + planters.length * HEIGHTS_SHARED_PLACEMENT_BYTES.planter, 0);
  const plain = createHeightsStream({ world: terracesWorld, parent: new THREE.Group(), now: () => 0, loadModule: standIns() });
  assert.ok(added > 0);
  assert.equal(stream.debug().estimatedBytes['bayou-heights'], plain.debug().estimatedBytes['bayou-heights'] + added);
  plain.dispose();
  await settle(stream, [frame([545, 40])]);
  for (const id of ['shared', 'woodland-heights-north']) assert.ok(resident(stream).includes(id), `${id} in ${resident(stream)}`);
  assert.ok(stream.debug().residentBytes <= HEIGHTS_MAX_BYTES);
  // At the end of Studewood's Twentieth Street, both sides of the seam fit under the ceiling.
  await settle(stream, [frame([506, 111])]);
  for (const id of ['shared', 'studewood-north', 'woodland-heights-north']) assert.ok(resident(stream).includes(id), `${id} in ${resident(stream)}`);
  assert.ok(stream.debug().residentBytes <= HEIGHTS_MAX_BYTES);
  // District points stream nothing at all since the Terraces (heights-stream.js), so the way back is through the Commons.
  await settle(stream, [frame([60, 0])]);
  assert.deepEqual(resident(stream).filter(id => id.startsWith('woodland') || id.startsWith('studewood')), [], 'walking back to the Commons releases Woodland and Studewood');
  stream.dispose();
  // Woodland north never loads: from presented Studewood street ground, the seam waits for it.
  const unloaded = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule: standIns(new Set(['woodland-heights-north'])) });
  const street = frame([505, 111]);
  await settle(unloaded, [street]);
  assert.equal(unloaded.allowsStep(street, frame([506, 111])), true, 'Studewood is presented');
  assert.equal(unloaded.allowsStep(frame([506, 111]), frame([508, 111])), false, 'Woodland waits to load');
  assert.equal(unloaded.allowsStep(frame([520, 111]), frame([519, 111])), true, 'someone restored there may walk back west');
  // Woodland's gardens open east onto its lane, so on its ground still loading any step within Woodland stays allowed.
  assert.equal(unloaded.allowsStep(frame([520, 111]), frame([521, 111])), true, 'and around within Woodland');
  unloaded.dispose();
  // Woodland south never loads: from presented garden ground at the edge of the north site, the next garden waits.
  const notices = [], partial = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, onStatus: text => notices.push(text), loadModule: standIns(new Set(['woodland-heights-south'])) });
  const garden = frame([545, 1]);
  await settle(partial, [garden]);
  assert.equal(partial.allowsStep(garden, frame([545, .5])), true);
  assert.equal(partial.allowsStep(garden, frame([545, -1])), false, 'the next neighborhood waits to load');
  assert.match(notices.at(-1), /Bayou Heights is still loading/, 'Woodland ground is inside the stream, so its notices show');
  partial.dispose();
});

test('nobody restored on Woodland ground is held there while it loads: every free cell walks back to Studewood', async () => {
  // A reverse flood fill over Woodland's 0.5 m cells, stepping only where the stream allows, from Studewood's ground
  // (west of where its streets end, less the walking radius). Its east-facing gardens once held 1,327.5 m² this way.
  const environment = createWalkingEnvironment(world), exit = 507.15, step = .5, x0 = 500, x1 = 553, y0 = -123, y1 = 168;
  const nx = Math.round((x1 - x0) / step) + 1, ny = Math.round((y1 - y0) / step) + 1, at = (i, j) => frame([x0 + i * step, y0 + j * step]);
  const sized = bytes => {
    const group = new THREE.Group(), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.round(bytes / 4)), 1));
    group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    Object.assign(group.userData, { ready: Promise.resolve(), update() {}, shadowProxies: [], stats: () => ({ meshes: 1, triangles: 0 }), dispose() { geometry.dispose(); } });
    return group;
  };
  const failures = { 'the Heights module': async () => { throw new Error('offline'); } };
  for (const id of ['woodland-heights-north', 'woodland-heights-south']) failures[id] = async () => ({
    buildHeightsLandscape: () => sized(HEIGHTS_CHUNK_BYTES['bayou-heights'] * .9),
    buildHeightsNeighborhood(_layout, plan) { if (plan.id === id) throw new Error('offline'); return sized(HEIGHTS_CHUNK_BYTES[plan.id] * .9); },
  });
  for (const [failing, loadModule] of Object.entries(failures)) {
    const stream = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule });
    for (let i = 0; i < 80; i++) { stream.update([frame([530, 20]), frame([530, -60])]); await new Promise(resolve => setTimeout(resolve, 3)); }
    const free = new Uint8Array(nx * ny), reached = new Uint8Array(nx * ny), queue = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const point = at(i, j);
      if (!environment.isFree(point[0], -point[1])) continue;
      free[i * ny + j] = 1;
      if (x0 + i * step < exit) { reached[i * ny + j] = 1; queue.push(i * ny + j); }
    }
    while (queue.length) {
      const cell = queue.pop(), i = Math.floor(cell / ny), j = cell % ny;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj, k = a * ny + b;
        if (a < 0 || b < 0 || a >= nx || b >= ny || !free[k] || reached[k] || !stream.allowsStep(at(a, b), at(i, j))) continue;
        reached[k] = 1; queue.push(k);
      }
    }
    const held = [];
    for (let k = 0; k < nx * ny; k++) if (free[k] && !reached[k]) held.push([x0 + Math.floor(k / ny) * step, y0 + (k % ny) * step]);
    assert.deepEqual(held.slice(0, 5), [], `${failing} failing holds ${held.length * step * step} m² of Woodland`);
    stream.dispose();
  }
});
