import test from 'node:test';
import assert from 'node:assert/strict';
import { findMove, fromDiagram, legalMoves, makeMove, startPosition } from '../src/checkers-rules.js';
import { chooseMove, evaluate } from '../src/checkers-opponent.js';

test('the regular prefers the capture that wins more', () => {
  // Light to move must capture: b6 can take two (c5, then e3), h4 only one (g3).
  const position = fromDiagram([
    '........',
    '........',
    '.l......',
    '..d.....',
    '.......l',
    '....d.d.',
    '........',
    '........',
  ], 'l');
  assert.deepEqual(legalMoves(position).map(move => move.captures.length).sort(), [1, 2]);
  assert.equal(chooseMove(position).move, 'b6xd4xf2');
});

test('the regular does not walk a man into a capture for nothing', () => {
  // Dark to move: d4-e5 would be jumped by f6; d4-c5 is safe.
  const position = fromDiagram([
    '........',
    '........',
    '.....l..',
    '........',
    '...d....',
    '........',
    '........',
    '........',
  ], 'd');
  assert.equal(chooseMove(position).move, 'd4-c5');
});

test('every reply is legal, within budget and deterministic; a lost game has none', () => {
  const start = startPosition(), first = chooseMove(start, { budget: 5000 });
  assert.ok(first.nodes <= 5000 && findMove(start, first.move));
  assert.deepEqual(chooseMove(start, { budget: 5000 }), first);
  assert.equal(chooseMove(fromDiagram(['........', '........', '........', '........', '........', '..l.....', '.l......', 'd.......'])), null);
  assert.equal(evaluate(startPosition()), 0);
});

test('a forced capture is played at once', () => {
  const position = fromDiagram(['........', '........', '........', '........', '....l...', '...d....', '........', '........'], 'd');
  assert.equal(legalMoves(position).length, 1);
  const reply = chooseMove(position);
  assert.equal(reply.move, 'd3xf5');
  assert.equal(makeMove(position, findMove(position, reply.move)).board.filter(Boolean).join(''), 'd');
});
