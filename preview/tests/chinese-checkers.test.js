import test from 'node:test';
import assert from 'node:assert/strict';
import { GOAL, HOLES, HOME, MAX_PLIES, NEIGHBOURS, holeAt, homeCount, legalMoves, movesFrom, play, replay, rowsToGo, startGame } from '../src/chinese-checkers-rules.js';
import { chooseMove } from '../src/chinese-checkers-opponent.js';

const empty = () => Array(HOLES.length).fill(null);

test('the star: 121 holes, a centre of 61 and six points of ten; each player starts in the point opposite their goal', () => {
  assert.equal(HOLES.length, 121);
  assert.equal(HOLES.filter(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4).length, 61);
  assert.deepEqual(HOME.map(point => point.length), [10, 10]);
  assert.deepEqual(GOAL, [HOME[1], HOME[0]]);
  assert.equal(holeAt(-4, 8), HOME[0].find(hole => rowsToGo(1, hole) === 0), 'the first player’s tip is the second’s goal tip');
  assert.equal(GOAL[0].find(hole => rowsToGo(0, hole) === 0), holeAt(4, -8));
  const state = startGame();
  assert.equal(state.board.filter(owner => owner === 0).length, 10);
  assert.ok(HOME[0].every(hole => state.board[hole] === 0) && HOME[1].every(hole => state.board[hole] === 1));
  assert.ok(NEIGHBOURS.every(list => list.filter(hole => hole >= 0).length >= 2), 'every hole has neighbours');
});

test('a step to a neighbouring empty hole, or a chain of hops over marbles to the empty hole beyond', () => {
  const board = empty(), at = (q, r) => holeAt(q, r);
  board[at(0, 0)] = 0; board[at(0, -1)] = 1; board[at(0, -3)] = 0; board[at(1, 0)] = 1;
  const moves = movesFrom(board, at(0, 0)), to = new Map(moves.map(move => [move.to, move.path]));
  assert.deepEqual(to.get(at(-1, 0)), [at(0, 0), at(-1, 0)], 'a step');
  assert.ok(!to.has(at(0, -1)), 'not onto a marble');
  assert.deepEqual(to.get(at(0, -2)), [at(0, 0), at(0, -2)], 'a hop over a marble');
  assert.deepEqual(to.get(at(0, -4)), [at(0, 0), at(0, -2), at(0, -4)], 'and on over the next');
  assert.deepEqual(to.get(at(2, 0)), [at(0, 0), at(2, 0)], 'over either colour');
  assert.ok(!to.has(at(0, -6)), 'not over an empty hole');
  // The hopping marble has left its hole: a chain may not hop back over it.
  const ring = empty(); ring[at(0, 0)] = 0; ring[at(1, 0)] = 1; ring[at(2, -1)] = 1;
  assert.ok(movesFrom(ring, at(0, 0)).every(move => move.path.slice(1).every(hole => hole !== at(0, 0))), 'never lands on its own start');
});

test('moves are checked: hops must jump a marble, and a step is one hole', () => {
  let state = startGame();
  const opening = legalMoves(state);
  assert.ok(opening.length > 0 && opening.every(move => state.board[move.path[0]] === 0));
  assert.throws(() => play(state, `${HOME[1][0]}-${holeAt(0, 0)}`), /No marble of yours/);
  const front = HOME[0].find(hole => HOLES[hole][1] === 5 && HOLES[hole][0] === -1), ahead = holeAt(-1, 4), far = holeAt(-1, 3);
  assert.throws(() => play(state, `${front}-${far}`), /Illegal/, 'two holes without a marble between');
  state = play(state, `${front}-${ahead}`);
  assert.equal(state.board[ahead], 0); assert.equal(state.turn, 1);
});

test('filling the opposite point wins, counting the other player’s stragglers if one of yours is there', () => {
  const board = empty();
  GOAL[0].forEach(hole => { board[hole] = 0; });
  // The last hole to fill is on the goal's outer row, entered by a step from the centre.
  const last = GOAL[0].find(hole => HOLES[hole][1] === -5), below = NEIGHBOURS[last].find(hole => hole >= 0 && !GOAL[0].includes(hole));
  board[last] = null;
  board[below] = 0;
  HOME[0].forEach(hole => { board[hole] = 1; });
  const won = play({ ...startGame(), board, turn: 0 }, `${below}-${last}`);
  assert.equal(won.winner, 0);
  // A straggler of the other player's in the goal still lets the point fill.
  const spoiled = board.slice(); spoiled[GOAL[0][0]] = 1;
  const free = HOME[0].find(hole => spoiled[hole] === 1); spoiled[free] = null;
  assert.equal(play({ ...startGame(), board: spoiled, turn: 0 }, `${below}-${last}`).winner, 0);
  assert.equal(homeCount(won.board, 0), 10);
});

test('games replay from their moves, and two regulars race to a finish', () => {
  for (const seed of [1, 2, 3, 2 ** 32 - 1]) {
    let state = startGame();
    const moves = [];
    while (state.winner === null && !state.draw) { const move = chooseMove(state, seed); moves.push(move); state = play(state, move); }
    assert.ok(state.winner !== null && state.plies < MAX_PLIES / 2, `seed ${seed}: a winner in ${state.plies} moves`);
    assert.deepEqual(replay(moves).state, state);
  }
});
