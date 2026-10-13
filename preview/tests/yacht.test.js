import test from 'node:test';
import assert from 'node:assert/strict';
import { BOXES, ROLLS, legalMoves, play, replay, scoreFor, startGame, totalOf } from '../src/yacht-rules.js';
import { chooseMove } from '../src/yacht-opponent.js';

test('every box scores the classic way', () => {
  assert.equal(scoreFor('threes', [3, 3, 1, 3, 6]), 9);
  assert.equal(scoreFor('sixes', [1, 2, 3, 4, 5]), 0);
  assert.equal(scoreFor('fullHouse', [2, 2, 5, 5, 5]), 19);
  assert.equal(scoreFor('fullHouse', [5, 5, 5, 5, 5]), 0, 'five alike is not three and two');
  assert.equal(scoreFor('fourKind', [4, 4, 4, 4, 1]), 16, 'the four, not the odd die');
  assert.equal(scoreFor('fourKind', [6, 6, 6, 6, 6]), 24);
  assert.equal(scoreFor('fourKind', [6, 6, 6, 1, 1]), 0);
  assert.equal(scoreFor('littleStraight', [5, 3, 1, 2, 4]), 30);
  assert.equal(scoreFor('littleStraight', [2, 3, 4, 5, 6]), 0);
  assert.equal(scoreFor('bigStraight', [6, 2, 4, 3, 5]), 30);
  assert.equal(scoreFor('choice', [6, 2, 4, 3, 5]), 20);
  assert.equal(scoreFor('yacht', [2, 2, 2, 2, 2]), 50);
  assert.equal(scoreFor('yacht', [2, 2, 2, 2, 3]), 0);
  assert.equal(BOXES.length, 12);
});

test('a turn: roll, up to two rerolls keeping marked dice, then a box; the next player goes', () => {
  let state = startGame(7, 2);
  assert.deepEqual(legalMoves(state), ['roll']);
  assert.throws(() => play(state, 'score:choice'), /Roll first/);
  state = play(state, 'roll');
  const first = state.dice.slice();
  assert.equal(first.length, 5);
  assert.ok(first.every(die => die >= 1 && die <= 6));
  state = play(state, 'roll:10100');
  assert.equal(state.dice[0], first[0]); assert.equal(state.dice[2], first[2]);
  assert.throws(() => play(state, 'roll:11111'), /not a roll/);
  state = play(state, 'roll:00000');
  assert.equal(state.rolls, ROLLS);
  assert.ok(!legalMoves(state).some(move => move.startsWith('roll')), 'no fourth roll');
  const dice = state.dice;
  state = play(state, 'score:choice');
  assert.deepEqual(state.sheets[0], { choice: dice.reduce((a, b) => a + b, 0) });
  assert.equal(state.turn, 1); assert.equal(state.rolls, 0); assert.equal(state.dice, null);
  state = play(play(state, 'roll'), 'score:yacht');
  assert.equal(state.turn, 0);
  assert.throws(() => play(play(state, 'roll'), 'score:choice'), /not open/, 'a box is used once');
});

test('the same seed and moves replay the same dice; another turn rolls differently', () => {
  const moves = ['roll', 'roll:11000', 'score:ones', 'roll', 'score:twos'];
  assert.deepEqual(replay(3, moves).state, replay(3, moves).state);
  assert.notDeepEqual(play(startGame(3), 'roll').dice, play({ ...startGame(3), turns: 1 }, 'roll').dice);
  // Large seeds still mix the turn in (Math.imul, not a float product).
  const big = 2 ** 32 - 1, dice = new Set(Array.from({ length: 6 }, (_, turns) => play({ ...startGame(big), turns }, 'roll').dice.join()));
  assert.ok(dice.size > 3, `${dice.size} different rolls`);
});

test('regulars fill all twelve boxes each and the best total wins', () => {
  const all = [];
  for (const seed of [1, 2, 3, 2 ** 31, 2 ** 32 - 1]) {
    let state = startGame(seed, 3), moves = 0;
    while (!state.winners) { state = play(state, chooseMove(state)); moves++; assert.ok(moves < 3 * 12 * 4, 'the game ends'); }
    const totals = state.sheets.map(totalOf);
    assert.ok(state.sheets.every(sheet => Object.keys(sheet).length === 12));
    assert.ok(state.winners.every(player => totals[player] === Math.max(...totals)));
    all.push(...totals);
  }
  // Over 200 games a regular's median is about 157 (p10 112, p90 210).
  assert.ok(all.reduce((a, b) => a + b, 0) / all.length > 120, `regulars score sensibly (${all})`);
});

test('the regulars keep a made yacht and chase a near one', () => {
  const state = { ...play(startGame(1), 'roll'), dice: [4, 4, 4, 4, 4] };
  assert.equal(chooseMove(state), 'score:yacht');
  const near = { ...play(startGame(1), 'roll'), dice: [6, 6, 6, 6, 2] };
  assert.equal(chooseMove(near), 'roll:11110');
  // On the last roll, junk goes where it costs least.
  const last = { ...play(startGame(1), 'roll'), dice: [1, 1, 2, 3, 6], rolls: ROLLS };
  assert.equal(chooseMove(last), 'score:ones');
});
