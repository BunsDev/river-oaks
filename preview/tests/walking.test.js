import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';

const world = { bounds_m: [-50, -50, 50, 50], buildings: [{ center: [0, 0, 0], size: [10, 10, 8], yaw_deg: 0 }] };
test('walking stays on the ground and cannot cross a storefront wall', () => {
  const environment = createWalkingEnvironment(world);
  const state = createWalkingState(environment, [0, -8, 0]);
  for (let i = 0; i < 600; i++) stepWalking(state, environment, { forward: 1, fast: true }, 1 / 60);
  assert.ok(state.position[2] >= 5.35);
  assert.equal(state.position[1], 1.68);
});
test('walking can slide along walls, remains bounded, and ignores nonfinite time', () => {
  const environment = createWalkingEnvironment(world);
  const state = createWalkingState(environment, [0, -8, 0]);
  for (let i = 0; i < 600; i++) stepWalking(state, environment, { forward: 1, strafe: 1 }, 1 / 60);
  assert.ok(state.position[0] > 10);
  assert.ok(state.position[2] < 5);
  const old = [...state.position];
  stepWalking(state, environment, { forward: 1 }, NaN);
  assert.deepEqual(state.position, old);
  for (let i = 0; i < 6000; i++) stepWalking(state, environment, { strafe: 1, fast: true }, 0.08);
  assert.ok(state.position[0] <= 49.65);
});
test('rotated buildings and explicit footprint polygons block movement', () => {
  const environment = createWalkingEnvironment({ ...world, buildings: [], collisionPolygons: [[[-5, -5], [5, -5], [5, 5], [-5, 5]]] });
  const state = createWalkingState(environment, [0, -8, 0]);
  for (let i = 0; i < 600; i++) stepWalking(state, environment, { forward: 1 }, 1 / 60);
  assert.ok(state.position[2] >= 5.35);
  const rotated = createWalkingEnvironment({ ...world, buildings: [{ ...world.buildings[0], yaw_deg: 45 }] });
  assert.equal(rotated.isFree(0, 6), false);
  assert.equal(rotated.isFree(6, 6), true);
});
test('spawn inside a building is relocated to nearby accessible ground', () => {
  const environment = createWalkingEnvironment(world);
  const state = createWalkingState(environment, [0, 0, 0]);
  assert.equal(environment.isFree(state.position[0], state.position[2]), true);
});
test('speed is stable across refresh rates and diagonal input is normalized', () => {
  const environment = createWalkingEnvironment({ ...world, buildings: [] });
  const run = (fps, input) => {
    const state = createWalkingState(environment, [0, 0, 0]);
    for (let i = 0; i < fps * 5; i++) stepWalking(state, environment, input, 1 / fps);
    return Math.hypot(state.position[0], state.position[2]);
  };
  assert.ok(Math.abs(run(30, { forward: 1 }) - run(120, { forward: 1 })) < 0.02);
  assert.ok(Math.abs(run(60, { forward: 1 }) - run(60, { forward: 1, strafe: 1 })) < 0.001);
});
