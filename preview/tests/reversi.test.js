import test from 'node:test';
import assert from 'node:assert/strict';
import * as reversi from '../src/reversi-rules.js';
import { chooseMove } from '../src/reversi-opponent.js';
import { REVERSI } from '../src/reversi-adapter.js';

const perft = (state, depth) => {
  if (!depth) return 1;
  let nodes = 0;
  for (const move of reversi.legalMoves(state)) nodes += perft(reversi.makeMove(state, move), depth - 1);
  return nodes;
};

test('Reversi starts from the four centre discs, black first, and matches published perft counts', () => {
  const start = reversi.startPosition();
  assert.equal(start.turn, 'd');
  assert.deepEqual(reversi.legalMoves(start).map(move => move.notation).sort(), ['c4', 'd3', 'e6', 'f5']);
  // Othello perft from the opening, depths 1–6 (no passes occur this early).
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(depth => perft(start, depth)), [4, 12, 56, 244, 1396, 8200]);
});

test('a placement turns every outflanked line, and only those', () => {
  const state = reversi.fromDiagram([
    '........',
    '........',
    '...d....',
    '...l....',
    '.dll.ld.',
    '...l....',
    '........',
    '........',
  ], 'd');
  const move = reversi.findMove(state, 'e4');
  // Both ways across (b4 and g4 close them); not the diagonals through d5 or d3, which
  // run on to an empty square.
  assert.deepEqual(move.flips.map(reversi.squareName).sort(), ['c4', 'd4', 'f4']);
  const after = reversi.makeMove(state, move);
  assert.deepEqual(['d5', 'd3'].map(name => after.board[reversi.squareOf(name)]), ['l', 'l'], 'an unclosed line stays as it was');
  assert.equal(reversi.findMove(state, 'a1'), null, 'a square that outflanks nothing is not a move');
});

test('a side with no move passes, and the game ends when neither side can move', () => {
  // From a random game: black plays d1 and white is left with no move.
  const state = reversi.fromDiagram(['.llllldd', 'lllddldd', 'lldldldd', 'ldlllddd', 'lldddddd', 'lllddddd', 'lllldddd', 'ldl.dddd'], 'd');
  const after = reversi.makeMove(state, reversi.findMove(state, 'd1'));
  assert.deepEqual([after.turn, after.passed], ['d', true], 'white passes; black moves again');
  const ended = reversi.fromDiagram(Array.from({ length: 8 }, (_, row) => row < 5 ? 'dddddddd' : 'llllllll'), 'l');
  assert.deepEqual(reversi.outcome(ended), { winner: 'd', reason: '40 to 24', score: { d: 40, l: 24 } });
  assert.equal(reversi.outcome(reversi.fromDiagram(Array.from({ length: 8 }, (_, row) => row < 4 ? 'dddddddd' : 'llllllll'))).reason, '32 discs each');
  assert.equal(reversi.outcome(reversi.startPosition()), null);
  // Empty squares left but neither side can move: the game is over, not an endless pass,
  // so the sheet's regular (which asks again after each of its moves) stops too.
  const blocked = reversi.fromDiagram(['dddddddd', 'dddddddd', 'dddddddd', 'ddd..ddd', 'dddddddd', 'dddddddd', 'dddddddd', 'dddddddd'], 'l');
  assert.deepEqual([reversi.legalMoves(blocked).length, reversi.legalMoves({ ...blocked, turn: 'd' }).length], [0, 0]);
  assert.equal(reversi.outcome(blocked).winner, 'd');
  const last = reversi.fromDiagram(['dddddddd', 'dddddddd', 'dddddddd', 'dddl.ddd', 'dddddddd', 'dddddddd', 'dddddddd', 'dddddddd'], 'd');
  const final = reversi.makeMove(last, reversi.findMove(last, 'e5'));
  assert.deepEqual([final.passed, Boolean(reversi.outcome(final))], [false, true], 'the last disc ends the game rather than passing');
  assert.ok(REVERSI.replay(['d3', 'c5', 'f6']).result === null && REVERSI.replay([]).result === null);
});

test('the sheet adapter places on the clicked square, keeps the count and says who passed', () => {
  const start = REVERSI.replay([]).state, moves = REVERSI.moves(start);
  assert.equal(REVERSI.dropAt(moves, reversi.squareOf('d3')).key, 'd3');
  assert.equal(REVERSI.dropAt(moves, reversi.squareOf('a1')), null);
  assert.equal(REVERSI.alert(start).text, 'Black 2 · White 2. ');
  const passed = reversi.makeMove(reversi.fromDiagram(['.llllldd', 'lllddldd', 'lldldldd', 'ldlllddd', 'lldddddd', 'lllddddd', 'lllldddd', 'ldl.dddd'], 'd'), { to: reversi.squareOf('d1'), flips: reversi.flipsFor(reversi.fromDiagram(['.llllldd', 'lllddldd', 'lldldldd', 'ldlllddd', 'lldddddd', 'lllddddd', 'lllldddd', 'ldl.dddd']).board, reversi.squareOf('d1'), 'd') });
  assert.match(REVERSI.alert(passed).text, /^White has no move\. Black \d+ · White \d+\. $/);
  const { played, result } = REVERSI.replay(['d3', 'c5', 'f6']);
  assert.deepEqual(played.map(move => move.text), ['d3', 'c5', 'f6']);
  assert.equal(result, null);
  assert.deepEqual(REVERSI.piece(start, reversi.squareOf('d4')), { side: 'l', label: 'white disc' });
});

test('the regular takes a corner, answers within its budget, and plays only legal moves', () => {
  const corner = reversi.fromDiagram(['........', '........', '........', '........', '...d....', '..l.....', '.l......', '........'], 'd');
  assert.equal(chooseMove(corner).move, 'a1');
  let state = reversi.startPosition(), slowest = 0;
  for (let ply = 0; ply < 12 && !reversi.outcome(state); ply++) {
    const started = Date.now(), choice = chooseMove(state, { budget: 6000 });
    slowest = Math.max(slowest, Date.now() - started);
    const move = reversi.findMove(state, choice.move);
    assert.ok(move, `ply ${ply}: ${choice.move} is legal`);
    state = reversi.makeMove(state, move);
  }
  assert.ok(slowest < 4000, `each reply stays bounded (${slowest} ms)`);
});
