import test from 'node:test';
import assert from 'node:assert/strict';
import { FOUL, PUCK, PUCKS, TABLE, TARGET, notation, play, pointsFor, powerFor, replay, restFor, roundScore, slide, startGame } from '../src/shuffleboard-rules.js';
import { chooseThrow } from '../src/shuffleboard-opponent.js';

test('a puck slides further with more power, stops short of the foul line off the board, and leaves over the end', () => {
  let previous = 0;
  for (const power of [0.3, 0.5, 0.7, 0.9]) { const { thrown } = slide([], 0, 0.5, power); assert.ok(thrown.u > previous, `${power}`); previous = thrown.u; }
  assert.equal(slide([], 0, 0.5, 0).thrown.out, true, 'short of the foul line: taken off');
  assert.equal(slide([], 0, 0.5, 1).thrown.out, true, 'past the far end');
  assert.ok(Math.abs(slide([], 0, 0.5, powerFor(2.3)).thrown.u - 2.3) < 0.01, 'powerFor inverts a lone slide');
  assert.ok(Math.abs(restFor(powerFor(2.1)) - 2.1) < 1e-9 && Math.abs(slide([], 0, 0.5, 0.6).thrown.u - restFor(0.6)) < 0.01, 'restFor predicts it');
  assert.equal(slide([], 0, 1, 0.8).thrown.out, true, 'hard to one side: into the gutter');
});

test('pucks knock each other: a struck puck carries on, the striker slows', () => {
  const struck = { owner: 1, u: 2.0, v: 0, out: false };
  const { pucks } = slide([struck], 0, 0.5, powerFor(2.35));
  const [them, us] = [pucks.find(p => p.owner === 1), pucks.find(p => p.owner === 0)];
  assert.ok(them.u > 2.0 + PUCK || them.out, 'the struck puck is driven on');
  assert.ok(us.u < them.u || them.out);
});

test('scoring: only the furthest player scores, every puck beyond the rival’s best, by zone; a hanger scores four', () => {
  const at = (owner, u, v = 0) => ({ owner, u, v, out: false });
  assert.deepEqual(roundScore([at(0, 2.3), at(0, 2.0), at(1, 2.1), at(0, 1.7)]), [0, 3], 'only the 3 beyond the rival counts');
  assert.deepEqual(roundScore([at(1, 2.25), at(1, 2.21), at(0, 2.0)]), [1, 6]);
  assert.equal(pointsFor(at(0, TABLE.length + PUCK * 0.3)), 4, 'a hanger');
  assert.equal(pointsFor(at(0, FOUL + 0.01)), 1);
  assert.equal(roundScore([]), null);
});

test('rounds of four pucks each, alternating; the other player throws first next round; first to fifteen; games replay', () => {
  let state = startGame(), throws = [];
  for (let i = 0; i < PUCKS * 2; i++) { assert.equal(state.turn, i % 2, `throw ${i} alternates`); throws.push(notation(0.5, 0.88)); state = play(state, 0.5, 0.88); }
  assert.equal(state.round, 2); assert.equal(state.turn, 1, 'the other player opens the next round'); assert.deepEqual(state.thrown, [0, 0]);
  assert.ok(state.scores[0] + state.scores[1] > 0, 'someone scored');
  assert.deepEqual(replay(throws).state.scores, state.scores);
  assert.throws(() => play(startGame(), 1.2, 0.5), /Bad throw/);
});

test('the regulars play whole games to fifteen, and their throws repeat', () => {
  for (const seed of [1, 2, 3, 123_456_789, 2 ** 32 - 1]) {
    let state = startGame();
    for (let guard = 0; guard < 400 && state.winner === null; guard++) {
      const shot = chooseThrow(state, seed);
      assert.deepEqual(chooseThrow(state, seed), shot);
      state = play(state, shot.aim, shot.power);
    }
    assert.notEqual(state.winner, null, `seed ${seed} ends`);
    assert.ok(Math.max(...state.scores) >= TARGET);
  }
});
