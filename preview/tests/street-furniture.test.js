import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hedgeClusters, kerbStrips, laneFixtures, treePits, LANE_WIDTH_MIN } from '../src/street-furniture.js';
import { upperWindowLevels } from '../src/district.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { localToScene } from '../src/geometry.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const vegetation = JSON.parse(readFileSync(new URL('../public/data/district-vegetation.json', import.meta.url)));

const distanceToLane = (road, x, z) => Math.min(...road.points.slice(1).map((point, i) => {
  const a = localToScene(road.points[i]), b = localToScene(point);
  const dx = b[0] - a[0], dz = b[2] - a[2], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz);
}));

test('kerbs line every vehicular lane and stop short of the lanes that join it', () => {
  const strips = kerbStrips(world), lanes = world.roads.filter(road => road.width_m >= LANE_WIDTH_MIN);
  assert.ok(strips.length > lanes.length * 2, 'each lane needs kerbs on both sides');
  for (const [x, , z] of strips) {
    // Bends pull a strip's midpoint slightly inside its own lane; it never drifts outward.
    const owners = lanes.filter(road => distanceToLane(road, x, z) <= road.width_m / 2 + 0.17);
    assert.ok(owners.length >= 1, 'every kerb sits at its lane edge');
    for (const road of lanes) if (!owners.includes(road)) assert.ok(distanceToLane(road, x, z) >= road.width_m / 2 + 0.4, 'a kerb must not cross another lane');
  }
  assert.ok(strips.every(([, y]) => Number.isFinite(y)));
});

test('lane fixtures follow the mapped lanes, keep out of footprints and avoid narrow walkways', () => {
  const environment = createWalkingEnvironment(world);
  const { lamps, planters, bins } = laneFixtures(world, environment.isFree);
  assert.ok(lamps.length > 10 && planters.length > 3 && bins.length > 0);
  for (const [x, , z] of [...lamps, ...planters, ...bins]) {
    assert.ok(environment.isFree(x, z), 'fixtures never intersect a building');
    const nearest = Math.min(...world.roads.filter(road => road.width_m >= LANE_WIDTH_MIN).map(road => distanceToLane(road, x, z)));
    assert.ok(nearest >= 6.5 / 2 + 0.7 - 0.01 && nearest <= 6.5 / 2 + 1.0 + 0.05, `fixture sits beside a lane, not ${nearest.toFixed(2)} m away`);
  }
  const blocked = laneFixtures(world, () => false);
  assert.deepEqual([blocked.lamps.length, blocked.planters.length, blocked.bins.length], [0, 0, 0]);
});

test('tree pits cover mapped trees and scanned trunks with bounded radii', () => {
  const pits = treePits({ ...world, vegetation });
  assert.equal(pits.length, world.trees.length + vegetation.branch_supports.length);
  assert.ok(pits.every(([, , , radius]) => radius >= 0.65 && radius <= 1.4));
  assert.equal(treePits({ ...world, vegetation: undefined }).length, world.trees.length);
});

test('hedge lobes fill their planter deterministically', () => {
  const lobes = hedgeClusters(1.42, 0.56, 0.5);
  assert.deepEqual(lobes, hedgeClusters(1.42, 0.56, 0.5));
  assert.ok(lobes.length >= 8);
  for (const [dx, dy, dz, scale] of lobes) {
    assert.ok(Math.abs(dx) <= 0.71 && Math.abs(dz) <= 0.28 && Math.abs(dy) < 0.5);
    assert.ok(scale.every(value => value > 0 && value < 1.2));
  }
  assert.notDeepEqual(hedgeClusters(1.42, 0.56, 0.5, 3), lobes, 'different seeds vary the clipping');
});

test('upper window rows fit under each mapped parapet and never float above a two-storey mass', () => {
  assert.deepEqual(upperWindowLevels(6.5), []);
  assert.deepEqual(upperWindowLevels(8), [6.85]);
  assert.equal(upperWindowLevels(12).length, 2);
  assert.equal(upperWindowLevels(20).length, 4);
  for (const building of world.buildings) for (const level of upperWindowLevels(building.size[2])) {
    assert.ok(level + 0.8 < building.size[2] - 0.3, `${building.id}: a window row would break its cornice`);
    assert.ok(level - 0.8 > 5.15, `${building.id}: a window row would overlap the shopfront fascia`);
  }
});

test('no lamp, planter, bin or storefront bench stands on any drawn road', async () => {
  const { clearOfRoads, distanceToRoad, laneFixtures } = await import('../src/street-furniture.js');
  const { storefrontBenchSpots } = await import('../src/district.js');
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  // Service lanes narrower than a traffic lane are asphalt too.
  assert.ok(world.roads.some(road => road.width_m < 5));
  const onAsphalt = (x, z) => world.roads.some(road => distanceToRoad(road, x, z) < road.width_m / 2);
  const fixtures = laneFixtures(world);
  for (const kind of ['lamps', 'planters', 'bins']) {
    assert.ok(fixtures[kind].length > 0, kind);
    for (const [x, , z] of fixtures[kind]) assert.ok(!onAsphalt(x, z) && clearOfRoads(world, x, z), `${kind} at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
  const benches = storefrontBenchSpots(world);
  assert.ok(benches.length >= 3, 'storefronts with pavement keep their bench');
  for (const { x, north, outward: [nx, ny], storeId } of benches) {
    assert.ok(clearOfRoads(world, x, -north, 1.2), `bench at ${storeId}`);
    assert.ok(clearOfRoads(world, x + nx * 1.2, -(north + ny * 1.2), 0.9), `lamp column at ${storeId}`);
  }
});
