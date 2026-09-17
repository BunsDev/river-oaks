import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightEnvironment, createFlightState, stepFlight, setFlightMode } from '../src/flight.js';
import * as flight from '../src/flight.js';

const world = {
  bounds_m: [-1000, -800, 1000, 800],
  buildings: [{ center: [0, 0, 5], size: [20, 20, 18] }],
  terrain: { grid_origin_m: [-1000, -800], spacing_m: [2000, 1600], width: 2, height: 2, heights_m: [5, 15, 25, 35] },
};

const flatWorld = (buildings = [], roads = []) => ({ bounds_m: [-200, -200, 200, 200], buildings, roads });
const rideAt = (environment, position, yaw = 0, speed = 0) => ({ ...createFlightState(environment, true), position, yaw, speed, driveSpeed: speed, velocity: [-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed] });
const advance = (state, environment, seconds, input = {}, frequency = 60) => {
  for (let index = 0; index < seconds * frequency; index++) stepFlight(state, environment, input, 1 / frequency);
};

test('manual descent reaches street eye height beside a tall building', () => {
  const environment = createFlightEnvironment(flatWorld([{ center: [0, 0, 0], size: [20, 20, 90], yaw_deg: 0 }]));
  const state = rideAt(environment, [30, 40, 0]);
  advance(state, environment, 8, { lift: -1 });
  assert.ok(Math.abs(state.position[1] - 2.5) < 0.05, `eye height ${state.position[1]}`);
  assert.deepEqual([state.position[0], state.position[2]], [30, 0]);
});

test('rotated footprints block a low rider without lifting them onto the roof', () => {
  const environment = createFlightEnvironment(flatWorld([{ center: [0, 0, 0], size: [30, 4, 20], yaw_deg: 45 }]));
  const state = rideAt(environment, [-30, 2.5, 0], -Math.PI / 2);
  advance(state, environment, 5, { throttle: 1 });
  assert.ok(state.position[0] < -3, `crossed the diagonal wall: ${state.position[0]}`);
  assert.ok(state.position[0] > -10, 'collision should use the rotated footprint, not its bounding box');
  assert.ok(state.position[1] < 3, 'wall impact must not teleport the rider onto a roof');
});

test('a boosted frame cannot tunnel across a thin building', () => {
  const environment = createFlightEnvironment(flatWorld([{ center: [0, 0, 0], size: [0.05, 30, 20], yaw_deg: 0 }]));
  const state = rideAt(environment, [-2, 2.5, 0], -Math.PI / 2, 54);
  stepFlight(state, environment, { throttle: 1, boost: true }, 0.08);
  assert.ok(state.position[0] < 0, 'swept collision must catch the wall between endpoints');
  assert.ok(state.position[1] < 3);
});

test('climbing clears a roof and permits flying across its footprint', () => {
  const environment = createFlightEnvironment(flatWorld([{ center: [0, 0, 0], size: [20, 20, 18], yaw_deg: 0 }]));
  const state = rideAt(environment, [-25, 2.5, 0], -Math.PI / 2);
  advance(state, environment, 3, { lift: 1 });
  assert.ok(state.position[1] > 20.5);
  advance(state, environment, 3, { throttle: 1 });
  assert.ok(state.position[0] > 10);
});

test('street assist approaches an unoccupied source road before descending', () => {
  assert.equal(typeof flight.requestStreetLevel, 'function');
  const environment = createFlightEnvironment(flatWorld(
    [{ center: [0, 0, 0], size: [20, 20, 18], yaw_deg: 0 }],
    [{ points: [[-100, -30, 0], [100, -30, 0]], width_m: 8 }],
  ));
  const state = rideAt(environment, [0, 60, 0]);
  const before = [...state.position];
  flight.requestStreetLevel(state, environment);
  assert.deepEqual(state.position, before);
  for (let index = 0; index < 1500; index++) {
    const previous = [...state.position];
    stepFlight(state, environment, {}, 1 / 60);
    assert.ok(Math.hypot(...state.position.map((value, axis) => value - previous[axis])) < 1);
    assert.ok(state.position[1] >= environment.floorAt(state.position[0], state.position[2]) - 0.001);
  }
  assert.ok(Math.abs(state.position[2] - 30) < 0.3);
  assert.ok(Math.abs(state.position[1] - 2.5) < 0.1);
  assert.equal(state.mode, 'manual');
  assert.ok(state.speed < 0.1);
});

test('street assist ignores obstructed road segments and manual input cancels it', () => {
  assert.equal(typeof flight.requestStreetLevel, 'function');
  const environment = createFlightEnvironment(flatWorld(
    [{ center: [0, 0, 0], size: [30, 30, 18], yaw_deg: 0 }],
    [{ points: [[-5, 0], [5, 0]] }, { points: [[-80, -35], [80, -35]] }],
  ));
  const state = rideAt(environment, [0, 50, 0]);
  flight.requestStreetLevel(state, environment);
  advance(state, environment, 25);
  assert.ok(Math.abs(state.position[2] - 35) < 0.3);
  flight.requestStreetLevel(state, environment);
  stepFlight(state, environment, { lift: 1 }, 1 / 60);
  assert.equal(state.mode, 'manual');
});

test('street assist works without roads and rise assist clears the local roof envelope', () => {
  assert.equal(typeof flight.requestStreetLevel, 'function');
  assert.equal(typeof flight.requestRoofLevel, 'function');
  const environment = createFlightEnvironment(flatWorld([{ center: [0, 0, 0], size: [20, 20, 18], yaw_deg: 0 }]));
  const state = rideAt(environment, [30, 50, 0]);
  flight.requestStreetLevel(state, environment);
  advance(state, environment, 15);
  assert.ok(Math.abs(state.position[1] - 2.5) < 0.1);
  const before = [...state.position];
  flight.requestRoofLevel(state, environment);
  assert.deepEqual(state.position, before);
  advance(state, environment, 10);
  assert.ok(state.position[1] > 22);
  assert.equal(state.mode, 'manual');
});

test('terrain rise stops horizontal travel instead of snapping the rider uphill', () => {
  const environment = createFlightEnvironment(flatWorld());
  environment.groundAt = (x) => x >= 0 ? 80 : 0;
  environment.floorAt = (x) => environment.groundAt(x) + 2.5;
  const state = rideAt(environment, [-2, 2.5, 0], -Math.PI / 2, 54);
  const before = [...state.position];
  stepFlight(state, environment, { boost: true, throttle: 1 }, 0.08);
  assert.ok(state.position[0] < 0);
  assert.ok(Math.hypot(...state.position.map((value, axis) => value - before[axis])) < 5);
});

test('crossing a terrain drop at high altitude does not snap to a lower flight ceiling', () => {
  const environment = createFlightEnvironment({ ...flatWorld(), terrain: { grid_origin_m: [-200, -200], spacing_m: [400, 400], width: 2, height: 2, heights_m: [80, 80, 80, 80] } });
  environment.groundAt = (x) => x >= 0 ? 0 : 80;
  const state = rideAt(environment, [-2, 450, 0], -Math.PI / 2, 54);
  const before = [...state.position];
  stepFlight(state, environment, { boost: true, throttle: 1 }, 0.08);
  assert.ok(state.position[0] > 0);
  assert.ok(Math.hypot(...state.position.map((value, axis) => value - before[axis])) < 5);
});

test('descending over a roof stops above it and resuming tour first clears surrounding houses', () => {
  const environment = createFlightEnvironment(flatWorld([{ center: [0, 0, 0], size: [20, 20, 18], yaw_deg: 30 }]));
  const roofState = rideAt(environment, [0, 45, 0]);
  advance(roofState, environment, 4, { lift: -1 });
  assert.ok(roofState.position[1] >= 20.5);
  assert.ok(roofState.position[1] < 20.51);
  const streetState = rideAt(environment, [20, 2.5, 0]);
  setFlightMode(streetState, 'tour', environment);
  advance(streetState, environment, 0.5);
  assert.ok(Math.abs(streetState.position[0] - 20) < 0.01);
  assert.ok(streetState.position[1] > 2.5 && streetState.position[1] < 12);
  advance(streetState, environment, 12);
  assert.ok(streetState.position[1] > environment.cruiseHeight);
});

test('manual acceleration, turning and climb agree at 30, 60 and 120 frames per second', () => {
  const environment = createFlightEnvironment(flatWorld());
  const simulate = (frequency) => {
    const state = rideAt(environment, [0, 25, 0]);
    advance(state, environment, 3, { throttle: 1, steer: 0.4, lift: 0.2 }, frequency);
    advance(state, environment, 1, { throttle: -1 }, frequency);
    return state;
  };
  const reference = simulate(120);
  for (const frequency of [30, 60]) {
    const state = simulate(frequency);
    assert.ok(Math.hypot(...state.position.map((value, axis) => value - reference.position[axis])) < 0.15);
    assert.ok(Math.abs(state.yaw - reference.yaw) < 0.01);
  }
});

test('autopilot stays inside the source extent and above terrain and roofs for a complete loop', () => {
  const environment = createFlightEnvironment(world);
  const state = createFlightState(environment, false);
  const origin = [...state.position];
  for (let i = 0; i < 12000; i++) {
    stepFlight(state, environment, {}, 1 / 30);
    const [x, y, z] = state.position;
    assert.ok(x >= -1000 && x <= 1000 && z >= -800 && z <= 800);
    assert.ok(y >= environment.floorAt(x, z));
    assert.ok(state.position.every(Number.isFinite));
  }
  assert.notDeepEqual(state.position, origin);
});

test('manual descent and boost cannot leave map bounds or fly through buildings', () => {
  const environment = createFlightEnvironment(world);
  const state = createFlightState(environment, true);
  for (let i = 0; i < 4000; i++) stepFlight(state, environment, { throttle: 1, lift: -1, boost: true }, 1 / 30);
  assert.ok(state.position[1] >= environment.floorAt(state.position[0], state.position[2]));
  assert.ok(state.position[2] >= environment.bounds.minZ);
  assert.ok(state.position[2] <= environment.bounds.maxZ);
  assert.ok(state.speed <= 54);
});

test('pause freezes flight and resuming or changing modes does not teleport', () => {
  const environment = createFlightEnvironment(world);
  const state = createFlightState(environment, false);
  state.paused = true;
  const original = structuredClone(state);
  stepFlight(state, environment, { throttle: 1 }, 60);
  assert.deepEqual(state, original);
  state.paused = false;
  setFlightMode(state, 'manual', environment);
  assert.deepEqual(state.position, original.position);
  state.position[0] += 150;
  const before = [...state.position];
  setFlightMode(state, 'tour', environment);
  stepFlight(state, environment, {}, 1 / 60);
  assert.ok(Math.hypot(...state.position.map((value, index) => value - before[index])) < 5);
});

test('reduced motion starts stationary and a suspended tab cannot cause a large flight jump', () => {
  const environment = createFlightEnvironment(world);
  const state = createFlightState(environment, true);
  assert.equal(state.mode, 'manual');
  assert.equal(state.speed, 0);
  const before = [...state.position];
  stepFlight(state, environment, {}, 30);
  assert.deepEqual(state.position, before);
  setFlightMode(state, 'tour', environment);
  const tourStart = [...state.position];
  stepFlight(state, environment, {}, 30);
  assert.ok(Math.hypot(...state.position.map((value, index) => value - tourStart[index])) < 10);
});
