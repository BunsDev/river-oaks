import test from 'node:test';
import assert from 'node:assert/strict';
import { KOMI, SIZE, areaScore, group, isLegal, legalMoves, play, pointName, pointOf, replay, startGame } from '../src/go-rules.js';
import { chooseMove } from '../src/go-opponent.js';

// A position from a diagram: rows from 9 down to 1, '.' empty, 'b'/'w' stones.
const position = (rows, turn = 'b') => {
  const board = rows.slice().reverse().flatMap(row => [...row].map(c => (c === '.' ? '' : c)));
  return { ...startGame(), turn, board, seen: [board.map(stone => stone || '.').join('')] };
};
const at = name => pointOf(name);

test('points are named a–j without i, rows 1–9', () => {
  assert.equal(pointName(0), 'a1'); assert.equal(pointName(80), 'j9'); assert.equal(pointOf('e5'), 40); assert.equal(pointOf('i3'), -1);
  assert.equal(legalMoves(startGame()).length, SIZE * SIZE);
});

test('a group with no liberties is captured; suicide is not allowed unless it captures', () => {
  // White's a1 stone has one liberty, a2: black plays there and takes it.
  const atari = position(['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', 'wb.......']);
  const captured = play(atari, at('a2'));
  assert.equal(captured.board[at('a1')], '', 'the white stone is taken'); assert.equal(captured.captures.b, 1);
  // Suicide: white may not play into a point with no liberties that captures nothing.
  const eye = position(['.........', '.........', '.........', '.........', '.........', '.........', '.........', 'b........', '.b.......'], 'w');
  assert.equal(isLegal(eye, at('a1')), false);
  assert.throws(() => play(eye, at('a1')), /Illegal/);
});

test('ko: the immediate recapture is refused (positional superko)', () => {
  // A classic ko on b2/c2: black takes the white stone at b2 by playing c2.
  let state = position(['.........', '.........', '.........', '.........', '.........', '.........', '.bw......', 'bw.w.....', '.bw......'], 'b');
  state = play(state, at('c2')); // black takes white b2
  assert.equal(state.board[at('b2')], '', 'black captured the stone at b2');
  assert.equal(isLegal(state, at('b2')), false, 'white may not retake at once');
  state = play(state, at('h8')); state = play(state, at('h7'));
  assert.equal(isLegal(state, at('b2')), true, 'after an exchange elsewhere, the ko can be retaken');
});

test('two passes end the game; area scoring with 7.5 komi', () => {
  const state = position(['....bw...', '....bw...', '....bw...', '....bw...', '....bw...', '....bw...', '....bw...', '....bw...', '....bw...']);
  const score = areaScore(state.board);
  assert.deepEqual(score, { b: 45, w: 36 + KOMI });
  const over = play(play(state, 'pass'), 'pass');
  assert.deepEqual(over.over, { score, winner: 'b', margin: 45 - 36 - KOMI });
  assert.deepEqual(legalMoves(over), []);
  assert.deepEqual(replay(['e5', 'd4', 'pass', 'c3']).state.board[at('c3')], 'w');
  assert.equal(group(play(startGame(), at('e5')).board, at('e5')).liberties.size, 4);
});

test('the regular captures a stone in atari, takes a won pass, and replies the same way each time', () => {
  // White's c2 stone has one liberty left, at d2.
  const atari = position(['.........', '.........', '.........', '.........', '.........', '.........', '..b......', '.bw......', '..b......']);
  const move = chooseMove(atari, { budget: 240 });
  assert.equal(pointName(move), 'd2', `black captures (played ${typeof move === 'number' ? pointName(move) : move})`);
  assert.equal(chooseMove(atari, { budget: 240 }), move, 'deterministic');
  const won = { ...position(['bbbbb....', 'bbbbb....', 'bbbbb....', 'bbbbb....', 'bbbbb....', 'bbbbb....', 'bbbbb....', 'bbbbb....', 'bbbbb....']), passes: 1 };
  assert.equal(chooseMove(won, { budget: 60 }), 'pass', 'ahead after your pass: it passes too');
  const legal = chooseMove(startGame(), { budget: 120 });
  assert.ok(typeof legal === 'number' && isLegal(startGame(), legal));
});
