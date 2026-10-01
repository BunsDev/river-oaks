import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalkingEnvironment } from '../src/walking.js';
import { createSharedWorld } from '../../server/world.js';
import { BUILD_AHEAD, builderTarget, evaluatePlacement, poseFeet } from '../src/builder-mode.js';
import { BUILD_REACH, buildKind, buildRoads } from '../src/shared-build.js';

const world = { scene: 'district', bounds_m: [-40, -40, 40, 40], walkSpawn: [-12, 0, 0], stores: [], buildings: [],
  collisionPolygons: [[[-3, -8], [3, -8], [3, 8], [-3, 8]]], roads: [{ id: 'r', width_m: 6, points: [[-40, 25], [40, 25]] }],
  communityLocations: [{ id: 'a', name: 'Garden', position: [-12, 0, 0] }, { id: 'b', name: 'Gallery', position: [12, 0, 0] }] };
const environment = createWalkingEnvironment(world), roads = buildRoads(world), seat = buildKind('seat');
const pose = (east, north, yaw = 0) => ({ position: [east, 1.6, -north], yaw, ground: 0 });
const judge = (position, extra = {}) => evaluatePlacement({ environment, roads, kind: seat, position, feet: [-12, -6], ...extra });

test('the preview sits a few steps ahead, or under the pointer within reach', () => {
  assert.deepEqual(builderTarget(pose(-12, -6, 0)), [-12, -6 + BUILD_AHEAD]);
  // A ray from 1.6 m up, pointing down at 45° toward north, meets the ground 1.6 m ahead.
  const ray = { origin: [-12, 1.6, 6], direction: [0, -Math.SQRT1_2, -Math.SQRT1_2] };
  assert.deepEqual(builderTarget(pose(-12, -6), ray), [-12, -4.4]);
  // Pointing far away is clamped to just inside the town's reach, on the same line.
  const far = builderTarget(pose(-12, -6), { origin: [-12, 1.6, 6], direction: [0, -.05, -1] });
  const away = Math.hypot(far[0] + 12, far[1] + 6);
  assert.ok(away <= BUILD_REACH && away > BUILD_REACH - .3, `clamped to ${away.toFixed(2)} m`);
  // Pointing at the sky falls back to ahead.
  assert.deepEqual(builderTarget(pose(-12, -6), { origin: [-12, 1.6, 6], direction: [0, .3, -1] }), [-12, -6 + BUILD_AHEAD]);
  assert.deepEqual(poseFeet(pose(4, 5)), [4, 5]);
});

test('each refusal names its reason', () => {
  assert.equal(judge([-12, -3.6]).valid, true);
  assert.equal(judge([-2.5, -6], { feet: [-5, -6] }).reason, 'blocked', 'a wall inside the footprint');
  assert.equal(judge([-12, 21], { feet: [-12, 19] }).reason, 'road');
  assert.equal(judge([-12, 2]).reason, 'reach');
  assert.equal(judge([-12, -3.6], { builds: [{ id: 'x', kind: 'seat', position: [-12, -2.5] }] }).reason, 'creation');
  assert.equal(judge([-12, -3.6], { builds: [{ id: 'x', kind: 'seat', position: [-12, -2.5] }], moving: { id: 'x', position: [-12, -2.5] } }).valid, true, 'a creation does not block its own move');
  const self = judge([-12, -5.5], { players: [{ id: 'me', position: [-12, -6] }], selfId: 'me' });
  assert.equal(self.reason, 'player'); assert.match(self.message, /standing there/);
  assert.equal(judge([-12, -3.6], { moving: { id: 'x', position: [-12, -12] } }).reason, 'reach', 'a move must start within edit reach');
});

test('the preview and the town agree on every spot they are asked about', () => {
  let time = 1000;
  const town = createSharedWorld(world, { now: () => time });
  town.join({ userId: 'u', name: 'Builder' });
  const feet = town.snapshot().players[0].position;
  let agreed = 0; const outcomes = new Set();
  for (let dx = -3.4; dx <= 3.4; dx += .85) for (let dy = -3.4; dy <= 3.4; dy += .85) {
    const position = [Math.round((feet[0] + dx) * 10) / 10, Math.round((feet[1] + dy) * 10) / 10];
    const snapshot = town.snapshot();
    const preview = evaluatePlacement({ environment, roads, kind: seat, position, feet, builds: snapshot.builds, players: snapshot.players, selfId: 'u' });
    time += 3000;
    const result = town.command('u', { type: 'build', action: 'place', kind: 'seat', finish: 'rose', position, yaw: 0 });
    assert.equal(result.ok, preview.valid, `${position}: preview says ${preview.reason ?? 'ok'}, town says ${result.ok ? 'ok' : result.error ?? result.message}`);
    if (result.ok) { assert.ok(Math.abs(result.item.ground - preview.ground) < 1e-9); town.command('u', { type: 'build', action: 'remove', id: result.item.id }); }
    agreed++; outcomes.add(preview.reason ?? 'ok');
  }
  assert.ok(agreed >= 60);
  assert.ok(outcomes.has('ok') && outcomes.size >= 3, `covers acceptance and several refusals: ${[...outcomes]}`);
});
