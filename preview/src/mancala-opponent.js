// The plaza regular at mancala: a look-ahead (alpha-beta) over its own sowings and
// yours, valuing a position by the difference between the stores and, more lightly,
// the seeds still on each side. Extra turns are searched as the same player's move.
// Deterministic: moves that earn another turn are tried (and win ties) first, then
// the pits nearest the store. `depth` sets its strength.
import { STORE, legalMoves, pitIndex, sow } from './mancala-rules.js';

// A sowing that ends in the mover's own store earns another turn: try those first.
const ordered = state => {
  const pits = legalMoves(state).reverse();
  const again = pit => (pitIndex(state.turn, pit) + state.board[pitIndex(state.turn, pit)]) % 13 === STORE[state.turn] % 13 && state.board[pitIndex(state.turn, pit)] < 13;
  return [...pits.filter(again), ...pits.filter(pit => !again(pit))];
};

const value = (state, side) => {
  if (state.over) return state.over.winner === null ? 0 : (state.over.winner === side ? 1000 : -1000) + (state.over.scores[side] - state.over.scores[1 - side]);
  const mine = state.board.slice(side * 7, side * 7 + 6).reduce((a, b) => a + b, 0), theirs = state.board.slice((1 - side) * 7, (1 - side) * 7 + 6).reduce((a, b) => a + b, 0);
  return (state.board[STORE[side]] - state.board[STORE[1 - side]]) * 4 + (mine - theirs);
};

function search(state, side, depth, alpha, beta) {
  if (depth === 0 || state.over) return value(state, side);
  const moves = ordered(state);
  if (state.turn === side) {
    let best = -Infinity;
    for (const pit of moves) { best = Math.max(best, search(sow(state, pit), side, depth - 1, alpha, beta)); alpha = Math.max(alpha, best); if (alpha >= beta) break; }
    return best;
  }
  let best = Infinity;
  for (const pit of moves) { best = Math.min(best, search(sow(state, pit), side, depth - 1, alpha, beta)); beta = Math.min(beta, best); if (alpha >= beta) break; }
  return best;
}

export function chooseMove(state, { depth = 6 } = {}) {
  const side = state.turn;
  let best = null, bestValue = -Infinity;
  for (const pit of ordered(state)) {
    const score = search(sow(state, pit), side, depth - 1, -Infinity, Infinity);
    if (score > bestValue) { bestValue = score; best = pit; }
  }
  return best;
}
