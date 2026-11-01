import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { configuredDistrictRevision, districtRevisionOf } from '../src/garden-campus-district.js';
import { attachTypeSafePlace, detachTypeSafePlace, validateTypeSafeRegistration } from '../src/typesafe-place-world.js';
import { buildHeightsNeighborhood } from '../src/bayou-heights.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';
import { createHeightsStream, HEIGHTS_CHUNK_BYTES, HEIGHTS_MAX_BYTES } from '../src/heights-stream.js';
import { connectedLocationAt, TYPESAFE_NAME, WOODLAND_NAME } from '../src/world-location-label.js';
import { validateWorldManifest, locationWorldBounds } from '../src/world-manifest.js';
import { WOODLAND_REVISION } from '../../shared/woodland-heights-layout.js';
import { composeTypeSafePlace, woodlandBaseLayout, TYPESAFE_RECIPES, TYPESAFE_REVISION, WOODLAND_OPENINGS, inTypeSafePlace } from '../../shared/typesafe-place.js';
import { assembleNeighborhood, walkableConnectivity } from '../../shared/city-kit/assemble.js';
import { KIT_CONVENTIONS } from '../../shared/city-kit/catalog.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };

const woodlandWorld = await loadDistrictData({ districtRevision: WOODLAND_REVISION });
const world = await loadDistrictData({ districtRevision: TYPESAFE_REVISION }), layout = world.eastGardenCommons, { typesafe } = layout;
// The recipe frame: metres east of the District edge and north of Market Street's centreline.
const frame = ([x, y]) => [layout.edge + x, -1335 + y];
const MiB = 1024 * 1024;
const NEIGHBORHOODS = ['typesafe-place-north', 'typesafe-place-penthouse', 'typesafe-place-uptown', 'typesafe-place-green', 'typesafe-place-south'];

test('TypeSafe Place composes on Woodland Heights exactly as the client does and detaches exactly', () => {
  assert.equal(configuredDistrictRevision(TYPESAFE_REVISION), TYPESAFE_REVISION);
  assert.equal(districtRevisionOf(world), TYPESAFE_REVISION);
  const woodland = woodlandWorld.eastGardenCommons;
  assert.deepEqual(attachTypeSafePlace(woodlandWorld), world, 'server and client compose the same world');
  assert.equal(JSON.stringify(detachTypeSafePlace(world)), JSON.stringify(woodlandWorld), 'byte for byte, so the Woodland world fingerprint holds');
  assert.deepEqual(woodlandBaseLayout(layout), woodland);
  // Earlier surfaces and plans keep every index; earlier solids too, less Woodland's two opened hedges.
  assert.deepEqual(layout.surfaces.slice(0, typesafe.surfaceStart), woodland.surfaces);
  assert.deepEqual(layout.solids.slice(0, typesafe.solidStart), woodland.solids.filter(solid => !WOODLAND_OPENINGS.includes(solid.id)));
  assert.deepEqual(typesafe.openings.map(({ solid }) => solid.id), WOODLAND_OPENINGS);
  assert.deepEqual(layout.heights.plans.slice(typesafe.planStart).map(plan => plan.id), NEIGHBORHOODS);
  assert.deepEqual(layout.districtBounds, woodland.districtBounds, 'District build bounds are unchanged');
  assert.deepEqual(world.bounds_m, layout.bounds);
  assert.equal(world.collisionPolygons.length, woodlandWorld.collisionPolygons.length - 2 + layout.solids.length - typesafe.solidStart);
  assert.equal(new Set(layout.solids.map(solid => solid.id)).size, layout.solids.length);
  assert.throws(() => attachTypeSafePlace(world), /composed Woodland Heights/);
  assert.throws(() => composeTypeSafePlace(layout), /composed Woodland Heights/);
  const tampered = structuredClone(world); tampered.eastGardenCommons.surfaces.at(-1).rect[0] += 1;
  assert.throws(() => detachTypeSafePlace(tampered), /differs/);
});

test('TypeSafe Place registers new land east of Woodland Heights, and loading checks the registration', () => {
  const validated = validateWorldManifest(manifest), byId = id => validated.locations.find(location => location.id === id);
  const location = byId('typesafe-place'), woodland = byId('woodland-heights');
  assert.equal(location.status, 'authored'); assert.equal(location.content_revision, TYPESAFE_REVISION);
  assert.deepEqual(location.bounds_m, typesafe.bounds);
  // Woodland's east edge, 150 m further east, and the District's north/south span.
  assert.deepEqual(location.bounds_m, [woodland.bounds_m[2], woodland.bounds_m[1], -1963.4479977351207, woodland.bounds_m[3]]);
  assert.ok(Math.abs(location.bounds_m[2] - location.bounds_m[0] - 150) < 1e-9);
  assert.deepEqual(locationWorldBounds(location), location.bounds_m);
  assert.ok(location.adjacent.includes('woodland-heights') && woodland.adjacent.includes('typesafe-place'));
  assert.ok(validated.locations.every(item => item.id === 'typesafe-place' || item.bounds_m[2] <= location.bounds_m[0]), 'wholly east of every other location');
  assert.equal(validateTypeSafeRegistration(manifest, layout), layout);
  for (const mutate of [item => { item.content_revision = 'typesafe-place-0'; }, item => { item.bounds_m[2] += 1; }, item => { item.entries[0].position_m[1] += 1; }, item => { item.status = 'reserved'; }]) {
    const changed = structuredClone(manifest); mutate(changed.locations.find(item => item.id === 'typesafe-place'));
    assert.throws(() => validateTypeSafeRegistration(changed, layout), /differs|Invalid world manifest/);
  }
});

test('the recipes reproduce their locks within the kit budgets', () => {
  const lock = name => JSON.parse(readFileSync(new URL(`../../config/destinations/${name}.lock.json`, import.meta.url)));
  const { trianglesPerNeighborhood, solidsPerNeighborhood, materialsPerNeighborhood } = KIT_CONVENTIONS.budgets;
  assert.deepEqual(TYPESAFE_RECIPES.map(recipe => recipe.id), NEIGHBORHOODS);
  for (const recipe of TYPESAFE_RECIPES) {
    const plan = assembleNeighborhood(recipe);
    assert.equal(plan.hash, lock(recipe.id).hash, recipe.id);
    assert.ok(plan.stats.triangles <= trianglesPerNeighborhood && plan.stats.solids <= solidsPerNeighborhood && plan.stats.materials <= materialsPerNeighborhood, recipe.id);
  }
  // Both signature towers stand twenty storeys: 4.6 m ground floor and nineteen 3.5 m storeys.
  const towers = typesafe.plans.flatMap(plan => plan.pieces).filter(piece => piece.style === 'place-tower');
  assert.deepEqual(towers.map(piece => [piece.id.split('/').pop(), piece.storeys, piece.height, piece.roof]),
    [['luxury-living', 20, 71.1, 'parapet'], ['penthouse-row', 20, 71.1, 'crown']]);
  assert.equal(typesafe.plans.flatMap(plan => plan.pieces).filter(piece => piece.piece === 'landmark/ribbon').length, 1);
});

test('only the two cross streets reach back into Woodland, which opens its street ends to them', () => {
  const added = layout.surfaces.slice(typesafe.surfaceStart), west = typesafe.bounds[0];
  assert.deepEqual(added.filter(surface => surface.rect[0] < west).map(surface => surface.id).sort(),
    ['typesafe-place-green/eighteenth-typesafe/walk', 'typesafe-place-north/twentieth-typesafe/walk', 'typesafe-place/eighteenth-seam', 'typesafe-place/twentieth-seam']);
  for (const surface of added) assert.ok(surface.rect[0] >= layout.edge + 551.5 && surface.rect[2] <= typesafe.bounds[2], surface.id);
  const earlier = layout.surfaces.slice(0, typesafe.surfaceStart), street = id => earlier.find(surface => surface.id === id).rect;
  for (const [seam, id] of [['twentieth', 'woodland-heights-north/twentieth-woodland/walk'], ['eighteenth', 'woodland-heights-south/eighteenth-woodland/walk']]) {
    const rect = added.find(surface => surface.id === `typesafe-place/${seam}-seam`).rect, other = street(id);
    assert.ok(rect[0] < other[2] - .7 && rect[1] === other[1] && rect[3] === other[3], `${seam} overlaps ${id}`);
  }
  const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const surface of added.filter(surface => surface.rect[0] >= west)) for (const other of earlier) assert.ok(!overlaps(surface.rect, other.rect), `${surface.id} joins ${other.id}`);
  // Woodland's hedged green edge stays closed; its two street ends open only in this revision.
  const environment = createWalkingEnvironment(world), woodland = createWalkingEnvironment(woodlandWorld);
  const free = (env, at) => { const [x, n] = frame(at); return env.isFree(x, -n); };
  for (const at of [[552.8, 50], [552.8, 140], [552.8, -30], [552.8, -100]]) assert.equal(free(environment, at), false, `no crossing at ${at}`);
  for (const at of [[551.9, 111], [552.8, 111], [551.9, -71], [552.8, -71]]) {
    assert.equal(free(environment, at), true, `the cross street continues at ${at}`);
    assert.equal(free(woodland, at), false, `Woodland Heights alone keeps its hedge at ${at}`);
  }
});

test('every TypeSafe sample connects to Woodland\'s cross streets: no islands or dead-end pockets', () => {
  const streets = layout.surfaces.slice(0, typesafe.surfaceStart).filter(surface => ['woodland-heights-north/twentieth-woodland/walk', 'woodland-heights-south/eighteenth-woodland/walk'].includes(surface.id));
  const result = walkableConnectivity({ surfaces: [...streets, ...layout.surfaces.slice(typesafe.surfaceStart)], solids: layout.solids.slice(typesafe.solidStart) },
    { entry: frame([540, 111]), step: .5 });
  assert.equal(result.ratio, 1, `${result.total - result.reached} disconnected samples`);
  for (const at of [[600, -20], [605, 60], [628, 160], [628, -115], [660, 111], [690, -71], [660, 20], [600, -92], [670, 132]]) assert.ok(result.reachable(frame(at)), `frame ${at}`);
});

test('the real walking controller walks from Woodland along Twentieth Street across Place Avenue and back', () => {
  const environment = createWalkingEnvironment(world), start = [...frame([540, 111]), 0];
  const walker = createWalkingState(environment, start, -Math.PI / 2);
  for (let i = 0; i < 4000 && walker.position[0] < layout.edge + 660; i++) stepWalking(walker, environment, { forward: 1, fast: true }, .04);
  assert.ok(walker.position[0] > layout.edge + 660, `Reached ${walker.position[0] - layout.edge} m east of the edge`);
  assert.ok(inTypeSafePlace(layout, walker.position[0]));
  assert.ok(Math.abs(environment.groundAt(walker.position[0], walker.position[2]) - layout.ground) < .01, 'TypeSafe Place is level with Woodland');
  walker.yaw = Math.PI / 2; walker.velocity = [0, 0]; walker.acceleration = [0, 0];
  for (let i = 0; i < 4000 && walker.position[0] > start[0]; i++) stepWalking(walker, environment, { forward: 1, fast: true }, .04);
  assert.ok(Math.abs(walker.position[0] - start[0]) < .1, `Returned to ${walker.position[0] - layout.edge}`);
});

test('building land, the location edge and every TypeSafe solid stay closed', () => {
  const environment = createWalkingEnvironment(world), free = at => { const [x, n] = frame(at); return environment.isFree(x, -n); };
  for (const at of [[703.2, 50], [703.2, 111], [628, 168], [628, -123]]) assert.equal(free(at), false, `outside ${at}`);
  for (const plan of typesafe.plans) for (const shell of plan.pieces.filter(piece => piece.piece === 'building/shell')) {
    const [w, s, e, n] = shell.rect, x = (w + e) / 2, y = (s + n) / 2;
    assert.equal(environment.isFree(x, -y), false, shell.id); assert.equal(environment.canFly(x, layout.ground + 3, -y), false, shell.id);
  }
  for (const solid of layout.solids.slice(typesafe.solidStart)) {
    const x = (solid.rect[0] + solid.rect[2]) / 2, n = (solid.rect[1] + solid.rect[3]) / 2;
    assert.equal(environment.isFree(x, -n), false, solid.id);
  }
  assert.equal(environment.isAreaFree(...(([x, n]) => [x, -n])(frame([600, -20])), 2), true, 'open green lawn');
});

test('Jevica flies over every TypeSafe roof, the towers under a ceiling that rises for this revision alone', () => {
  const environment = createWalkingEnvironment(world);
  // Twenty storeys and the roof margin under the ceiling; every earlier revision keeps its own.
  assert.ok(environment.flightCeiling > 71.1 + 3.1 && environment.flightCeiling < 85, `ceiling ${environment.flightCeiling}`);
  assert.ok(Math.abs(createWalkingEnvironment(woodlandWorld).flightCeiling - 41.09) < .01);
  const shells = typesafe.plans.flatMap(plan => plan.pieces).filter(piece => piece.piece.startsWith('building/'));
  let roomy = 0;
  for (const shell of shells) {
    const [w, s, e, n] = shell.rect, x = (w + e) / 2, y = (s + n) / 2;
    const ground = Math.max(...[[w, s], [e, s], [e, n], [w, n], [x, y]].map(([east, north]) => environment.groundAt(east, -north)));
    assert.equal(environment.canFly(x, ground + shell.height, -y), false, `${shell.id}: not through the roof`);
    if (e - w < 3 || n - s < 3) continue;
    roomy++;
    assert.equal(environment.canFly(x, ground + shell.height + 3.2, -y), true, `${shell.id}: just over the roof`);
    assert.equal(environment.canFly(x, ground + environment.flightCeiling, -y), true, `${shell.id}: at the ceiling`);
  }
  assert.ok(roomy >= 45, `${roomy} roofs`);
});

test('the location label names TypeSafe Place beyond Woodland and Woodland before it', () => {
  assert.equal(connectedLocationAt(world, ...frame([600, -20])), TYPESAFE_NAME);
  assert.equal(connectedLocationAt(world, ...frame([660, 111])), TYPESAFE_NAME);
  assert.equal(connectedLocationAt(world, ...frame([545, 40])), WOODLAND_NAME);
  assert.equal(connectedLocationAt(world, ...frame([552.6, 111])), WOODLAND_NAME, 'the seam is in Woodland up to its edge');
  assert.equal(connectedLocationAt(woodlandWorld, ...frame([545, 40])), WOODLAND_NAME);
});

test('TypeSafe neighborhoods build within the kit budgets and stream within their estimates', () => {
  const { drawCallsPerNeighborhood } = KIT_CONVENTIONS.budgets;
  for (const plan of typesafe.plans) {
    const kit = buildHeightsNeighborhood(layout, plan), stats = kit.userData.stats(), buffers = new Set();
    assert.ok(stats.meshes <= drawCallsPerNeighborhood, `${plan.id}: ${JSON.stringify(stats)}`);
    assert.equal(kit.getObjectByName(`${plan.id} trees`).children.length, 0);
    // Estimates err high, within a quarter of the measured geometry.
    kit.traverse(item => { if (item.geometry) for (const attribute of [...Object.values(item.geometry.attributes), item.geometry.index].filter(Boolean)) buffers.add(attribute.array.buffer); });
    const bytes = [...buffers].reduce((n, buffer) => n + buffer.byteLength, 0), estimate = HEIGHTS_CHUNK_BYTES[plan.id];
    assert.ok(bytes <= estimate && estimate <= bytes * 1.25, `${plan.id}: ${(bytes / MiB).toFixed(2)} MiB against ${(estimate / MiB).toFixed(2)} MiB`);
    kit.userData.dispose(); assert.equal(kit.children.length, 0);
  }
});

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

test('Heights streams TypeSafe Place as five neighborhoods: a tower stays in view from the green, and a step waits for one still loading', async () => {
  const stream = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule: standIns() });
  assert.deepEqual(stream.debug().chunks.map(chunk => chunk.id).filter(id => id.includes('typesafe')), NEIGHBORHOODS.map(id => `bayou-heights/${id}`));
  // From the ribbon, the green and Luxury Living across it fit under the ceiling together.
  await settle(stream, [frame([590, -40])]);
  for (const id of ['shared', 'typesafe-place-green', 'typesafe-place-north']) assert.ok(resident(stream).includes(id), `${id} in ${resident(stream)}`);
  assert.ok(stream.debug().residentBytes <= HEIGHTS_MAX_BYTES);
  // On Place Avenue between the towers, both towers' neighborhoods.
  await settle(stream, [frame([628, 60])]);
  for (const id of ['typesafe-place-north', 'typesafe-place-penthouse']) assert.ok(resident(stream).includes(id), `${id} in ${resident(stream)}`);
  assert.ok(stream.debug().residentBytes <= HEIGHTS_MAX_BYTES);
  // At the end of Woodland's Twentieth Street, both sides of the seam.
  await settle(stream, [frame([551, 111])]);
  for (const id of ['woodland-heights-north', 'typesafe-place-north']) assert.ok(resident(stream).includes(id), `${id} in ${resident(stream)}`);
  stream.dispose();
  const unloaded = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule: standIns(new Set(['typesafe-place-north'])) });
  await settle(unloaded, [frame([549, 111])]);
  assert.equal(unloaded.allowsStep(frame([549, 111]), frame([550, 111])), true, 'Woodland is presented');
  assert.equal(unloaded.allowsStep(frame([552, 111]), frame([554, 111])), false, 'TypeSafe Place waits to load');
  assert.equal(unloaded.allowsStep(frame([570, 111]), frame([569, 111])), true, 'someone restored there may walk back west');
  unloaded.dispose();
});

test('nobody restored on TypeSafe ground is held there while it loads: every free cell walks back to Woodland', async () => {
  // A reverse flood fill over TypeSafe's 0.5 m cells, stepping only where the stream allows, from Woodland's ground.
  const environment = createWalkingEnvironment(world), exit = 552.15, step = .5, x0 = 545, x1 = 703, y0 = -123, y1 = 168;
  const nx = Math.round((x1 - x0) / step) + 1, ny = Math.round((y1 - y0) / step) + 1, at = (i, j) => frame([x0 + i * step, y0 + j * step]);
  const free = new Uint8Array(nx * ny);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const point = at(i, j); if (environment.isFree(point[0], -point[1])) free[i * ny + j] = 1; }
  const failures = { 'the Heights module': async () => { throw new Error('offline'); } };
  for (const id of ['typesafe-place-north', 'typesafe-place-penthouse', 'typesafe-place-green']) failures[id] = standIns(new Set([id]));
  for (const [failing, loadModule] of Object.entries(failures)) {
    const stream = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, loadModule });
    // Streamed from both street ends, so Woodland's side of each seam is presented.
    for (let i = 0; i < 80; i++) { stream.update([frame([551, 111]), frame([551, -71])]); await new Promise(resolve => setTimeout(resolve, 3)); }
    const reached = new Uint8Array(nx * ny), queue = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (free[i * ny + j] && x0 + i * step < exit) { reached[i * ny + j] = 1; queue.push(i * ny + j); }
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
    if (held.length) console.log(failing, JSON.stringify([0, 1].map(axis => [Math.min(...held.map(c => c[axis])), Math.max(...held.map(c => c[axis]))])));
    assert.deepEqual(held.slice(0, 5), [], `${failing} failing holds ${held.length * step * step} m² of TypeSafe Place`);
    stream.dispose();
  }
});
