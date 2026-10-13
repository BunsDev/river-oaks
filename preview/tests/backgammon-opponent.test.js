import test from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, fromPosition, legalMoves, move, notation, startGame } from '../src/backgammon-rules.js';
import { choosePlay } from '../src/backgammon-opponent.js';

const play = state => choosePlay(state).map(notation);

test('the regular makes its 5-point with an opening 3-1', () => {
  // The classic opening: 8/5 6/5.
  const state = fromPosition({ 24: 2, 13: 5, 8: 3, 6: 5, 1: -2, 12: -5, 17: -3, 19: -5 }, { dice: [3, 1] });
  assert.deepEqual(play(state).sort(), ['6-5', '8-5']);
});

test('the regular hits a blot when it can do so safely', () => {
  // Black's blot on 4 can be hit from 6 with the 2, landing next to white's made 3-point.
  const state = fromPosition({ 6: 3, 3: 2, 13: 3, 4: -1, 19: -6, 12: -8 }, { dice: [2, 5] });
  assert.ok(play(state).includes('6-4'), `expected a hit, got ${play(state).join(' ')}`);
});

test('the regular bears off when it can', () => {
  const state = fromPosition({ 3: 1, 2: 1, 24: -15 }, { dice: [3, 2], off: [13, 0] });
  assert.deepEqual(play(state).sort(), ['2-off', '3-off']);
});

test('whole games: the chosen play is always legal and repeatable', () => {
  for (let seed = 1; seed <= 12; seed++) {
    let state = startGame(seed);
    for (let guard = 0; !state.over && guard < 2000; guard++) {
      const chosen = choosePlay(state);
      assert.deepEqual(choosePlay(state), chosen);
      for (const step of chosen) {
        assert.ok(legalMoves(state).some(option => notation(option) === notation(step) && option.die === step.die));
        state = move(state, step);
        if (state.over) break;
      }
    }
    assert.ok(state.over, `seed ${seed} ends`);
    assert.ok([WHITE, BLACK].includes(state.over.winner));
  }
});

test('mid-turn, the regular finishes the play already begun, or plays nothing', () => {
  const begun = move(fromPosition({ 24: 1, 13: 2, 1: -15 }, { dice: [6, 5], off: [12, 0] }), { from: 24, to: 18, die: 6 });
  const rest = choosePlay(begun);
  assert.equal(rest.length, 1, 'only the die still to play');
  assert.equal(rest[0].die, 5);
  assert.ok(legalMoves(begun).some(option => notation(option) === notation(rest[0])));
  assert.deepEqual(choosePlay({ ...begun, plays: [] }), [], 'nothing left: an empty play, never a stale one');
});
