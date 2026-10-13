import test from 'node:test';
import assert from 'node:assert/strict';
import { START_FEN, findMove, fromFEN, makeMove, positionKey, replay } from '../src/chess-rules.js';
import { chooseMove, evaluate } from '../src/chess-opponent.js';

test('the regular mates in one when it can', () => {
  // Back-rank mate: Ra8#.
  assert.equal(chooseMove(fromFEN('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1')).move, 'a1a8');
  // Scholar's mate: Qxf7#.
  assert.equal(chooseMove(replay(['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6']).state).move, 'h5f7');
});

test('the regular takes a hanging queen and does not hang its own', () => {
  assert.equal(chooseMove(fromFEN('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1')).move, 'd1d5');
  // The pawn on g6 attacks the queen on h5: the queen must move, and not onto a pawn's diagonal.
  const { state } = replay(['e2e4', 'e7e5', 'd1h5', 'g7g6']);
  const reply = chooseMove(state), after = makeMove(state, findMove(state, reply.move)), queen = after.board.indexOf('Q');
  assert.ok(reply.move.startsWith('h5'), `the attacked queen moves (${reply.move})`);
  const pawnGuards = [[-1, 1], [1, 1]].some(([df, dr]) => after.board[queen + dr * 8 + df] === 'p' && Math.abs(((queen + dr * 8 + df) & 7) - (queen & 7)) === 1);
  assert.ok(!pawnGuards, `the queen does not land where a pawn takes it (${reply.move})`);
});

test('every reply stays within its node budget and is deterministic', () => {
  const state = fromFEN(START_FEN);
  const first = chooseMove(state, { budget: 3000 });
  assert.ok(first.nodes <= 3000);
  assert.deepEqual(chooseMove(state, { budget: 3000 }), first);
  assert.ok(findMove(state, first.move));
});

test('a finished game has no reply, and evaluation is symmetric', () => {
  assert.equal(chooseMove(replay(['f2f3', 'e7e5', 'g2g4', 'd8h4']).state), null);
  assert.equal(evaluate(fromFEN(START_FEN)), 0);
  const white = fromFEN('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'), black = fromFEN('4k3/4p3/8/8/8/8/8/4K3 b - - 0 1');
  assert.equal(evaluate(white), evaluate(black));
});

test('the regular avoids repeating a position it has already played', () => {
  // With a free rook move available, returning to an earlier position is scored a draw.
  const { state, keys } = replay(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6']);
  const reply = chooseMove(state, { history: keys });
  assert.notEqual(positionKey(replay(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', reply.move]).state), keys[2]);
});
