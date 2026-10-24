import test from 'node:test';
import assert from 'node:assert/strict';
import { stopHeldMovement } from '../src/held-movement.js';
import { createFlightState, stepFlight } from '../src/flight.js';

const environment = { groundAt: () => 0, isFree: () => true, canFly: () => true };
const walker = () => ({ position: [0, 1.68, 0], velocity: [0, 0], acceleration: [0, 0], speed: 0, distance: 0, yaw: 0 });
test('release removes residual held lift and horizontal drift, including early takeoff', () => {
  for (const altitude of [0, 4]) {
    const state = walker(), flight = { ...createFlightState(), active: true, altitude, target: altitude + 3.5 };
    for (let i = 0; i < 10; i++) stepFlight(state, environment, flight, { lift: 1, forward: 1 }, 1 / 60);
    stopHeldMovement(state, flight);
    const position = [...state.position];
    for (let i = 0; i < 20; i++) stepFlight(state, environment, flight, {}, 1 / 60);
    assert.deepEqual(state.position, position);
    for (let i = 0; i < 10; i++) stepFlight(state, environment, flight, { lift: 1 }, 1 / 60);
    assert.ok(state.position[1] > position[1], 'a new deliberate lift works');
  }
});
test('release preserves a deliberately requested landing', () => {
  const state = walker(), flight = { ...createFlightState(), active: true, altitude: 4, target: 0, landing: true };
  stopHeldMovement(state, flight);
  for (let i = 0; i < 500 && flight.active; i++) stepFlight(state, environment, flight, {}, 1 / 60);
  assert.equal(flight.active, false); assert.equal(state.position[1], 1.68);
});
