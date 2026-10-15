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
