import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWalkingEnvironment } from '../src/walking.js';
import { hoverClear, stepHoverLift } from '../src/carriage-motion.js';
import { climbClear } from '../e2e/hover-landing.js';
import { ribbonCanopyVolumes, ribbonCanopyBlocks } from '../../shared/city-kit/ribbon-canopy.js';
import { RIBBON_CANOPY } from '../../shared/city-kit/ribbon-dimensions.js';

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

test('the historical hosted stall now stops at the finite canopy at both headings', () => {
  // The old query omitted the canopy and let yaw .3 descend through its margin.
  // This station is no longer a legal landing route after finite overhead collision.
  for (const yaw of [0.3, 0.44]) {
    const stopped = descend(yaw);
    assert.ok(stopped > 3.5 && stopped < 4.5, `yaw ${yaw} approaches but retains whole-hull clearance above the canopy, stopped at ${stopped}`);
    assert.equal(hoverClear(craft(yaw, stopped), environment), true, 'the accepted hull remains clear');
    assert.equal(hoverClear(craft(yaw, stopped - 0.05), environment), false, 'the next descent step would intersect the obstruction');
  }
});

test('the historical station is not a landing spot even at its formerly clear heading', () => {
  assert.equal([0, 1, 2, 3, 4, 5, 6].every(altitude => hoverClear(craft(0.3, altitude), environment)), false, 'the finite canopy blocks the descent');
  assert.equal(climbClear(craft(0.3), environment), false);
});

test('the hover hull cannot straddle a finite slab between two clear height samples', () => {
  const volumes = ribbonCanopyVolumes({ modules: [{ id: 'hull-slab', from: [-10, 0], to: [10, 0], length: 20, width: 20, clearHeight: 3.6, yaw: 0 }] }, () => 0,
    { slab: RIBBON_CANOPY.slab, edgeBeyondWalk: RIBBON_CANOPY.overhang + RIBBON_CANOPY.bullnose });
  const env = { groundAt: () => 0, isFree: () => true, canFly: (x, y, z, clearance) => !ribbonCanopyBlocks(volumes, [x, y, z], clearance) };
  assert.equal(env.canFly(0, 2.4, 0), true);
  assert.equal(env.canFly(0, 4.03, 0), true);
  assert.equal(hoverClear({ ...craft(0, 2), position: [0, 0, 0] }, env), false, 'the actual hull span contains the slab');
  for (const altitude of [0, 5]) assert.equal(hoverClear({ ...craft(0, altitude), position: [0, 0, 0] }, env), true, 'legal underpass and overflight stay clear');
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
