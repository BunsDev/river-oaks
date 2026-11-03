import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWalkingEnvironment } from '../src/walking.js';
import { hoverClear, stepHoverLift } from '../src/carriage-motion.js';
import { climbClear } from '../e2e/hover-landing.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const environment = createWalkingEnvironment(world);
// Where hosted main run 41501249712 pressed G and stopped 3.57 m up (8a51f750).
const spot = [-2764.3251872240853, 0, 1267.0772171224548];
const craft = (yaw, altitude = 0) => ({ vehicle: 'hover', position: spot, yaw, altitude, speed: 0 });
const descend = yaw => {
  const state = { ...craft(yaw, 6), landing: true, liftTarget: 0, verticalSpeed: 0 };
  for (let i = 0; i < 1200 && state.landing && state.altitude > 0; i++) stepHoverLift(state, environment, {}, 1 / 30);
  return state.altitude;
};

test('the hosted stall: at this spot a few degrees of heading decide whether the craft lands', () => {
  assert.equal(descend(0.3), 0, 'clear heading lands');
  const stopped = descend(0.44);
  assert.ok(stopped > 3.5 && stopped < 3.7, `the next heading stops near the hosted 3.57 m, stopped at ${stopped}`);
});

test('a spot is not clear for landing when a small turn of the hull would stop the descent', () => {
  assert.equal([0, 1, 2, 3, 4, 5, 6].every(altitude => hoverClear(craft(0.3, altitude), environment)), true, 'the heading itself passes');
  assert.equal(climbClear(craft(0.3), environment), false);
});

test('a spot that passes lands at every heading in the band', () => {
  const position = [spot[0] - 6, 0, spot[2]];
  assert.equal(climbClear({ ...craft(0.3), position }, environment), true, 'six metres from the wall is clear');
  for (const yaw of [0, 0.15, 0.3, 0.45, 0.6]) {
    const state = { ...craft(yaw, 6), position, landing: true, liftTarget: 0, verticalSpeed: 0 };
    for (let i = 0; i < 1200 && state.landing && state.altitude > 0; i++) stepHoverLift(state, environment, {}, 1 / 30);
    assert.equal(state.altitude, 0, `yaw ${yaw}`);
  }
});
