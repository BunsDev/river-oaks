import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { configuredDistrictRevision, districtRevisionOf, DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';
import { attachEastGardenCommons } from '../src/east-garden-commons-world.js';
import { attachBayouHeights, detachBayouHeights, validateHeightsRegistration } from '../src/bayou-heights-world.js';
import { buildHeightsLandscape, buildHeightsNeighborhood, HEIGHTS_PLANTING_METRES, HEIGHTS_TREE_METRES } from '../src/bayou-heights.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';
import { chessSeat, plazaSalonSeats } from '../src/plaza-salon-plan.js';
import { validateWorldManifest, locationWorldBounds } from '../src/world-manifest.js';
import { HEIGHTS_RECIPES, HEIGHTS_REVISION, HEIGHTS_TABLE, inBayouHeights } from '../../shared/bayou-heights.js';
import { assembleNeighborhood, walkableConnectivity } from '../../shared/city-kit/assemble.js';
import { KIT_CONVENTIONS } from '../../shared/city-kit/catalog.js';
import { buildCityKit, cullPlanting } from '../src/city-kit/render.js';
import { buildEastGardenCommons } from '../src/east-garden-commons.js';
import { heightsCommonsLayout } from '../src/heights-stream.js';
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
  // Studewood (heights-studewood-1) later authored the rest of the east reserve, unchanged in bounds.
  const location = byId('bayou-heights'), reserve = byId('studewood');
  assert.equal(location.status, 'authored'); assert.equal(reserve.status, 'authored');
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

test('walking, flight and sight in the District answer as on the Commons and never read a Heights solid', () => {
  // Heights adds hundreds of solids east of the bayou; queries in the District must not scan them.
  let reads = 0;
  const counted = layout.solids.map((solid, i) => i < heights.solidStart ? solid : Object.defineProperty({ ...solid }, 'rect', { get() { reads++; return solid.rect; } }));
  const environment = createWalkingEnvironment({ ...world, eastGardenCommons: { ...layout, solids: counted } });
  const before = createWalkingEnvironment(commons), [west, south, , north] = world.bounds_m;
  reads = 0;
  let sampled = 0;
  for (let x = west + .5; x < layout.edge; x += 1.7) for (let n = south + .5; n < north; n += 1.7) {
    assert.equal(environment.isFree(x, -n), before.isFree(x, -n), `walking at ${x}, ${n}`);
    for (const altitude of [2, 12, 40]) assert.equal(environment.canFly(x, altitude, -n), before.canFly(x, altitude, -n), `flying at ${x}, ${n}, ${altitude} m`);
    if (sampled++ % 23 === 0) assert.equal(environment.hasSightLine([x, n, 1.3], [x + 6, n + 4, 1.3]), before.hasSightLine([x, n, 1.3], [x + 6, n + 4, 1.3]));
  }
  assert.ok(sampled > 20000);
  assert.equal(reads, 0, 'no District query reads a Heights solid');
  assert.equal(environment.canFly(...(([x, n]) => [x, layout.ground + 1, -n])(frame([205, 121]))), false, 'the bandstand still blocks flight');
  assert.ok(reads > 0);
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

test('each neighborhood and the shared landscape stay within the kit budgets and dispose what they own', () => {
  const { drawCallsPerNeighborhood, materialsPerNeighborhood, trianglesPerNeighborhood, solidsPerNeighborhood } = KIT_CONVENTIONS.budgets;
  const parts = [...heights.plans.map(plan => buildHeightsNeighborhood(layout, plan)), buildHeightsLandscape(layout)];
  for (const [index, plan] of heights.plans.entries()) {
    const kit = parts[index], stats = kit.userData.stats();
    assert.equal(kit.name, `bayou-heights/${plan.id}`);
    // The kit budgets an assembled plan's materials, triangles and solids, and a drawn plan's
    // meshes (city-kit.test.js, scripts/destination.mjs).
    assert.ok(plan.stats.materials <= materialsPerNeighborhood && plan.stats.triangles <= trianglesPerNeighborhood
      && plan.stats.solids <= solidsPerNeighborhood, `${plan.id}: ${JSON.stringify(plan.stats)}`);
    assert.ok(stats.meshes <= drawCallsPerNeighborhood, `${plan.id}: ${JSON.stringify(stats)}`);
    assert.equal(kit.getObjectByName(`${plan.id} trees`).children.length, 0, `${plan.id} leaves its trees to the shared landscape`);
  }
  const landscape = parts.at(-1), landmarks = landscape.getObjectByName('bayou-heights/landmarks');
  for (const name of ['footbridge-deck', 'bayou-under-bridge', 'bandstand-roof', 'hall-tower', 'hall-clock-10']) assert.ok(landmarks.userData.parts.includes(`bayou-heights/${name}`), name);
  // The landmarks always draw, so they merge: one mesh per material, plus the clock faces that cast no shadow.
  assert.ok(landmarks.children.length <= 10, `${landmarks.children.length} landmark meshes`);
  assert.equal(new Set(landmarks.children.map(mesh => mesh.material)).size, landmarks.children.length - 1);
  // Every neighborhood's street trees and planted beds draw once, in the shared landscape.
  const kits = heights.plans.map(plan => buildCityKit(plan, { groundAt: () => layout.ground, ground: layout.ground }));
  assert.equal(landscape.getObjectByName('bayou-heights trees').userData.placements, kits.reduce((n, kit, i) => n + kit.getObjectByName(`${heights.plans[i].id} trees`).userData.placements, 0));
  assert.equal(landscape.userData.plantingModules, kits.reduce((n, kit) => n + kit.userData.plantingModules, 0));
  for (const kit of kits) kit.userData.dispose();
  assert.equal(parts.some(part => part.getObjectByName('East Garden Commons')), false, 'the Commons streams as its own location');
  const materials = new Set();
  for (const part of parts) part.traverse(mesh => { if (mesh.isMesh) materials.add(mesh.material); });
  let disposedMaterials = 0;
  for (const material of materials) material.addEventListener('dispose', () => disposedMaterials++);
  for (const part of parts) { part.userData.dispose(); part.userData.dispose(); assert.equal(part.children.length, 0); }
  assert.equal(disposedMaterials, materials.size);
});

test('Heights street trees, planting and their shadows draw only near the camera, with their neighborhood, after they load', () => {
  // Node builds headless, so stand-in batches arrive the way loaded ones do: children of
  // the shared tree group, the shadow proxies also in its live list, and planting batches.
  const landscape = buildHeightsLandscape(layout), trees = landscape.getObjectByName('bayou-heights trees'), planting = landscape.getObjectByName('bayou-heights planting');
  const [bridgeX, bridgeN] = frame([133, 0]), camera = new THREE.Vector3(bridgeX, layout.ground + 1.7, -bridgeN);
  const batch = (parent, east, north, proxy, radius = 8) => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(east, layout.ground + 6, -north), radius); mesh.visible = !proxy;
    parent.add(mesh); if (proxy) trees.userData.shadowProxies.push(mesh);
    return mesh;
  };
  const greenway = new Set(['bayou-greenway']), both = new Set(['bayou-greenway', 'yale-street-north']);
  landscape.userData.update(camera, greenway);
  assert.deepEqual(landscape.userData.shadowProxies, [], 'nothing casts tree shadows before the trees load');
  const near = batch(trees, ...frame([155, 10]), false), far = batch(trees, ...frame([240, 160]), false);
  const nearShadow = batch(trees, ...frame([155, 10]), true), farShadow = batch(trees, ...frame([240, 160]), true);
  const yale = batch(trees, ...frame([260, 100]), false);
  landscape.userData.update(camera, greenway);
  assert.equal(near.visible, true, 'a batch beside the footbridge draws');
  assert.equal(far.visible, false, `a batch more than ${HEIGHTS_TREE_METRES} m away does not draw`);
  assert.deepEqual(landscape.userData.shadowProxies, [nearShadow], 'near Heights trees cast shadows');
  assert.equal(farShadow.visible, false);
  landscape.userData.update(camera, greenway);
  assert.deepEqual(landscape.userData.shadowProxies, [nearShadow], 'each update replaces the list rather than growing it');
  const [laneX, laneN] = frame([235, 120]), lane = new THREE.Vector3(laneX, layout.ground + 1.7, -laneN);
  near.visible = far.visible = yale.visible = true; landscape.userData.update(lane, greenway);
  assert.equal(near.visible, false, 'walking away hides the batch by the bridge');
  assert.equal(far.visible, true, 'and draws the one now near');
  assert.equal(yale.visible, false, 'a near batch draws only while its neighborhood is attached');
  assert.deepEqual(landscape.userData.shadowProxies, [farShadow]);
  yale.visible = true; landscape.userData.update(lane, both);
  assert.equal(yale.visible, true);
  const bed = batch(planting, ...frame([240, 150]), false), stems = batch(planting, ...frame([270, 20]), false, 160);
  const farBed = batch(planting, ...frame([235, 30]), false), farTrees = batch(trees, ...frame([235, 30]), false);
  landscape.userData.update(lane, both);
  assert.equal(bed.visible, true, 'a planted bed draws near the camera');
  assert.equal(farTrees.visible, true, `trees draw to ${HEIGHTS_TREE_METRES} m`);
  assert.equal(farBed.visible, false, `planting only to ${HEIGHTS_PLANTING_METRES} m`);
  landscape.userData.update(camera, both);
  assert.equal(bed.visible, false, 'and not from the footbridge');
  landscape.userData.update(lane, new Set());
  assert.equal(bed.visible, false, 'nor once its neighborhood is gone');
  assert.equal(stems.visible, true, 'the fine flower stems span Heights and draw with the planting');
  landscape.userData.dispose();
});

test('the Commons as Heights presents it draws its planted beds within 60 m, as Heights does; the Commons revision at every distance', () => {
  const kitOf = scene => scene.children.find(child => child.name.startsWith('City kit:'));
  const presented = buildEastGardenCommons(heightsCommonsLayout(layout)), restored = buildEastGardenCommons(commons.eastGardenCommons);
  assert.equal(kitOf(presented).userData.plantingMetres, HEIGHTS_PLANTING_METRES);
  assert.equal(kitOf(restored).userData.plantingMetres, Infinity, 'the Commons revision is unchanged');
  presented.userData.dispose(); restored.userData.dispose();
  // Node builds headless, without planting, so stand-in batches take the planting's shape:
  // twelve- and twenty-four-metre beds, and grass stems spanning the plan.
  const planting = new THREE.Group(), [east, north] = frame([80, 0]), eye = new THREE.Vector3(east, layout.ground + 1.7, -north);
  const batch = (x, radius = 8) => { const [e, n] = frame([x, 0]), mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(e, layout.ground, -n), radius); planting.add(mesh); return mesh; };
  const near = batch(130), far = batch(160), stems = batch(60, 160);
  cullPlanting(planting, eye, HEIGHTS_PLANTING_METRES);
  assert.deepEqual([near.visible, far.visible, stems.visible], [true, false, true]);
  cullPlanting(planting, eye, Infinity);
  assert.equal(far.visible, true, 'without a limit every bed draws');
  cullPlanting(planting, eye, Infinity, mesh => mesh !== near);
  assert.equal(near.visible, false, 'and the caller can withhold a bed');
});
