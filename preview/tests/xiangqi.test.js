import test from 'node:test';
import assert from 'node:assert/strict';
import { inCheck, legalMoves, notation, play, pointOf, replay, startGame } from '../src/xiangqi-rules.js';
import { chooseMove } from '../src/xiangqi-opponent.js';

// A position from { point: piece } (red upper case) over the two generals on e0 and e9;
// a null removes one. Most positions put a red soldier on e3 so the generals don't face.
const position = (pieces, turn = 'r') => {
  const board = Array(90).fill(null);
  for (const [name, piece] of Object.entries({ e0: 'K', e9: 'k', ...pieces })) board[pointOf(name)] = piece;
  return { ...startGame(), board, turn, seen: {} };
};
const targets = (state, from) => legalMoves(state).filter(move => move.from === pointOf(from)).map(move => notation(move).slice(2)).sort();
// Red's cannon slides to e5 and mates over the soldier on e8: the advisors fill the
// general's sides, the soldier covers d8 and f8, the chariot on a8 guards the soldier.
const MATE = { a5: 'C', e8: 'P', a8: 'R', d9: 'a', f9: 'a' };

test('the opening: sixteen pieces a side and 44 moves for red', () => {
  const state = startGame();
  assert.equal(state.board.filter(Boolean).length, 32);
  assert.equal(state.board[pointOf('e0')], 'K'); assert.equal(state.board[pointOf('b2')], 'C'); assert.equal(state.board[pointOf('i6')], 'p');
  assert.equal(legalMoves(state).length, 44);
  assert.deepEqual(targets(state, 'b2'), ['a2', 'b1', 'b3', 'b4', 'b5', 'b6', 'b9', 'c2', 'd2', 'e2', 'f2', 'g2'], 'the cannon slides, and takes the horse over the screen');
});

test('horses are hobbled, elephants blocked at the eye and kept home, soldiers turn aside over the river', () => {
  assert.deepEqual(targets(position({ e3: 'P', e4: 'H', e5: 'P' }), 'e4'), ['c3', 'c5', 'g3', 'g5'], 'pieces on the legs above and below stop the horse that way');
  assert.deepEqual(targets(position({ e3: 'P', c4: 'E', d3: 'P' }), 'c4'), ['a2'], 'the eye on d3 blocks e2; a6 and e6 are across the river');
  assert.deepEqual(targets(position({ e3: 'P', a6: 'P' }), 'a6'), ['a7', 'b6'], 'across the river, forward or aside');
  assert.deepEqual(targets(position({ e3: 'P', c3: 'P' }), 'c3'), ['c4'], 'at home, forward only');
});

test('generals and advisors keep to the palace; the generals may not face each other', () => {
  assert.deepEqual(targets(position({ e1: 'A' }), 'e0'), ['d0', 'f0'], 'the general steps within its palace');
  assert.deepEqual(targets(position({ d0: 'A' }), 'd0'), ['e1'], 'an advisor keeps to the palace diagonals, here blocking the facing generals');
  assert.deepEqual(targets(position({ e4: 'H' }), 'e4'), [], 'the only piece between the generals may not leave the file');
  assert.ok(inCheck(position({}).board, 'r'), 'facing generals count as check');
});

test('cannons capture over exactly one screen; checks must be answered; checkmate and stalemate both lose', () => {
  const cannon = position({ e3: 'P', a0: 'C', a4: 'p', a7: 'r' });
  assert.ok(targets(cannon, 'a0').includes('a7') && !targets(cannon, 'a0').includes('a4'), 'over the screen, not onto it');
  const checked = position({ e5: 'r', a1: 'R' });
  assert.ok(inCheck(checked.board, 'r'));
  assert.deepEqual(legalMoves(checked).map(notation).sort(), ['a1e1', 'e0d0', 'e0f0'], 'block on the file or step aside');
  const mate = play(position(MATE), 'a5e5');
  assert.equal(mate.winner, 'r'); assert.equal(mate.mate, true);
  const stalemate = play(position({ e9: null, d9: 'k', a8: 'R', e6: 'R' }), 'e6e7');
  assert.equal(stalemate.winner, 'r', 'no move at all loses'); assert.equal(stalemate.mate, false);
});

test('games replay exactly; the same position three times is a draw', () => {
  const moves = ['h2e2', 'h9g7', 'h0g2', 'i9h9'];
  assert.deepEqual(replay(moves).state.board, replay(moves).state.board);
  assert.throws(() => replay(['e3e4', 'e6e5', 'e4e5', 'h9g8']), /Illegal/);
  let state = startGame();
  for (let i = 0; i < 2; i++) for (const move of ['h0g2', 'h9g7', 'g2h0', 'g7h9']) state = play(state, move);
  assert.equal(state.draw, true);
});

test('the regular takes a hanging chariot, finds a mate in one, and answers deterministically', () => {
  assert.equal(chooseMove(position({ e3: 'P', c4: 'R', c7: 'r' }, 'b'), { budget: 4000 }), 'c7c4');
  const reply = chooseMove(position(MATE), { budget: 4000 });
  assert.equal(play(position(MATE), reply).mate, true, `mates in one (${reply})`);
  const start = startGame(), first = chooseMove(start, { budget: 3000 });
  assert.equal(chooseMove(start, { budget: 3000 }), first);
  assert.ok(legalMoves(start).some(move => notation(move) === first));
});
