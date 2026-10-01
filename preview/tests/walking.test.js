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

test('placed-obstacle checks use one fresh ground height per position query',()=>{
  let reads=0,height=.2;
  const terrain={bounds_m:[-50,-50,50,50],buildings:[],get walkSurfaceOffset(){reads++;return height;}};
  const samples=[],objects=Array.from({length:16},()=>({contains(x,y,z,radius){samples.push([x,y,z,radius]);return false;}}));
  const environment=createWalkingEnvironment(terrain,objects);
  assert.equal(environment.isFree(2,3),true);
  assert.equal(reads,1,'A single candidate point must not resample terrain for every object');
  assert.equal(samples.length,16);assert.ok(samples.every(s=>Math.abs(s[1]-1.1)<1e-10&&s[0]===2&&s[2]===3&&s[3]===.35));
  height=.4;samples.length=0;assert.equal(environment.isFree(2,3),true);
  assert.equal(reads,2,'A later query must see a changed surface');assert.ok(samples.every(s=>s[1]===1.3));
  reads=0;samples.length=0;assert.equal(environment.isFree(51,3),false);
  assert.equal(reads,0);assert.equal(samples.length,0,'World bounds still reject before object queries');
  objects.length=0;assert.equal(environment.isFree(2,3),true);assert.equal(reads,0,'No object means no object-height query');
  objects.push({contains(){return true;}},{contains(){throw new Error('Must stop after the first blocker');}});
  assert.equal(environment.isFree(2,3),false);assert.equal(reads,1);
});

test('acceleration builds over several frames instead of peaking on the first one', () => {
  const environment = createWalkingEnvironment({ bounds_m: [-50, -50, 50, 50], buildings: [], collisionPolygons: [] });
  const profile = fps => {
    const state = createWalkingState(environment, [0, 0, 0], 0), accelerations = [];
    let previous = 0;
    for (let i = 0; i < fps; i++) { stepWalking(state, environment, { forward: 1 }, 1 / fps); accelerations.push((state.speed - previous) * fps); previous = state.speed; }
    return { accelerations, speed: state.speed };
  };
  const sixty = profile(60), thirty = profile(30), peak = Math.max(...sixty.accelerations), peakFrame = sixty.accelerations.indexOf(peak);
  assert.ok(peakFrame >= 2 && sixty.accelerations[0] < peak * 0.6, `peak ${peak.toFixed(2)} m/s² lands on frame ${peakFrame}; the first frame carries ${sixty.accelerations[0].toFixed(2)}`);
  assert.ok(peak < 12 && peak > 4, `peak acceleration ${peak.toFixed(2)} m/s² is outside a human walk start`);
  assert.ok(sixty.speed > 1.6 && thirty.speed > 1.6, 'full walking speed is reached within a second');
  assert.ok(Math.abs(sixty.speed - thirty.speed) < 0.01, 'the ramp is the same at 30 and 60 Hz');
});
