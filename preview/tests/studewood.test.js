import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDistrictData } from '../../server/district-data.js';
import { configuredDistrictRevision, districtRevisionOf } from '../src/garden-campus-district.js';
import { attachBayouHeights } from '../src/bayou-heights-world.js';
import { attachStudewood, detachStudewood, validateStudewoodRegistration } from '../src/studewood-world.js';
import { buildHeightsLandscape, buildHeightsNeighborhood } from '../src/bayou-heights.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';
import { chessSeat, plazaSalonSeats } from '../src/plaza-salon-plan.js';
import { connectedLocationAt, HEIGHTS_NAME, STUDEWOOD_NAME } from '../src/world-location-label.js';
import { validateWorldManifest, locationWorldBounds } from '../src/world-manifest.js';
import { HEIGHTS_REVISION } from '../../shared/bayou-heights-layout.js';
import { composeStudewood, heightsBaseLayout, STUDEWOOD_RECIPES, STUDEWOOD_REVISION, STUDEWOOD_TABLE, inStudewood } from '../../shared/studewood.js';
import { assembleNeighborhood, walkableConnectivity } from '../../shared/city-kit/assemble.js';
import { KIT_CONVENTIONS } from '../../shared/city-kit/catalog.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };

const heightsWorld = await loadDistrictData({ districtRevision: HEIGHTS_REVISION });
const world = await loadDistrictData({ districtRevision: STUDEWOOD_REVISION }), layout = world.eastGardenCommons, { studewood } = layout;
// The recipe frame: metres east of the District edge and north of Market Street's centreline.
const frame = ([x, y]) => [layout.edge + x, -1335 + y];

test('Studewood composes on Heights exactly as the client does and detaches exactly', async () => {
  assert.equal(configuredDistrictRevision(STUDEWOOD_REVISION), STUDEWOOD_REVISION);
  assert.equal(districtRevisionOf(world), STUDEWOOD_REVISION);
  const heights = heightsWorld.eastGardenCommons;
  assert.deepEqual(attachStudewood(heightsWorld), world, 'server and client compose the same world');
  assert.deepEqual(detachStudewood(world), heightsWorld, 'detach restores Heights exactly');
  assert.deepEqual(heightsBaseLayout(layout), heights);
  // Heights keeps every index: its surfaces, solids and plans are a prefix of Studewood's.
  assert.deepEqual(layout.surfaces.slice(0, studewood.surfaceStart), heights.surfaces);
  assert.deepEqual(layout.solids.slice(0, studewood.solidStart), heights.solids);
  assert.deepEqual(layout.heights.plans.slice(0, studewood.planStart), heights.heights.plans);
  assert.deepEqual(layout.heights.plans.slice(studewood.planStart).map(plan => plan.id), ['studewood-north', 'studewood-south']);
  assert.deepEqual(layout.districtBounds, heights.districtBounds, 'District build bounds are unchanged');
  assert.equal(new Set(layout.solids.map(solid => solid.id)).size, layout.solids.length);
  assert.throws(() => attachStudewood(world), /composed Bayou Heights/);
  const commons = await loadDistrictData({ districtRevision: 'east-garden-commons-market-1' });
  assert.throws(() => attachStudewood(commons), /composed Bayou Heights/, 'Studewood composes only onto Heights');
  assert.deepEqual(attachBayouHeights(commons), heightsWorld, 'and Heights still composes onto the Commons alone');
  assert.throws(() => composeStudewood(heights.studewood ? heights : { ...heights, revision: 'east-garden-commons-market-1' }), /composed Bayou Heights/);
  const tampered = structuredClone(world); tampered.eastGardenCommons.surfaces.at(-1).rect[0] += 1;
  assert.throws(() => detachStudewood(tampered), /differs/);
});

test('Studewood authors the rest of the east reserve without enlarging it, and loading checks the registration', () => {
  const validated = validateWorldManifest(manifest), byId = id => validated.locations.find(location => location.id === id);
  const location = byId('studewood'), heights = byId('bayou-heights');
  assert.equal(location.status, 'authored'); assert.equal(location.content_revision, STUDEWOOD_REVISION);
  assert.deepEqual(location.bounds_m, studewood.bounds);
  // The original east reserve's east edge, and the District's north/south span.
  assert.deepEqual(location.bounds_m, [heights.bounds_m[2], heights.bounds_m[1], -2158.4479977351207, heights.bounds_m[3]]);
  assert.deepEqual(locationWorldBounds(location), location.bounds_m);
  assert.ok(location.adjacent.includes('bayou-heights') && heights.adjacent.includes('studewood'));
  assert.equal(validated.locations.some(item => item.id === 'east-garden-reserve'), false, 'no reserve remains east of the bayou');
  assert.equal(validateStudewoodRegistration(manifest, layout), layout);
  for (const mutate of [item => { item.content_revision = 'heights-studewood-0'; }, item => { item.bounds_m[2] += 1; }, item => { item.entries[0].position_m[1] += 1; }, item => { item.status = 'reserved'; }]) {
    const changed = structuredClone(manifest); mutate(changed.locations.find(item => item.id === 'studewood'));
    assert.throws(() => validateStudewoodRegistration(changed, layout), /differs|Invalid world manifest/);
  }
});

test('the recipes reproduce their locks within the kit budgets', () => {
  const lock = name => JSON.parse(readFileSync(new URL(`../../config/destinations/${name}.lock.json`, import.meta.url)));
  const { trianglesPerNeighborhood, solidsPerNeighborhood, materialsPerNeighborhood } = KIT_CONVENTIONS.budgets;
  for (const recipe of STUDEWOOD_RECIPES) {
    const plan = assembleNeighborhood(recipe);
    assert.equal(plan.hash, lock(recipe.id).hash, recipe.id);
    assert.ok(plan.stats.triangles <= trianglesPerNeighborhood && plan.stats.solids <= solidsPerNeighborhood && plan.stats.materials <= materialsPerNeighborhood, recipe.id);
  }
});

test('only the two cross streets reach back into Heights, through frontage gaps with no Heights building', () => {
  const added = layout.surfaces.slice(studewood.surfaceStart), west = studewood.bounds[0];
  assert.deepEqual(added.filter(surface => surface.rect[0] < west).map(surface => surface.id).sort(),
    ['studewood-north/twentieth-studewood/walk', 'studewood-south/eighteenth-studewood/walk', 'studewood/eighteenth-seam', 'studewood/twentieth-seam']);
  for (const surface of added) assert.ok(surface.rect[0] >= layout.edge + 404 && surface.rect[2] <= studewood.bounds[2], surface.id);
  // The seams overlap the Heights cross streets they continue, so the walking radius does not wall them off.
  const heightsStreet = id => layout.surfaces.slice(0, studewood.surfaceStart).find(surface => surface.id === id).rect;
  for (const [seam, street] of [['twentieth', 'heights-boulevard-north/twentieth-east/walk'], ['eighteenth', 'heights-boulevard-south/eighteenth-east-end/walk']]) {
    const rect = added.find(surface => surface.id === `studewood/${seam}-seam`).rect, other = heightsStreet(street);
    assert.ok(rect[0] < other[2] - .7 && rect[1] === other[1] && rect[3] === other[3], `${seam} overlaps ${street}`);
  }
  const buildings = layout.heights.plans.slice(0, studewood.planStart).flatMap(plan => plan.pieces.filter(piece => piece.piece === 'building/shell'));
  for (const surface of added) for (const { id, rect } of buildings) {
    assert.ok(!(surface.rect[0] < rect[2] && rect[0] < surface.rect[2] && surface.rect[1] < rect[3] && rect[1] < surface.rect[3]), `${surface.id} crosses ${id}`);
  }
});

test('every Studewood sample connects to Heights Boulevard: no islands or dead-end pockets', () => {
  const heights = layout.surfaces.slice(0, studewood.surfaceStart).filter(surface => surface.id.startsWith('heights-boulevard-'));
  const result = walkableConnectivity({ surfaces: [...heights, ...layout.surfaces.slice(studewood.surfaceStart)], solids: layout.solids.slice(layout.heights.solidStart) },
    { entry: frame([396, 111]), step: .5 });
  assert.equal(result.ratio, 1, `${result.total - result.reached} disconnected samples`);
  for (const at of [[429.5, 0], [429.5, 160], [429.5, -115], [470, 30], [480, 140], [480, -40], [480, -100], [500, 111], [500, -71]]) assert.ok(result.reachable(frame(at)), `frame ${at}`);
});

test('the real walking controller walks from Heights Boulevard along Twentieth Street into Studewood Park and back', () => {
  const environment = createWalkingEnvironment(world), start = [...frame([396, 111]), 0];
  const walker = createWalkingState(environment, start, -Math.PI / 2);
  for (let i = 0; i < 1600 && walker.position[0] < layout.edge + 470; i++) stepWalking(walker, environment, { forward: 1, fast: true }, .04);
  assert.ok(walker.position[0] > layout.edge + 470, `Reached ${walker.position[0] - layout.edge} m east of the edge`);
  assert.ok(inStudewood(layout, walker.position[0]));
  assert.ok(Math.abs(environment.groundAt(walker.position[0], walker.position[2]) - layout.ground) < .01, 'Studewood is level with Heights');
  walker.yaw = Math.PI / 2; walker.velocity = [0, 0]; walker.acceleration = [0, 0];
  for (let i = 0; i < 1600 && walker.position[0] > start[0]; i++) stepWalking(walker, environment, { forward: 1, fast: true }, .04);
  assert.ok(Math.abs(walker.position[0] - start[0]) < .1, `Returned to ${walker.position[0] - layout.edge}`);
  // The Heights revision has no ground beyond the boulevard's sidewalk.
  const heightsEnvironment = createWalkingEnvironment(heightsWorld), [x, n] = frame([415, 111]);
  assert.equal(heightsEnvironment.isFree(x, -n), false);
  assert.equal(environment.isFree(x, -n), true);
});

test('building land, the location edge and every Studewood solid stay closed', () => {
  const environment = createWalkingEnvironment(world), free = at => { const [x, n] = frame(at); return environment.isFree(x, -n); };
  for (const at of [[421.5, 50], [508.5, 50], [480, 166], [480, -121]]) assert.equal(free(at), false, `outside ${at}`);
  for (const plan of studewood.plans) for (const shell of plan.pieces.filter(piece => piece.piece === 'building/shell')) {
    const [w, s, e, n] = shell.rect, x = (w + e) / 2, y = (s + n) / 2;
    assert.equal(environment.isFree(x, -y), false, shell.id); assert.equal(environment.canFly(x, layout.ground + 3, -y), false, shell.id);
  }
  for (const solid of layout.solids.slice(studewood.solidStart)) {
    const x = (solid.rect[0] + solid.rect[2]) / 2, n = (solid.rect[1] + solid.rect[3]) / 2;
    assert.equal(environment.isFree(x, -n), false, solid.id);
  }
  assert.equal(environment.isAreaFree(...(([x, n]) => [x, -n])(frame([472, 40])), 2), true, 'open park lawn');
});

test('the location label names Studewood beyond the boulevard and Bayou Heights before it', () => {
  assert.equal(connectedLocationAt(world, ...frame([429.5, 50])), STUDEWOOD_NAME);
  assert.equal(connectedLocationAt(world, ...frame([470, 30])), STUDEWOOD_NAME);
  assert.equal(connectedLocationAt(world, ...frame([396, 111])), HEIGHTS_NAME);
  assert.equal(connectedLocationAt(world, ...frame([415, 111])), HEIGHTS_NAME, 'the cross-street seam is still in Heights');
  assert.equal(connectedLocationAt(heightsWorld, ...frame([396, 111])), HEIGHTS_NAME);
});

test('the Studewood Park table seats two players in the shared seat model', () => {
  const seats = plazaSalonSeats(world).filter(seat => seat.buildId.startsWith(`bench:plaza-salon-${STUDEWOOD_TABLE}-`));
  assert.equal(seats.length, 2);
  const environment = createWalkingEnvironment(world);
  for (const [chair, seat] of seats.entries()) {
    assert.equal(seat.title, 'Studewood Park game table');
    assert.deepEqual(chessSeat(seat.buildId), { tableId: STUDEWOOD_TABLE, chair });
    assert.ok(environment.isFree(seat.approach[0], -seat.approach[1]), `approach ${chair}`);
    assert.ok(inStudewood(layout, seat.x));
  }
  assert.equal(plazaSalonSeats(heightsWorld).some(seat => seat.buildId.includes(STUDEWOOD_TABLE)), false, 'the Heights revision has no Studewood table');
});

test('Studewood neighborhoods build within the kit budgets, leave their trees to the shared landscape and dispose', () => {
  const { drawCallsPerNeighborhood, materialsPerNeighborhood, trianglesPerNeighborhood, solidsPerNeighborhood } = KIT_CONVENTIONS.budgets;
  for (const plan of studewood.plans) {
    const kit = buildHeightsNeighborhood(layout, plan), stats = kit.userData.stats();
    // As for Heights: the kit budgets an assembled plan's materials, triangles and solids,
    // and a drawn plan's meshes (city-kit.test.js, scripts/destination.mjs).
    assert.ok(plan.stats.materials <= materialsPerNeighborhood && plan.stats.triangles <= trianglesPerNeighborhood
      && plan.stats.solids <= solidsPerNeighborhood, `${plan.id}: ${JSON.stringify(plan.stats)}`);
    assert.ok(stats.meshes <= drawCallsPerNeighborhood, `${plan.id}: ${JSON.stringify(stats)}`);
    assert.equal(kit.getObjectByName(`${plan.id} trees`).children.length, 0);
    kit.userData.dispose(); assert.equal(kit.children.length, 0);
  }
  const landscape = buildHeightsLandscape(layout), heights = buildHeightsLandscape(heightsWorld.eastGardenCommons);
  assert.ok(landscape.getObjectByName('bayou-heights trees').userData.placements > heights.getObjectByName('bayou-heights trees').userData.placements, 'Studewood trees draw in the shared landscape');
  landscape.userData.dispose(); heights.userData.dispose();
});

test('Heights streams Studewood as two more neighborhoods, within the ceiling, and gates a step into one still loading', async () => {
  const THREE = await import('three');
  const { createHeightsStream, HEIGHTS_CHUNK_BYTES, HEIGHTS_MAX_BYTES } = await import('../src/heights-stream.js');
  const MiB = 1024 * 1024;
  // Estimates err high, within a quarter of the measured geometry.
  for (const plan of studewood.plans) {
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
  assert.deepEqual(stream.debug().chunks.map(chunk => chunk.id).filter(id => id.includes('studewood')), ['bayou-heights/studewood-north', 'bayou-heights/studewood-south']);
  // Studewood's trees and planted beds draw in the shared part, so its estimate grows by their allowances; Heights' own is unchanged.
  const { HEIGHTS_SHARED_PLACEMENT_BYTES } = await import('../src/heights-stream.js'), { cityKitLandscape } = await import('../src/city-kit/render.js');
  const added = studewood.plans.map(plan => cityKitLandscape(plan, { groundAt: () => layout.ground, ground: layout.ground }))
    .reduce((bytes, { trees, planters }) => bytes + trees.length * HEIGHTS_SHARED_PLACEMENT_BYTES.tree + planters.length * HEIGHTS_SHARED_PLACEMENT_BYTES.planter, 0);
  assert.ok(added > 0);
  assert.equal(stream.debug().estimatedBytes['bayou-heights'], HEIGHTS_CHUNK_BYTES['bayou-heights'] + added);
  const plain = createHeightsStream({ world: heightsWorld, parent: new THREE.Group(), now: () => 0, loadModule: standIns() });
  assert.equal(plain.debug().estimatedBytes['bayou-heights'], HEIGHTS_CHUNK_BYTES['bayou-heights']);
  plain.dispose();
  await settle(stream, [frame([472, 40])]);
  const kept = resident(stream);
  for (const id of ['shared', 'studewood-north']) assert.ok(kept.includes(id), `${id} in ${kept}`);
  assert.ok(stream.debug().residentBytes <= HEIGHTS_MAX_BYTES);
  await settle(stream, [[layout.edge - 200, -1335]]);
  assert.deepEqual(resident(stream), [], 'walking back to the District releases Studewood too');
  stream.dispose();
  // Studewood south never loads: from presented park ground at the edge of its site, the market green waits.
  const notices = [], partial = createHeightsStream({ world, parent: new THREE.Group(), now: () => 0, onStatus: text => notices.push(text), loadModule: standIns(new Set(['studewood-south'])) });
  const lawn = frame([472, 1]);
  await settle(partial, [lawn]);
  assert.equal(partial.allowsStep(lawn, frame([472, .5])), true);
  assert.equal(partial.allowsStep(lawn, frame([472, -1])), false, 'the next neighborhood waits to load');
  assert.match(notices.at(-1), /Bayou Heights is still loading/, 'Studewood ground is inside the stream, so its notices show');
  partial.dispose();
});
