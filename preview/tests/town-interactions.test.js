import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeatAndWater } from '../src/seat-and-water.js';

const world = { stores: [], roads: [], buildings: [], bounds_m: [-20, -20, 20, 20] };
test('seating cannot fall back to local gameplay without a town', async () => {
  const applied = [];
  const walking = { active: true, getPose: () => ({ position: [0, 0, 0], sitting: { buildId: 'seat', slot: 0 } }), applyServerPose: pose => applied.push(pose) };
  const controls = createSeatAndWater({ walking, playerAvatar: {} });
  controls.load(world, () => true);
  assert.equal(controls.interaction(), null);
  assert.deepEqual(applied, []);
});
test('standing applies only a server-confirmed pose and hides on disconnect', async () => {
  const calls = [], applied = [];
  const player = { position: [1, 2, 0], sitting: null };
  const town = { connected: true, command: async command => { calls.push(command); return { ok: true, player }; } };
  const walking = { active: true, getPose: () => ({ position: [0, 0, 0], sitting: { buildId: 'seat', slot: 0 } }), applyServerPose: pose => applied.push(pose) };
  const controls = createSeatAndWater({ walking, playerAvatar: {}, getMultiplayer: () => town });
  controls.load(world, () => true);
  await controls.interaction().run();
  assert.deepEqual(calls, [{ type: 'stand' }]);
  assert.deepEqual(applied, [player]);
  town.connected = false;
  assert.equal(controls.interaction(), null);
});
