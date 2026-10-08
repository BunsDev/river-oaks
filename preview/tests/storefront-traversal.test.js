import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(world);

function walk(room, from, to, fps, fast = false) {
  const start = room.toWorld(...from), end = room.toWorld(...to);
  const yaw = Math.atan2(start[0] - end[0], end[1] - start[1]);
  const state = createWalkingState(environment, start, yaw);
  assert.ok(Math.hypot(state.position[0] - start[0], state.position[2] + start[1]) < 1e-6,
    `${room.name}: start must not be rescued by spawn relocation`);
  for (let frame = 0; frame < fps * 5; frame++) {
    if (Math.hypot(state.position[0] - end[0], state.position[2] + end[1]) < 0.08) return state;
    stepWalking(state, environment, { forward: 1, fast }, 1 / fps);
    assert.ok(environment.isFree(state.position[0], state.position[2]), `${room.name}: penetrated collision`);
  }
  assert.fail(`${room.name}: ${JSON.stringify(from)} → ${JSON.stringify(to)} at ${fps} Hz stopped at ${JSON.stringify(room.toLocal(state.position[0], -state.position[2]))}`);
}

test('every mapped destination has a physical doorway test', () => {
  assert.equal(environment.rooms.length, world.stores.length);
  assert.equal(environment.rooms.length, 30);
});

for (const room of environment.rooms) {
  for (const fps of [30, 60, 120]) for (const fast of [false, true]) {
    const routes = [-0.45, 0, 0.45].map(a => [[a, -1.1], [a, 1.0]]);
    for (const side of [-1, 1]) routes.push([[side * 0.45, -1.1], [-side * 0.45, 1.0]]);
    for (const [outside, inside] of routes) for (const [from, to] of [[outside, inside], [inside, outside]]) {
      test(`${room.name}: ${JSON.stringify(from)} to ${JSON.stringify(to)}, ${fps} Hz, ${fast ? 'fast' : 'walk'}`, () => {
        walk(room, from, to, fps, fast);
      });
    }
  }

  test(`${room.name}: glazing beside the doorway blocks entry and permits retreat`, t => {
    for (const side of [-1, 1]) {
      const start = room.toWorld(side * 1.2, -2.5), end = room.toWorld(side * 1.2, 1);
      const state = createWalkingState(environment, start, Math.atan2(start[0] - end[0], end[1] - start[1]));
      if (Math.hypot(state.position[0] - start[0], state.position[2] + start[1]) >= 1e-6) {
        t.skip('Negative-test approach is already obstructed; not evidence about the glass');
        return;
      }
      for (let frame = 0; frame < 180; frame++) stepWalking(state, environment, { forward: 1, fast: true }, 1 / 60);
      const depth = room.toLocal(state.position[0], -state.position[2])[1];
      assert.ok(depth < 0, `${room.name}: crossed the glass at depth ${depth}`);
      for (let frame = 0; frame < 60; frame++) stepWalking(state, environment, { forward: -1 }, 1 / 60);
      assert.ok(room.toLocal(state.position[0], -state.position[2])[1] < depth - 0.5, `${room.name}: cannot retreat from glass`);
    }
  });
}
