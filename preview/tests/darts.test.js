import test from 'node:test';
import assert from 'node:assert/strict';
import { RINGS, START, checkout, replay, scoreAt, startGame, targetPoint, throwDart } from '../src/darts-rules.js';
import { aimFor, throwPoint } from '../src/darts-opponent.js';

test('the board: bulls, singles, trebles, doubles and misses where they belong', () => {
  assert.equal(scoreAt([0, 0]).value, 50); assert.equal(scoreAt([0, 0]).multiplier, 2, 'the bull counts as a double');
  assert.equal(scoreAt([0, 10]).value, 25);
  assert.deepEqual(scoreAt(targetPoint(20, 'treble')), { value: 60, multiplier: 3, number: 20, label: 'T20' });
  assert.equal(scoreAt(targetPoint(20, 'double')).label, 'D20');
  assert.equal(scoreAt([60, 0]).number, 6, 'six is at the right'); assert.equal(scoreAt([0, -60]).number, 3, 'three at the bottom');
  assert.equal(scoreAt([-60, 0]).number, 11, 'eleven at the left');
  assert.equal(scoreAt([0, RINGS.doubleOut + 1]).value, 0, 'off the board');
  for (const number of [1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5, 20]) for (const ring of ['single', 'treble', 'double']) {
    const hit = scoreAt(targetPoint(number, ring)); assert.equal(hit.number, number); assert.equal(hit.multiplier, ring === 'treble' ? 3 : ring === 'double' ? 2 : 1);
  }
});

test('501 double out: scores come off, three darts a turn, a double finishes, a bust restores the turn', () => {
  let state = startGame();
  for (let i = 0; i < 3; i++) state = throwDart(state, targetPoint(20, 'treble'));
  assert.deepEqual([state.scores[0], state.turn], [START - 180, 1], 'a 180, then the other player throws');
  // Player 1 on 40: a single 20 leaves 20; a double 10 finishes.
  state = { ...state, scores: [321, 40], turnStart: 40 };
  state = throwDart(state, targetPoint(20, 'single'));
  assert.equal(state.scores[1], 20);
  state = throwDart(state, targetPoint(10, 'double'));
  assert.equal(state.winner, 1);
  assert.throws(() => throwDart(state, [0, 0]), /over/);
  // Busts: over the score, to exactly 0 off a single, or leaving 1.
  for (const [score, point] of [[32, targetPoint(20, 'double')], [20, targetPoint(20, 'single')], [21, targetPoint(20, 'single')]]) {
    let bust = { ...startGame(), scores: [score, 501], turnStart: score };
    bust = throwDart(bust, point);
    assert.deepEqual([bust.scores[0], bust.turn, bust.history.at(-1).result], [score, 1, 'bust'], `bust from ${score}`);
  }
  const points = [targetPoint(20, 'treble'), targetPoint(19, 'treble'), [0, 0]];
  assert.deepEqual(replay(points).state.scores, [501 - 60 - 57 - 50, 501]);
});

test('checkouts: 170 is T20 T20 bull; finishes end on a double; impossible ones are refused', () => {
  assert.deepEqual(checkout(170).map(bed => `${bed.ring}${bed.number}`), ['treble20', 'treble20', 'double25']);
  for (const score of [2, 40, 32, 61, 100, 121, 141, 160]) {
    const plan = checkout(score);
    assert.ok(plan && plan.at(-1).double && plan.reduce((sum, bed) => sum + bed.value, 0) === score, `${score}`);
  }
  for (const score of [169, 168, 166, 165, 163, 162, 159]) assert.equal(checkout(score), null, `${score} has no three-dart finish`);
  assert.equal(checkout(1), null);
});

test('the regular aims sensibly, throws deterministically, and finishes games', () => {
  assert.equal(scoreAt(aimFor(startGame())).label, 'T20');
  assert.equal(scoreAt(aimFor({ ...startGame(), scores: [40, 501] })).label, 'D20');
  const lengths = [];
  for (const seed of [1, 2, 3, 123_456_789, 2 ** 32 - 1]) {
    let state = startGame(), darts = 0;
    while (state.winner === null && darts < 600) { const point = throwPoint(state, seed); assert.deepEqual(throwPoint(state, seed), point); state = throwDart(state, point); darts++; }
    assert.notEqual(state.winner, null, `seed ${seed} finishes`); lengths.push(darts);
  }
  assert.ok(Math.max(...lengths) < 400, `games end in reasonable time (${lengths.join(', ')} darts)`);
});
