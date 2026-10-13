import test from 'node:test';
import assert from 'node:assert/strict';
import { countOf, legalMoves, play, raises, replay, startGame, totalDice } from '../src/liars-dice-rules.js';
import { chooseMove } from '../src/liars-dice-opponent.js';

test('a round: five dice each under a cup, bids that must raise, ones wild', () => {
  const state = startGame(3);
  assert.deepEqual(state.cups.map(cup => cup.length), [5, 5, 5, 5]);
  assert.equal(totalDice(state), 20); assert.equal(state.turn, 0);
  assert.ok(!legalMoves(state).includes('liar'), 'nothing to call yet');
  assert.ok(raises({ quantity: 3, face: 4 }, 3, 5) && raises({ quantity: 3, face: 4 }, 4, 2));
  assert.ok(!raises({ quantity: 3, face: 4 }, 3, 3) && !raises({ quantity: 3, face: 4 }, 2, 6));
  const after = play(state, 'bid:3:4');
  assert.equal(after.turn, 1); assert.throws(() => play(after, 'bid:3:2'), /Illegal/); assert.throws(() => play(after, 'bid:21:6'), /Illegal/);
  assert.equal(countOf([[1, 4, 4], [2, 1]], 4), 4, 'ones count as fours');
});

test('liar: the cups are lifted; a good bid costs the caller a die, a bad one the bidder', () => {
  let state = { ...startGame(1), cups: [[4, 4, 1, 2, 3], [4, 5, 6, 6, 2], [3, 3, 3, 2, 2], [5, 5, 5, 5, 6]] };
  state = play(state, 'bid:4:4'); // four fours: 4,4,1 and 4 = exactly four
  const upheld = play(state, 'liar');
  assert.deepEqual([upheld.reveal.actual, upheld.reveal.loser, upheld.counts.join()], [4, 1, '5,4,5,5'], 'the caller (player 1) loses a die');
  assert.equal(upheld.turn, 1, 'the loser opens the next round'); assert.equal(upheld.round, 2); assert.equal(upheld.cups[1].length, 4);
  let bluff = { ...startGame(1), cups: [[4, 4, 1, 2, 3], [4, 5, 6, 6, 2], [3, 3, 3, 2, 2], [5, 5, 5, 5, 6]] };
  bluff = play(play(bluff, 'bid:4:4'), 'bid:6:6'); // six sixes: 6,6,6 and the 1 = four
  const caught = play(bluff, 'liar');
  assert.deepEqual([caught.reveal.actual, caught.reveal.loser], [4, 1], 'the bidder of six sixes (player 1) loses');
});

test('players out of dice drop out; the last with dice wins; games replay exactly', () => {
  for (const seed of [1, 2, 3, 77, 123_456_789, 2 ** 32 - 1]) {
    let state = startGame(seed), moves = [];
    for (let guard = 0; guard < 2000 && state.winner === null; guard++) {
      const move = chooseMove(state);
      assert.ok(legalMoves(state).includes(move), `seed ${seed}: ${move}`);
      assert.equal(chooseMove(state), move, 'deterministic');
      assert.ok(state.counts[state.turn] > 0, 'only players with dice take turns');
      moves.push(move); state = play(state, move);
    }
    assert.notEqual(state.winner, null, `seed ${seed} ends`);
    assert.equal(state.counts.filter(count => count > 0).length, 1);
    assert.equal(state.counts[state.winner] > 0, true);
    assert.deepEqual(replay(seed, moves).state.counts, state.counts);
  }
});

test('a regular calls an impossible bid and supports what it holds', () => {
  const state = { ...startGame(5), turn: 1, cups: [[2, 3, 4, 5, 6], [6, 6, 1, 6, 2], [3, 3, 4, 4, 5], [2, 2, 3, 4, 5]] };
  assert.equal(chooseMove({ ...state, bid: { quantity: 15, face: 3, player: 0 }, bids: [{ quantity: 15, face: 3, player: 0 }] }), 'liar');
  const opening = chooseMove({ ...state, bid: null, bids: [] });
  assert.match(opening, /^bid:\d+:6$/, `it bids on its sixes (${opening})`);
});
