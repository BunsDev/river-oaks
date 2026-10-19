import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planStoreRooms } from '../src/store-rooms.js';
import { createWalkingEnvironment, createWalkingState, stepWalking, steerWalkingToward } from '../src/walking.js';
import { isVenueRoom } from '../src/venue-rooms.js';
import { IPIC_AUDITORIUM_ROWS, ipicSeatForward } from '../src/ipic-plan.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(world);
const room = environment.rooms.find(r => r.name === 'IPIC Theaters');
const at = (a, d) => { const [x, n] = room.toWorld(a, d); return [x, -n]; };

test('IPIC has a continuous two-flight route to its upper lounge and auditorium', () => {
  assert.equal(room.interior, 'ipic-photo-v1');
  assert.equal(room.depth, 34);
  assert.equal(environment.groundAt(...at(0, 2)), room.floor);
  assert.equal(environment.groundAt(...at(-1.4, 13)), room.floor + 3);
  assert.equal(environment.groundAt(...at(-1.4, 23)), room.floor + 6);
  for (let d = 5.9; d < 20.1; d += .05) {
    for (const a of [-1.4, 1.4]) assert.ok(environment.isFree(...at(a, d)), `route blocked at ${a},${d}`);
    assert.ok(Math.abs(environment.groundAt(...at(-1.4, d + .05)) - environment.groundAt(...at(-1.4, d))) < .03);
  }
  assert.equal(environment.isFree(...at(0, 9)), false, 'escalator centre balustrade blocks bodies');
  assert.equal(environment.isFree(...at(4, 9)), false, 'cannot walk through escalator side walls');
});

test('railings, furniture arms and planters block bodies while cushion centers stay usable', () => {
  // [-6.85, 28.54] is the back row's west recliner's east arm (the recliners face the north screen).
  for (const [a, d] of [[.6, 9], [2.28, 9], [-.6, 17], [-2.28, 17], [-6.85, 28.54], [-5.35, 20.6], [-2.85, 20.6], [-5.6, 25.4], [1, 25.4], [-4.8, 1.6], [5.7, 1.6]]) {
    assert.equal(environment.isFree(...at(a, d)), false, `solid prop is walkable at ${a},${d}`);
  }
  for (const seat of room.ipicSeats) assert.ok(environment.isFree(...at(seat.a, seat.d)), `seat ${seat.key}:${seat.slot} is blocked`);
});

// Val, 2026-10-15: recliner bases and footrests collide as drawn (ipic-interior.js recliner()), so a
// walker no longer passes through them; each sitter stands into the legroom in front of the footrest.
// Offsets run along the way each recliner faces (the north screen since 2026-10-19).
test('recliner bases and footrests block bodies, and each recliner names a free stand spot', () => {
  for (const seat of room.ipicSeats.filter(s => s.key.startsWith('recliner'))) {
    const f = ipicSeatForward(seat), along = k => [seat.a + f[0] * k, seat.d + f[1] * k];
    assert.equal(environment.isFree(...at(...along(1.15))), false, `walkable just past ${seat.key}'s footrest`);
    assert.equal(environment.isFree(...at(...along(-.95))), false, `walkable just behind ${seat.key}'s base`);
    assert.ok(Array.isArray(seat.stand), `${seat.key} names no stand spot`);
    const ahead = (seat.stand[0] - seat.a) * f[0] + (seat.stand[1] - seat.d) * f[1];
    assert.ok(ahead > 1.1 && environment.isFree(...at(...seat.stand)), `${seat.key} stand spot ${seat.stand}`);
  }
});

test('walking reaches upper floor and returns to street without a teleport or floor snap', () => {
  const state = createWalkingState(environment, room.toWorld(0, 1));
  // Into the auditorium, down its west aisle ramps to the front of the house and back, then out.
  const visit = [[-1.4, 4.8], [-1.4, 20.7], [-1.4, 24.5], [-4.85, 24.5], [-4.85, 31.5], [-4.7, 26.7], [-14.5, 26.7], [-4.7, 26.7],
    [-4.85, 24.5], [-1.4, 24.5], [-1.4, 20.7], [-1.4, 4.8], [0, 1], [0, -1.8]];
  let top = state.position[1], bottomOfHouse = Infinity;
  for (const waypoint of visit) {
    const target = room.toWorld(...waypoint);
    let steps = 0;
    while (Math.hypot(state.position[0] - target[0], -state.position[2] - target[1]) > .15 && steps++ < 5000) {
      const old = state.position[1];
      stepWalking(state, environment, steerWalkingToward(state, target, 1 / 60), 1 / 60);
      assert.ok(Math.abs(state.position[1] - old) < .04, 'support height stays continuous');
      top = Math.max(top, state.position[1]);
      if (room.toLocal(state.position[0], -state.position[2])[1] > 26) bottomOfHouse = Math.min(bottomOfHouse, state.position[1]);
    }
    assert.ok(steps < 5000, `could not reach ${waypoint}`);
  }
  assert.ok(top > room.floor + 7.6);
  assert.ok(Math.abs(bottomOfHouse - (room.floor + 6 + IPIC_AUDITORIUM_ROWS.at(-1).floor + 1.68)) < .01, 'walked down to the front row\'s floor');
  assert.equal(environment.roomAt(state.position[0], state.position[2]), null);
});

test('IPIC specialization leaves other tenant footprints and generic cinemas alone', () => {
  const generic = structuredClone(world);
  generic.stores.find(s => s.id === room.storeId).name = 'Other Cinema';
  const previous = planStoreRooms(generic);
  for (const next of environment.rooms.filter(r => r.storeId !== room.storeId && !isVenueRoom(r))) {
    assert.deepEqual(next.footprint, previous.find(r => r.storeId === next.storeId).footprint, next.name);
  }
  assert.equal(previous.find(r => r.storeId === room.storeId).depth, 9);
});
