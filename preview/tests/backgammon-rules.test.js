import test from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, checkersOf, fromPosition, legalMoves, move, notation, openingRoll, pips, replay, rollFor, startGame } from '../src/backgammon-rules.js';

const moves = state => legalMoves(state).map(notation).sort();
const position = fromPosition;

test('the opening: fifteen checkers each, 167 pips each, and a roll that decides who starts', () => {
  const state = startGame(11);
  assert.equal(checkersOf(state, WHITE), 15); assert.equal(checkersOf(state, BLACK), 15);
  assert.equal(pips(state, WHITE), 167); assert.equal(pips(state, BLACK), 167);
  const { first, dice } = openingRoll(11);
  assert.notEqual(dice[0], dice[1]);
  assert.equal(first, dice[0] > dice[1] ? WHITE : BLACK);
  assert.deepEqual(state.rolled, dice, 'the first player plays the opening dice');
  assert.deepEqual(startGame(11), state, 'a seed always starts the same way');
  for (let turn = 1; turn < 30; turn++) { const roll = rollFor(11, turn); assert.ok(roll.length === 2 || (roll.length === 4 && roll.every(value => value === roll[0]))); }
});

test('both dice when possible; when only one can be used, the higher; doubles move four times', () => {
  // From 24 a 6 reaches 18 and a 5 reaches 19, but black holds 13, so neither can go on:
  // only one die can be used, and it must be the higher.
  assert.deepEqual(moves(position({ 24: 1, 13: -2 }, { dice: [6, 5], off: [14, 0] })), ['24-18']);
  // With 18 closed too, the 6 cannot be used at all, so the 5 may be.
  assert.deepEqual(moves(position({ 24: 1, 13: -2, 18: -2 }, { dice: [6, 5], off: [14, 0] })), ['24-19']);
  // With the way clear, both dice are played, in either order.
  const both = position({ 24: 1 }, { dice: [6, 5], off: [14, 0] });
  assert.deepEqual(moves(both), ['24-18', '24-19']);
  const half = move(both, { from: 24, to: 18, die: 6 });
  assert.equal(half.turn, WHITE, 'the turn waits for the second die');
  assert.deepEqual(moves(half), ['18-13']);
  // Doubles: four moves of the same number.
  let doubles = position({ 24: 2, 1: -15 }, { dice: [2, 2, 2, 2], off: [13, 0] });
  for (let i = 0; i < 4; i++) { assert.equal(doubles.turn, WHITE); doubles = move(doubles, legalMoves(doubles)[0]); }
  assert.equal(doubles.turn, BLACK, 'after four moves the turn passes');
});

test('a checker on the bar enters first; a closed home board shuts it out', () => {
  const entering = position({ 6: 2, 13: 3 }, { bar: [1, 0], dice: [4, 2] });
  assert.ok(moves(entering).every(text => text.startsWith('bar-')), 'only entry moves while on the bar');
  assert.deepEqual(moves(entering), ['bar-21', 'bar-23']);
  const shut = position({ 19: -2, 20: -2, 21: -2, 22: -2, 23: -2, 24: -2, 6: 2 }, { bar: [1, 0], dice: [4, 2] });
  assert.deepEqual(moves(shut), []);
});

test('hitting a blot sends it to the bar', () => {
  const state = position({ 13: 2, 10: -1, 6: 2 }, { dice: [3, 1] });
  const after = move(state, { from: 13, to: 10, die: 3 });
  assert.equal(after.bar[BLACK], 1);
  assert.equal(after.points[10], 1);
});

test('bearing off: exact numbers, and a higher die from the farthest point', () => {
  // 6-2 with checkers on 5 and 3: the 6 bears off from 5 (the farthest point held),
  // never from 3 while 5 is occupied; the 2 moves 5-3 or 3-1.
  const home = position({ 5: 1, 3: 2, 24: -15 }, { dice: [6, 2], off: [12, 0] });
  assert.deepEqual(moves(home), ['3-1', '5-3', '5-off']);
  const afterTwo = move(home, { from: 5, to: 3, die: 2 });
  assert.deepEqual(moves(afterTwo), ['3-off'], 'with 5 emptied, the 6 bears off from 3');
  const notYet = position({ 8: 1, 3: 2 }, { dice: [6, 3], off: [12, 0] });
  assert.ok(!moves(notYet).some(text => text.endsWith('off')), 'not every checker is home yet');
});

test('a win scores 1, a gammon 2, a backgammon 3', () => {
  const single = move(position({ 1: 1, 24: -1 }, { dice: [2, 1], off: [14, 3] }), { from: 1, to: 'off', die: 2 });
  assert.deepEqual(single.over, { winner: WHITE, points: 1, kind: 'single' });
  const gammon = move(position({ 1: 1, 13: -15 }, { dice: [2, 1], off: [14, 0] }), { from: 1, to: 'off', die: 2 });
  assert.equal(gammon.over.kind, 'gammon');
  const backgammon = move(position({ 1: 1, 4: -1, 13: -14 }, { dice: [2, 1], off: [14, 0] }), { from: 1, to: 'off', die: 2 });
  assert.deepEqual(backgammon.over, { winner: WHITE, points: 3, kind: 'backgammon' });
});

test('games replay exactly from their seed and moves, keep every checker, and always end', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let state = startGame(seed);
    const record = [];
    for (let guard = 0; !state.over && guard < 3000; guard++) {
      const options = legalMoves(state), step = options[(seed + guard) % options.length];
      record.push(notation(step)); state = move(state, step);
      assert.equal(checkersOf(state, WHITE) + checkersOf(state, BLACK), 30);
    }
    assert.ok(state.over, `seed ${seed} ends`);
    assert.deepEqual(replay(seed, record).state.over, state.over);
  }
  assert.throws(() => replay(3, ['1-off']), /Illegal move/);
});
