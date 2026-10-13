import test from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, cellName, cellOf, dropCell, findMove, fromDiagram, legalMoves, makeMove, outcome, positionKey, replay, startPosition, winningLine } from '../src/connect-four-rules.js';
import { chooseMove, evaluate } from '../src/connect-four-opponent.js';

test('discs fall to the lowest empty cell and turns alternate, red first', () => {
  const { state, played } = replay(['d', 'd', 'd']);
  assert.deepEqual(played.map(move => cellName(move.to)), ['d1', 'd2', 'd3']);
  assert.equal(state.board[cellOf('d1')], 'r');
  assert.equal(state.board[cellOf('d2')], 'y');
  assert.equal(state.turn, 'y');
  assert.equal(cellOf('g6'), CELLS - 1);
  assert.equal(cellOf('h1'), -1);
});

test('a full column cannot take another disc', () => {
  const { state } = replay(['a', 'a', 'a', 'a', 'a', 'a']);
  assert.equal(dropCell(state.board, 0), -1);
  assert.equal(findMove(state, 'a'), null);
  assert.equal(legalMoves(state).length, 6);
  assert.throws(() => replay(['a', 'a', 'a', 'a', 'a', 'a', 'a']), /Illegal move a/);
});

test('four in a row wins across, up and along both diagonals', () => {
  const across = replay(['a', 'a', 'b', 'b', 'c', 'c', 'd']).outcome;
  assert.deepEqual(across, { winner: 'r', reason: 'four in a row', cells: ['a1', 'b1', 'c1', 'd1'].map(cellOf) });
  assert.equal(replay(['a', 'b', 'a', 'b', 'a', 'b', 'a']).outcome.winner, 'r');
  const rising = fromDiagram(['.......', '.......', '...r...', '..ry...', '.ryy...', 'ryyr...']);
  assert.equal(winningLine(rising.board).side, 'r');
  const falling = fromDiagram(['.......', '.......', 'y......', 'ry.....', 'rry....', 'rryy...']);
  assert.equal(winningLine(falling.board).side, 'y');
  assert.deepEqual(legalMoves(rising), [], 'no move after a win');
});

test('a full board without four in a row is a draw', () => {
  const full = fromDiagram(['ryryryr', 'ryryryr', 'yryryry', 'yryryry', 'ryryryr', 'ryryryr']);
  assert.equal(winningLine(full.board), null);
  assert.deepEqual(outcome(full), { winner: null, reason: 'a full board' });
  assert.equal(outcome(startPosition()), null);
  assert.equal(positionKey(makeMove(startPosition(), findMove(startPosition(), 'd'))).length, CELLS + 1);
});

test('the regular takes a win, blocks a loss, and favours the centre', () => {
  const win = fromDiagram(['.......', '.......', '.......', '.......', 'yy.....', 'rrr....']);
  assert.equal(chooseMove(win).move, 'd', 'completes its own four');
  const block = fromDiagram(['.......', '.......', '.......', '.......', '.......', 'rrr.yy.']);
  assert.equal(block.turn, 'y');
  assert.equal(chooseMove(block).move, 'd', 'blocks the open three');
  assert.equal(chooseMove(startPosition()).move, 'd');
  assert.ok(evaluate(replay(['d']).state) < 0, 'a centre disc counts against the side that faces it');
});

test('the regular answers within its budget and never plays a full column', () => {
  const crowded = replay(['d', 'd', 'd', 'd', 'd', 'd']).state;
  const reply = chooseMove(crowded, { budget: 2000 });
  assert.notEqual(reply.move, 'd');
  assert.ok(findMove(crowded, reply.move));
  assert.equal(chooseMove(fromDiagram(['ryryryr', 'ryryryr', 'yryryry', 'yryryry', 'ryryryr', 'ryryryr'])), null);
});
