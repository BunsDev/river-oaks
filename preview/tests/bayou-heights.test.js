import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { configuredDistrictRevision, districtRevisionOf, DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';
import { attachEastGardenCommons } from '../src/east-garden-commons-world.js';
import { attachBayouHeights, detachBayouHeights, validateHeightsRegistration } from '../src/bayou-heights-world.js';
import { buildBayouHeights, HEIGHTS_VISIBLE_METRES } from '../src/bayou-heights.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';
import { chessSeat, plazaSalonSeats } from '../src/plaza-salon-plan.js';
import { validateWorldManifest, locationWorldBounds } from '../src/world-manifest.js';
import { HEIGHTS_RECIPES, HEIGHTS_REVISION, HEIGHTS_TABLE, inBayouHeights } from '../../shared/bayou-heights.js';
import { assembleNeighborhood, walkableConnectivity } from '../../shared/city-kit/assemble.js';
import { KIT_CONVENTIONS } from '../../shared/city-kit/catalog.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };

const gardens = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS });
const commons = await loadDistrictData({ districtRevision: COMMONS_REVISION });
const world = await loadDistrictData({ districtRevision: HEIGHTS_REVISION }), layout = world.eastGardenCommons, { heights } = layout;
// The recipe frame: metres east of the District edge and north of Market Street's centreline.
const frame = ([x, y]) => [layout.edge + x, -1335 + y];

test('Heights composes on the Commons exactly as the client does and detaches exactly', () => {
  assert.equal(configuredDistrictRevision(HEIGHTS_REVISION), HEIGHTS_REVISION);
  assert.equal(districtRevisionOf(world), HEIGHTS_REVISION);
  const before = structuredClone(commons);
  assert.deepEqual(attachBayouHeights(attachEastGardenCommons(gardens)), world, 'browser and server compose the same world');
  assert.deepEqual(commons, before, 'composition does not mutate the Commons world');
  assert.deepEqual(detachBayouHeights(world), commons);
  assert.deepEqual(Object.keys(world), Object.keys(commons), 'composed fields keep their order');
  // Commons ground, solids and collision keep their indices; Heights only appends.
  assert.deepEqual(layout.surfaces.slice(0, heights.surfaceStart), commons.eastGardenCommons.surfaces);
  assert.deepEqual(layout.solids.slice(0, heights.solidStart), commons.eastGardenCommons.solids);
  assert.deepEqual(world.collisionPolygons.slice(0, commons.collisionPolygons.length), commons.collisionPolygons);
  assert.equal(new Set(layout.solids.map(solid => solid.id)).size, layout.solids.length);
  assert.deepEqual(layout.districtBounds, commons.eastGardenCommons.districtBounds, 'District build bounds are unchanged');
  // The footbridge opening removes only the Commons bayou edge pieces.
  for (const key of ['surfaces', 'solids', 'lanterns']) assert.deepEqual(layout.destination[key], commons.eastGardenCommons.destination[key], key);
  const approved = new Set(commons.eastGardenCommons.destination.provenance.overrides.applied);
  assert.deepEqual(layout.destination.provenance.overrides.applied.filter(id => !approved.has(id)), ['bayou-market-commons/bayou', 'bayou-market-commons/bayou-railing']);
  assert.throws(() => attachBayouHeights(world), /composed Commons/);
  assert.throws(() => attachBayouHeights(gardens), /composed Commons/);
  const tampered = structuredClone(world); tampered.eastGardenCommons.surfaces.at(-1).rect[0] += 1;
  assert.throws(() => detachBayouHeights(tampered), /differs/);
});

test('the manifest partitions the reserve without enlarging it, and loading checks the registration', () => {
  const validated = validateWorldManifest(manifest), byId = id => validated.locations.find(location => location.id === id);
  const location = byId('bayou-heights'), reserve = byId('east-garden-reserve');
  assert.equal(location.status, 'authored'); assert.equal(reserve.status, 'reserved');
  assert.deepEqual(location.bounds_m, heights.bounds);
  // The original east reserve, [-2551.336…, -1457.608…, -2158.447…, -1167.177…], split at Heights' east edge.
  assert.deepEqual([location.bounds_m[0], location.bounds_m[1], reserve.bounds_m[2], location.bounds_m[3]],
    [-2551.336078522973, -1457.6085898216527, -2158.4479977351207, -1167.1779702985634]);
  assert.equal(location.bounds_m[2], reserve.bounds_m[0]);
  assert.deepEqual([reserve.bounds_m[1], reserve.bounds_m[3]], [location.bounds_m[1], location.bounds_m[3]]);
  assert.deepEqual(locationWorldBounds(location), location.bounds_m);
  assert.equal(byId('east-garden-commons').bounds_m[2], location.bounds_m[0], 'Heights begins at the Commons edge');
  assert.ok(location.adjacent.includes('east-garden-commons') && reserve.adjacent.includes('bayou-heights'));
  assert.equal(validateHeightsRegistration(manifest, layout), layout);
  for (const mutate of [item => { item.content_revision = 'bayou-heights-0'; }, item => { item.bounds_m[2] += 1; }, item => { item.entries[0].position_m[2] += 1; }, item => { item.status = 'reserved'; }]) {
    const changed = structuredClone(manifest); mutate(changed.locations.find(item => item.id === 'bayou-heights'));
    assert.throws(() => validateHeightsRegistration(changed, layout), /differs|Invalid world manifest/);
  }
});

test('the recipes reproduce their locks and the promoted crossroads keeps its geometry', () => {
  const lock = name => JSON.parse(readFileSync(new URL(`../../config/destinations/${name}.lock.json`, import.meta.url)));
  for (const recipe of HEIGHTS_RECIPES) assert.equal(assembleNeighborhood(recipe).hash, lock(recipe.id).hash, recipe.id);
  const crossroads = heights.plans.find(plan => plan.id === 'nineteenth-and-yale');
  assert.deepEqual(crossroads.anchor, [Math.round((layout.edge + 250) * 1000) / 1000, -1335 - 64]);
  assert.equal(crossroads.stats.solids, 62); assert.equal(crossroads.stats.buildings, 43);
});

test('every Heights sample connects to the footbridge: no islands or dead-end pockets', () => {
  const plaza = layout.surfaces.find(surface => surface.id === `${layout.id}/plaza`);
  const result = walkableConnectivity({ surfaces: [plaza, ...layout.surfaces.slice(heights.surfaceStart)], solids: layout.solids.slice(heights.solidStart) },
    { entry: frame([110, 1.5]), step: .5 });
  assert.equal(result.ratio, 1, `${result.total - result.reached} disconnected samples`);
  for (const at of [[133, 0], [200, -16], [205, 112], [307, 0], [385, 60], [385, -60], [275, 86]]) assert.ok(result.reachable(frame(at)), `frame ${at}`);
});

test('real walking controller crosses the footbridge to Heights Hall and returns', () => {
  const environment = createWalkingEnvironment(world), start = [...frame([-1, 1.5]), 0];
  const walker = createWalkingState(environment, start, -Math.PI / 2);
  for (let i = 0; i < 3200 && walker.position[0] < layout.edge + 400; i++) stepWalking(walker, environment, { forward: 1, fast: true }, .04);
  assert.ok(walker.position[0] > layout.edge + 400, `Reached ${walker.position[0] - layout.edge} m east of the edge`);
  assert.ok(inBayouHeights(layout, walker.position[0]));
  assert.ok(Math.abs(environment.groundAt(walker.position[0], walker.position[2]) - layout.ground) < .01, 'Heights is level with the Commons');
  walker.yaw = Math.PI / 2; walker.velocity = [0, 0]; walker.acceleration = [0, 0];
  for (let i = 0; i < 3200 && walker.position[0] > start[0]; i++) stepWalking(walker, environment, { forward: 1, fast: true }, .04);
  assert.ok(Math.abs(walker.position[0] - start[0]) < .1, `Returned to ${walker.position[0] - layout.edge}`);
  assert.ok(Math.abs(walker.position[2] + start[1]) < .01);
});

test('water, building land, the remaining reserve and every Heights solid stay closed', () => {
  const environment = createWalkingEnvironment(world), free = at => { const [x, n] = frame(at); return environment.isFree(x, -n); };
  const fly = (at, height) => { const [x, n] = frame(at); return environment.canFly(x, layout.ground + height, -n); };
  assert.equal(free([133, 0]), true, 'the footbridge deck');
  assert.equal(fly([133, 0], 4), true, 'flight over the deck');
  for (const at of [[133, 20], [133, -20], [133, 3.2]]) { assert.equal(free(at), false, `bayou ${at}`); assert.equal(fly(at, 6), false, `bayou flight ${at}`); }
  assert.equal(free([425, 0]), false, 'remaining east reserve'); assert.equal(fly([425, 0], 6), false);
  assert.equal(free([60, 60]), false, 'reserve north of the Commons'); assert.equal(free([60, -60]), false, 'reserve south of the Commons');
  assert.equal(free([413, 0]), false, 'Heights Hall'); assert.equal(fly([413, 0], 30), false, 'Heights Hall tower');
  for (const plan of heights.plans) for (const shell of plan.pieces.filter(piece => piece.piece === 'building/shell').slice(0, 6)) {
    const [w, s, e, n] = shell.rect, x = (w + e) / 2, y = (s + n) / 2;
    assert.equal(environment.isFree(x, -y), false, shell.id); assert.equal(environment.canFly(x, layout.ground + 3, -y), false, shell.id);
  }
  for (const solid of layout.solids.slice(heights.solidStart)) {
    const x = (solid.rect[0] + solid.rect[2]) / 2, n = (solid.rect[1] + solid.rect[3]) / 2;
    assert.equal(environment.isFree(x, -n), false, solid.id);
    assert.equal(environment.canFly(x, layout.ground + 1, -n), false, solid.id);
  }
  const [bw, bs, be, bn] = heights.bandstand.rect, [bx, by] = [(bw + be) / 2, (bs + bn) / 2];
  assert.equal(environment.canFly(bx, layout.ground + heights.bandstand.height + 2, -by), false, 'flight clears the bandstand roof');
  assert.equal(environment.canFly(bx, layout.ground + heights.bandstand.height + 3.5, -by), true);
  assert.equal(environment.isAreaFree(...(([x, n]) => [x, -n])(frame([200, 60])), 2), true, 'open lawn');
});

test('the icehouse table seats two players in the shared seat model', () => {
  const seats = plazaSalonSeats(world).filter(seat => seat.buildId.startsWith(`bench:plaza-salon-${HEIGHTS_TABLE}-`));
  assert.equal(seats.length, 2);
  const environment = createWalkingEnvironment(world);
  for (const [chair, seat] of seats.entries()) {
    assert.equal(seat.title, 'Icehouse game table');
    assert.deepEqual(chessSeat(seat.buildId), { tableId: HEIGHTS_TABLE, chair });
    assert.ok(environment.isFree(seat.approach[0], -seat.approach[1]), `approach ${chair}`);
    assert.ok(inBayouHeights(layout, seat.x));
  }
  assert.equal(plazaSalonSeats(commons).some(seat => seat.buildId.includes(HEIGHTS_TABLE)), false, 'the Commons revision has no icehouse table');
});

test('the scene draws every neighborhood, culls distant ones and disposes what it owns', () => {
  const group = buildBayouHeights(layout), materials = new Set(), geometries = new Set();
  group.traverse(mesh => { if (mesh.isMesh) { materials.add(mesh.material); geometries.add(mesh.geometry); } });
  const { drawCallsPerNeighborhood, materialsPerNeighborhood } = KIT_CONVENTIONS.budgets;
  for (const plan of heights.plans) {
    const stats = group.getObjectByName(`bayou-heights/${plan.id}`).userData.stats();
    assert.ok(stats.meshes <= drawCallsPerNeighborhood && stats.materials <= materialsPerNeighborhood, `${plan.id}: ${JSON.stringify(stats)}`);
  }
  for (const name of ['footbridge-deck', 'bayou-under-bridge', 'bandstand-roof', 'hall-tower']) assert.ok(group.getObjectByName(`bayou-heights/${name}`), name);
  assert.ok(group.getObjectByName('East Garden Commons'), 'the Commons scene draws under Heights');
  const [bridgeX, bridgeN] = frame([133, 0]);
  group.userData.update(new THREE.Vector3(bridgeX, layout.ground + 1.7, -bridgeN));
  assert.equal(group.userData.stats().drawn, heights.plans.length, 'all of Heights draws from the footbridge');
  const [sx, sn] = world.walkSpawn;
  group.userData.update(new THREE.Vector3(sx, layout.ground, -sn));
  const fromSpawn = group.userData.stats().drawn;
  assert.ok(fromSpawn < heights.plans.length, `${fromSpawn} neighborhoods draw from the District spawn`);
  for (const plan of heights.plans) {
    const [w, s, e, n] = plan.site, distance = Math.hypot(Math.max(w - sx, 0, sx - e), Math.max(s - sn, 0, sn - n));
    assert.equal(group.getObjectByName(`bayou-heights/${plan.id}`).visible, distance < HEIGHTS_VISIBLE_METRES, plan.id);
  }
  let disposedMaterials = 0;
  for (const material of materials) material.addEventListener('dispose', () => disposedMaterials++);
  group.userData.dispose(); group.userData.dispose();
  assert.equal(disposedMaterials, materials.size); assert.equal(group.children.length, 0);
});
