import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planStoreRooms } from '../src/store-rooms.js';
import { createWalkingEnvironment, createWalkingState, stepWalking, steerWalkingToward } from '../src/walking.js';

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
  for (const [a, d] of [[.6, 9], [2.28, 9], [-.6, 17], [-2.28, 17], [-2.06, 28], [-4.26, 24.8], [-5.6, 25.4], [1, 25.4], [-4.8, 1.6], [5.7, 1.6]]) {
    assert.equal(environment.isFree(...at(a, d)), false, `solid prop is walkable at ${a},${d}`);
  }
  for (const seat of room.ipicSeats) assert.ok(environment.isFree(...at(seat.a, seat.d)), `seat ${seat.key}:${seat.slot} is blocked`);
});

test('walking reaches upper floor and returns to street without a teleport or floor snap', () => {
  const state = createWalkingState(environment, room.toWorld(0, 1));
  const visit = [[-1.4, 4.8], [-1.4, 20.7], [-5.55, 20.7], [-5.55, 24.7], [-4.85, 24.7], [-4.85, 31.5], [-4.85, 24.7], [-5.55, 24.7], [-5.55, 20.7], [-1.4, 20.7], [-1.4, 4.8], [0, 1], [0, -1.8]];
  let top = state.position[1];
  for (const waypoint of visit) {
    const target = room.toWorld(...waypoint);
    let steps = 0;
    while (Math.hypot(state.position[0] - target[0], -state.position[2] - target[1]) > .15 && steps++ < 5000) {
      const old = state.position[1];
      stepWalking(state, environment, steerWalkingToward(state, target, 1 / 60), 1 / 60);
      assert.ok(Math.abs(state.position[1] - old) < .04, 'support height stays continuous');
      top = Math.max(top, state.position[1]);
    }
    assert.ok(steps < 5000, `could not reach ${waypoint}`);
  }
  assert.ok(top > room.floor + 7.6);
  assert.equal(environment.roomAt(state.position[0], state.position[2]), null);
});

test('IPIC specialization leaves other tenant footprints and generic cinemas alone', () => {
  const generic = structuredClone(world);
  generic.stores.find(s => s.id === room.storeId).name = 'Other Cinema';
  const previous = planStoreRooms(generic);
  for (const next of environment.rooms.filter(r => r.storeId !== room.storeId)) {
    assert.deepEqual(next.footprint, previous.find(r => r.storeId === next.storeId).footprint, next.name);
  }
  assert.equal(previous.find(r => r.storeId === room.storeId).depth, 9);
});
