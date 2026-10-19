import test from 'node:test';
import assert from 'node:assert/strict';
import { KILLSHOTS, RINGS, THROWS, replay, scoreAt, startGame, throwAxe } from '../src/axe-rules.js';

test('the target: bull, rings, killshots and the bare board score where they belong', () => {
  assert.deepEqual(scoreAt([0, 0]), { value: 6, label: 'Bull' });
  assert.equal(scoreAt([0, RINGS[0].radius + 1]).value, 4);
  assert.equal(scoreAt([100, 100]).value, 3);
  assert.equal(scoreAt([0, -260]).value, 2);
  assert.equal(scoreAt([0, 339]).value, 1);
  assert.deepEqual(scoreAt([0, 380]), { value: 0, label: 'Board' });
  for (const point of KILLSHOTS) assert.deepEqual(scoreAt(point), { value: 8, label: 'Killshot' });
});

test('a dropped axe scores nothing, even in the bull', () => {
  const state = throwAxe(startGame(), { point: [0, 0], stuck: false });
  assert.deepEqual(state.scores, [0, 0]);
  assert.equal(state.history[0].label, 'Drop');
  assert.equal(state.turn, 1);
});

test('ten throws each in turn; the higher total wins and a tie is a draw', () => {
  const throws = [];
  for (let i = 0; i < THROWS; i++) throws.push({ point: [0, 0], stuck: true }, { point: [0, 60], stuck: true });
  const { state } = replay(throws);
  assert.deepEqual(state.scores, [60, 40]);
  assert.deepEqual(state.throws, [10, 10]);
  assert.equal(state.winner, 0);
  assert.throws(() => throwAxe(state, { point: [0, 0], stuck: true }), /over/);
  const even = replay(Array.from({ length: THROWS * 2 }, () => ({ point: [0, 0], stuck: true }))).state;
  assert.equal(even.winner, null);
  assert.equal(even.draw, true);
});

test('replay rebuilds a match exactly from its throws', () => {
  const throws = [{ point: [10, 20], stuck: true }, { point: [-235, 235], stuck: true }, { point: [0, 0], stuck: false }];
  const { state } = replay(throws);
  assert.deepEqual(state.scores, [6, 8]);
  assert.equal(state.turn, 1);
  assert.deepEqual(state.history.map(item => item.label), ['Bull', 'Killshot', 'Drop']);
});

test('an axe release: across from the release, height from the speed over the real distance', async () => {
  const { AXE_THROW, axeHeightAt, axeLandingOf, axeSpeedFor, validAxeRelease } = await import('../src/axe-rules.js');
  assert.ok(Math.abs(axeHeightAt(AXE_THROW.ideal, AXE_THROW.nominal)) < 1e-9, 'the nominal throw from the ideal distance meets the bull');
  let previous = -Infinity;
  for (let speed = AXE_THROW.speed[0]; speed <= AXE_THROW.speed[1]; speed += 0.5) {
    const [x, y] = axeLandingOf([-30, speed], 4.3);
    assert.equal(x, -30); assert.ok(y > previous, `${speed} m/s lands higher than softer`); previous = y;
  }
  assert.ok(axeLandingOf([0, AXE_THROW.speed[0]], AXE_THROW.ideal)[1] < -340 && axeLandingOf([0, AXE_THROW.speed[1]], AXE_THROW.ideal)[1] > 340, 'the range spans the target');
  assert.ok(axeHeightAt(4.6, 8) < axeHeightAt(4.0, 8) - 100, 'stepping back lands the same throw lower');
  for (const [distance, height] of [[3.7, 0], [4.1, 200], [4.6, -150]]) assert.ok(Math.abs(axeLandingOf([0, axeSpeedFor(height, distance)], distance)[1] - height) < 1e-6);
  assert.ok(validAxeRelease([0, 8]) && !validAxeRelease([0, 12]) && !validAxeRelease([500, 8]) && !validAxeRelease(['0', 8]) && !validAxeRelease([0]));
});

test('rotation comes from where you stand: one clean turn near 4.1 m, the handle first closer, the top first further', async () => {
  const { AXE_THROW, axeThrow, rotationError } = await import('../src/axe-rules.js');
  const stickRate = distance => { let stuck = 0; const n = 400; for (let i = 1; i < n; i++) { const u = i / n; if (axeThrow([0, 8], distance, [0, 0, Math.log(u / (1 - u)) * .5513, 0.5]).stuck) stuck++; } return stuck / (n - 1); };
  const rates = Object.fromEntries([3.66, 3.9, 4.1, 4.4, 4.7, 5.0].map(d => [d, stickRate(d)]));
  assert.ok(rates[4.1] > 0.95 && rates[3.9] > 0.85 && rates[4.4] > 0.75, JSON.stringify(rates));
  assert.ok(rates[3.66] < 0.6 && rates[4.7] < 0.25 && rates[5] < 0.05, 'off the sweet distance the axe bounces more');
  assert.ok(rotationError(3.66) < 0 && rotationError(5) > 0);
  assert.equal(axeThrow([0, 8], 3.66, [0, 0, -2, 0.5]).rotation, 'under', 'too close: the handle hits first');
  assert.equal(axeThrow([0, 8], 5.0, [0, 0, 0, 0.5]).rotation, 'over', 'too far: the top hits first');
  assert.equal(axeThrow([0, 8], AXE_THROW.ideal, [0, 0, 0, 0.99]).stuck, false, 'a bad grain still bounces');
  const wild = axeThrow([AXE_THROW.across, AXE_THROW.speed[1]], 3.66, [40, 40, 0, 0.5]);
  assert.ok(Math.abs(wild.point[0]) <= 800 && Math.abs(wild.point[1]) <= 800 && !wild.stuck && !Object.is(axeThrow([0, 8], AXE_THROW.ideal, [0, 0, 0, 0.5]).point[1], -0), 'held to the record, never -0');
});
