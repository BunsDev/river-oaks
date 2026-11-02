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
// #587 post-chess traversal (mode B): the town shows a stand twice, in the snapshot and in the
// command's reply. When the snapshot lands first the player is already standing, may already be
// walking, and the late reply must not put them back on the stand spot or drop the held W.
test('a stand reply that lands after the town already showed the stand is not applied again', async () => {
  const applied = [];let sitting = { buildId: 'seat', slot: 0 }, answer;
  const town = { connected: true, command: () => new Promise(resolve => { answer = resolve; }) };
  const walking = { active: true, getPose: () => ({ position: [0, 0, 0], sitting }), applyServerPose: pose => applied.push(pose) };
  const controls = createSeatAndWater({ walking, playerAvatar: {}, getMultiplayer: () => town });
  controls.load(world, () => true);
  const standing = controls.interaction().run();
  sitting = null; // the snapshot applied the stand first
  answer({ ok: true, player: { position: [1, 2, 0], sitting: null } });await standing;
  assert.deepEqual(applied, [], 'the stale reply is not re-applied');
});
