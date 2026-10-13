import test from 'node:test';
import assert from 'node:assert/strict';
import { legalMoves, makeMove, notation, startRound } from '../src/dominoes-rules.js';
import { chooseMove } from '../src/dominoes-opponent.js';

const round = (hands, { line = [], turn = 0, boneyard = [] } = {}) => ({ seed: 0, players: hands.length, hands, boneyard, line, turn, lead: null, passes: 0, over: null });
const placed = (id, left, right) => ({ id, left, right });

test('a regular plays onto a number the next player could not follow', () => {
  // 1-5 opens a five, 3-6 a three; 3-6 is heavier, but the next player drew on fives before.
  const state = round([['1-5', '3-6', '0-0'], ['2-2', '4-4']], { line: [placed('6-1', 6, 1)] });
  assert.equal(notation(chooseMove(state, [], legalMoves(state))), 'L:3-6', 'without that knowledge, the heavier tile');
  const drewOnFives = [{ kind: 'draw', player: 1, ends: [5, 5] }];
  assert.equal(notation(chooseMove(state, drewOnFives, legalMoves(state))), 'R:1-5');
});

test('a regular sheds the heavier tile and keeps an answer', () => {
  // Both 1-6 and 5-6 fit the six. 5-6 is heavier, and keeping 1-6 still answers a six.
  const state = round([['1-6', '5-6', '0-2'], ['3-3']], { line: [placed('6-4', 6, 4)] });
  assert.equal(notation(chooseMove(state, [], legalMoves(state))), 'L:5-6');
});

test('a regular draws or passes only when it has no play, and is deterministic', () => {
  const stuck = round([['0-1'], ['3-3']], { line: [placed('6-6', 6, 6)], boneyard: ['2-2'] });
  assert.equal(chooseMove(stuck, [], legalMoves(stuck)).kind, 'draw');
  for (let seed = 1; seed <= 30; seed++) {
    let state = startRound(seed, 4);
    const played = [];
    while (!state.over) {
      const moves = legalMoves(state), move = chooseMove(state, played, moves);
      assert.ok(moves.includes(move), 'the choice is one of the legal moves');
      assert.deepEqual(chooseMove(state, played, moves), move);
      played.push({ ...move, player: state.turn }); state = makeMove(state, move);
    }
  }
});
