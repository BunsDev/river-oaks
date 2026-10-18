import test from 'node:test';
import assert from 'node:assert/strict';
import { HAND, RINGS, START, THROW, accelFor, checkout, handDraw, heightAt, landingOf, releaseSpeed, replay, scoreAt, startGame, targetPoint, throwDart, throwLanding, validRelease } from '../src/darts-rules.js';
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

test('a release: across sets where the dart lands across, the hand\'s acceleration sets its height', () => {
  // Smeets, Frens & Brenner (2002): about 50 m/s² brings the hand to some 6 m/s at release.
  assert.ok(Math.abs(releaseSpeed(THROW.nominal) - 6) < 1e-9);
  assert.ok(Math.abs(heightAt(releaseSpeed(THROW.nominal))) < 1e-9, 'the nominal throw meets the board level with the bull');
  assert.ok(THROW.angle > 15 * Math.PI / 180 && THROW.angle < 18 * Math.PI / 180, 'released a little upward');
  // Harder is higher, softer drops lower, and the across position never depends on it.
  let previous = -Infinity;
  for (let accel = THROW.accel[0]; accel <= THROW.accel[1]; accel += 2.5) {
    const [x, y] = landingOf([-40, accel]);
    assert.equal(x, -40); assert.ok(y > previous, `${accel} m/s² lands higher than softer`); previous = y;
  }
  // The range spans the board, from below its bottom double to above its top one.
  assert.ok(landingOf([0, THROW.accel[0]])[1] < -RINGS.doubleOut && landingOf([0, THROW.accel[1]])[1] > RINGS.doubleOut);
  assert.equal(scoreAt(landingOf([0, accelFor(103)])).label, 'T20');
  assert.equal(scoreAt(landingOf([0, accelFor(-166)])).label, 'D3');
  for (const height of [-160, -50, 0, 33, 103, 166]) assert.ok(Math.abs(landingOf([0, accelFor(height)])[1] - height) < 1e-6, `accelFor inverts the flight at ${height} mm`);
  assert.equal(accelFor(900), THROW.accel[1], 'out of reach asks for the hardest throw');
});

test('the hand\'s error: across from its direction, and a slow throw drops further for the same speed error', () => {
  assert.equal(handDraw(0.5), 0);
  assert.deepEqual(throwLanding([12, 55], [0, 0]), landingOf([12, 55]));
  const [x] = throwLanding([0, 50], [1, 0]);
  assert.equal(x, HAND.across, 'one unit of direction error moves it across by the hand\'s spread');
  const drop = accel => landingOf([0, accel])[1] - throwLanding([0, accel], [0, -1])[1];
  assert.ok(drop(42) > drop(70) * 1.8, `slow ${drop(42).toFixed(1)} mm vs firm ${drop(70).toFixed(1)} mm`);
  assert.ok(drop(50) > 15 && drop(50) < 21, 'about 18 mm at the nominal throw, like the across spread');
  assert.deepEqual(throwLanding([THROW.across, THROW.accel[1]], [40, 40]), [400, 400], 'held to the recorded square');
  for (const release of [[0, 50], [THROW.across, THROW.accel[0]], [-THROW.across, THROW.accel[1]]]) assert.ok(validRelease(release), JSON.stringify(release));
  for (const release of [[0], [0, 50, 1], [THROW.across + 0.1, 50], [0, THROW.accel[0] - 0.1], [NaN, 50], ['0', 50], null]) assert.equal(validRelease(release), false, JSON.stringify(release));
});
