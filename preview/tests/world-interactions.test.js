import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWalkingEnvironment } from '../src/walking.js';
import { storefrontBenchSpots } from '../src/street-fixtures.js';
import { laneFixtures } from '../src/street-furniture.js';
import { SIT_REACH, WATER_REACH, benchSeats, boutiquePlanters, buildPlanters, buildSeats, headingTo, lanePlanters, nearestPlanter, nearestSeat } from '../src/world-interactions.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
world.vegetation = JSON.parse(readFileSync(new URL('../public/data/district-vegetation.json', import.meta.url)));
const environment = createWalkingEnvironment(world);
const streetSpace = (x, z) => environment.isFree(x, z) && !environment.roomAt(x, z);
const forward = heading => [Math.sin(heading), -Math.cos(heading)];

test('every storefront bench offers two places, side by side, facing the street', () => {
  const spots = storefrontBenchSpots(world), seats = benchSeats(world);
  assert.ok(spots.length > 3);
  assert.equal(seats.length, spots.length * 2);
  for (const spot of spots) {
    const places = seats.filter(seat => seat.storeId === spot.storeId);
    assert.deepEqual(places.map(seat => seat.id), [`bench:${spot.storeId}:0`, `bench:${spot.storeId}:1`]);
    assert.ok(Math.abs(Math.hypot(places[0].x - places[1].x, places[0].north - places[1].north) - 0.9) < 1e-9, 'places 0.9 m apart');
    for (const seat of places) {
      const [fx, fn] = forward(seat.heading);
      assert.ok(Math.abs(fx - spot.outward[0]) < 1e-9 && Math.abs(fn - spot.outward[1]) < 1e-9, 'faces outward');
      assert.equal(seat.height, 0.53);
      assert.ok(Math.hypot(seat.x - spot.x, seat.north - spot.north) < 0.5, 'on the bench');
      const ahead = (seat.approach[0] - seat.x) * fx + (seat.approach[1] - seat.north) * fn;
      assert.ok(Math.abs(ahead - 0.75) < 1e-9, 'stand up in front of the bench');
    }
  }
  assert.deepEqual(benchSeats(world), seats, 'stable across calls and processes');
});

test("Jevica's garden seats hold two and her lounge chairs one, facing away from the backrest", () => {
  const builds = [
    { id: 'build-1', kind: 'seat', position: [10, 20], yaw: 0 },
    { id: 'build-2', kind: 'armchair', position: [30, 40], yaw: Math.PI / 2 },
    { id: 'build-3', kind: 'planter', position: [50, 60], yaw: 0 },
    { id: 'build-4', kind: 'lamp', position: [0, 0], yaw: 0 },
  ];
  const seats = buildSeats(builds);
  assert.deepEqual(seats.map(seat => seat.id), ['build:build-1:0', 'build:build-1:1', 'build:build-2:0']);
  // A build faces its local +Z, which is south (-north) at yaw 0 and east at yaw pi/2.
  assert.deepEqual(forward(seats[0].heading).map(value => Math.round(value * 1e9) / 1e9 + 0), [0, -1]);
  assert.deepEqual(forward(seats[2].heading).map(value => Math.round(value * 1e9) / 1e9 + 0), [1, 0]);
  assert.equal(seats[0].height, 0.71); assert.equal(seats[2].height, 0.6);
  assert.ok(Math.abs(seats[0].x - seats[1].x - -0.7) < 1e-9 || Math.abs(seats[1].x - seats[0].x - -0.7) < 1e-9, 'garden seat places side by side');
  assert.deepEqual(buildPlanters(builds), [{ id: 'planter:build-3', kind: 'build', buildId: 'build-3', x: 50, north: 60 }]);
  assert.deepEqual(buildSeats([null, { kind: 'seat' }]), [], 'malformed builds are ignored');
});

test('planters: two by each boutique door, and every street planter, with stable IDs', () => {
  const boutique = boutiquePlanters(world);
  const skipped = world.stores.filter(store => ['restaurant', 'ice_cream'].includes(store.category) || store.name === 'Le Colonial');
  assert.equal(boutique.length, (world.stores.length - skipped.length) * 2);
  assert.ok(boutique.every(planter => !skipped.some(store => planter.id.startsWith(`planter:${store.id}:`))), 'dining doors have none');
  const lane = lanePlanters(world, streetSpace), drawn = laneFixtures(world, streetSpace).planters;
  assert.equal(lane.length, drawn.length, 'one per drawn street planter');
  assert.equal(new Set(lane.map(planter => planter.id)).size, lane.length);
  assert.deepEqual(lanePlanters(world, streetSpace), lane);
});

test('the nearest free seat in reach, and the nearest planter in reach', () => {
  const seats = [{ id: 'a', x: 0, north: 0 }, { id: 'b', x: 1, north: 0 }, { id: 'far', x: 10, north: 0 }];
  assert.equal(nearestSeat(seats, [0.2, 0]).id, 'a');
  assert.equal(nearestSeat(seats, [0.2, 0], { taken: new Set(['a']) }).id, 'b', 'a held seat is skipped');
  assert.equal(nearestSeat(seats, [0.2, 0], { taken: new Set(['a', 'b']) }), null);
  assert.equal(nearestSeat(seats, [5, 0]), null, `nothing beyond ${SIT_REACH} m`);
  const planters = [{ id: 'p', x: 0, north: 0 }, { id: 'q', x: 2, north: 0 }];
  assert.equal(nearestPlanter(planters, [1.4, 0]).id, 'q');
  assert.equal(nearestPlanter(planters, [0, WATER_REACH + 0.01]), null);
});

test('headings follow the resident and avatar convention', () => {
  assert.equal(headingTo([0, 0], [0, -1]), 0, 'south is heading 0 (three.js +Z)');
  assert.ok(Math.abs(headingTo([0, 0], [1, 0]) - Math.PI / 2) < 1e-12, 'east');
});
