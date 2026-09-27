import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storefrontSpot } from '../src/arrival.js';
import { clearOfRoads, isWalkway, laneFixtures } from '../src/street-furniture.js';
import { createWalkingEnvironment } from '../src/walking.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
world.vegetation = JSON.parse(readFileSync(new URL('../public/data/district-vegetation.json', import.meta.url)));
const environment = createWalkingEnvironment(world);

test('mapped walkways are paths for people, not lanes for cars', () => {
  const walks = world.roads.filter(isWalkway);
  assert.ok(walks.length >= 10, 'the district has its footways');
  assert.ok(walks.every(road => ['footway', 'pedestrian', 'path', 'steps'].includes(road.kind)));
  assert.ok(world.roads.some(road => road.kind === 'service' && !isWalkway(road)));
});

for (const mode of ['arrive', 'leave']) test(`every storefront ${mode === 'arrive' ? 'arrival' : 'exit'} lands on walkable pavement near the door`, () => {
  for (const store of world.stores) {
    const [x, north] = storefrontSpot(world, store, mode, { isFree: environment.isFree });
    assert.ok(clearOfRoads(world, x, -north, 0, { vehiclesOnly: true }), `${store.name}: not in a vehicle lane`);
    assert.ok(environment.isFree(x, -north), `${store.name}: free to stand on`);
    assert.ok(Math.hypot(x - store.facade[0], north - store.facade[1]) <= 10, `${store.name}: near the door`);
  }
});

test('fixtures still keep off walkways, while people may stand on them', () => {
  const walk = world.roads.find(isWalkway), [px, py] = walk.points[0];
  assert.equal(clearOfRoads(world, px, -py, 0), false, 'a walkway centreline is not a fixture spot');
  assert.equal(clearOfRoads(world, px, -py, 0, { vehiclesOnly: true }) || world.roads.some(road => !isWalkway(road)), true);
  for (const [x, , z] of laneFixtures(world).lamps) assert.ok(clearOfRoads(world, x, z), 'lamp on a road or walkway');
});
