import test from 'node:test';
import assert from 'node:assert/strict';
import { STORE, legalMoves, pitIndex, replay, sow, startGame } from '../src/mancala-rules.js';
import { chooseMove } from '../src/mancala-opponent.js';
import { seededRandom } from '../src/seeded-random.js';

const total = state => state.board.reduce((a, b) => a + b, 0);

test('the board: six pits of four a side, empty stores, side 0 to move', () => {
  const state = startGame();
  assert.equal(total(state), 48);
  assert.deepEqual([state.board[STORE[0]], state.board[STORE[1]]], [0, 0]);
  assert.deepEqual(legalMoves(state), [1, 2, 3, 4, 5, 6]);
});

test('sowing: counter-clockwise, into your own store for another turn, never the opponent’s', () => {
  let state = sow(startGame(), 3);
  assert.deepEqual(state.board.slice(0, 7), [4, 4, 0, 5, 5, 5, 1]);
  assert.equal(state.turn, 0, 'the last seed in your store: move again');
  assert.equal(state.last.again, true);
  state = sow(state, 6);
  assert.equal(state.turn, 1);
  // Thirteen seeds from side 0's pit 1 go all the way round, skipping side 1's store.
  const big = { ...startGame(), board: [13, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0] };
  const after = sow(big, 1);
  assert.equal(after.board[13], 0, 'side 1’s store is skipped');
  assert.equal(after.last.path.includes(13), false);
  assert.equal(total(after), total(big));
});

test('a last seed in your own empty pit captures it and the seeds opposite', () => {
  const state = { ...startGame(), board: [0, 2, 0, 0, 0, 0, 0, 1, 1, 7, 1, 1, 1, 0] };
  const after = sow(state, 2); // pit index 1 sows into 2 and 3; 3 was empty, opposite (9) holds 7
  assert.equal(after.last.captured, 8);
  assert.equal(after.board[STORE[0]], 8);
  assert.equal(after.board[3], 0); assert.equal(after.board[9], 0);
  // No capture when the opposite pit is empty.
  const quiet = sow({ ...state, board: [0, 2, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 0] }, 2);
  assert.equal(quiet.last.captured, 0); assert.equal(quiet.board[3], 1);
});

test('an empty side ends the game: each banks their own side, the fuller store wins; games replay', () => {
  const state = { ...startGame(), board: [0, 0, 0, 0, 0, 1, 20, 2, 0, 0, 3, 0, 0, 22], turn: 0 };
  const after = sow(state, 6);
  assert.deepEqual(after.over, { scores: [21, 27], winner: 1 });
  assert.equal(total(after), total(state));
  assert.deepEqual(legalMoves(after), []);
  const moves = ['3', '6', '2'];
  assert.deepEqual(replay(moves).state.board, moves.reduce((s, m) => sow(s, Number(m)), startGame()).board);
  assert.throws(() => sow(startGame(), 7), /Illegal/);
  assert.equal(pitIndex(1, 1), 7);
});

test('the regular takes the extra turn, plays legally, and beats a random player', () => {
  assert.equal(chooseMove(startGame()), 3, 'the opening sowing that ends in its store');
  let wins = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const random = seededRandom(Math.imul(seed, 0x9e3779b1) >>> 0);
    let state = startGame();
    while (!state.over) {
      const moves = legalMoves(state);
      const pit = state.turn === 1 ? chooseMove(state, { depth: 5 }) : moves[Math.floor(random() * moves.length)];
      assert.ok(moves.includes(pit));
      state = sow(state, pit);
    }
    assert.equal(total(state), 48);
    if (state.over.winner === 1) wins++;
  }
  assert.ok(wins >= 10, `the regular won ${wins} of 12 against random play`);
  const state = sow(startGame(), 1);
  assert.equal(chooseMove(state), chooseMove(state), 'deterministic');
});
