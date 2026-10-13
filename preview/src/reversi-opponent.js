// The plaza regular at Reversi: negamax with alpha-beta and iterative deepening under a
// node budget, so every reply is quick and deterministic. It values corners and edges,
// avoids the squares that hand a corner away, prefers keeping its own choices open
// (mobility), and near the end counts discs exactly.
import { SIZE, count, legalMoves, makeMove, mobility, other } from './reversi-rules.js';

const WIN = 100000;
// A square's worth to whoever holds it: corners most, the squares beside an empty
// corner least.
const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];
const CORNERS = [0, 7, 56, 63];
// Once a corner is taken, the squares beside it are no longer a gift.
const NEXT_TO = { 0: [1, 8, 9], 7: [6, 14, 15], 56: [48, 49, 57], 63: [54, 55, 62] };

// Score from the side to move's point of view.
export function evaluate(state) {
  const { board, turn } = state, them = other(turn);
  let score = 0;
  for (let square = 0; square < SIZE * SIZE; square++) {
    if (!board[square]) continue;
    let weight = WEIGHTS[square];
    for (const corner of CORNERS) if (board[corner] && NEXT_TO[corner].includes(square)) weight = 5;
    score += board[square] === turn ? weight : -weight;
  }
  const mine = mobility(board, turn), theirs = mobility(board, them);
  return score + 8 * (mine - theirs);
}

// The final count, as a win or loss scaled by the margin.
const final = (state, side) => {
  const margin = count(state.board, side) - count(state.board, other(side));
  return margin > 0 ? WIN + margin : margin < 0 ? -WIN + margin : 0;
};
// Corners first, then the move's square weight, for good cut-offs.
const ordered = moves => moves.slice().sort((a, b) => WEIGHTS[b.to] - WEIGHTS[a.to] || a.to - b.to);

export function chooseMove(state, { budget = 60000, maxDepth = 10 } = {}) {
  const root = ordered(legalMoves(state));
  if (!root.length) return null;
  if (root.length === 1) return { move: root[0].notation, score: 0, depth: 0 };
  let nodes = 0;
  const OUT_OF_TIME = Symbol('budget');
  // A pass keeps the turn with the same side (makeMove), so the sign flips only when the
  // turn really changes.
  const search = (position, depth, alpha, beta) => {
    if (++nodes > budget) throw OUT_OF_TIME;
    const moves = legalMoves(position);
    if (!moves.length) return final(position, position.turn);
    if (depth === 0) return evaluate(position);
    let best = -Infinity;
    for (const move of ordered(moves)) {
      const next = makeMove(position, move), same = next.turn === position.turn;
      const score = same ? search(next, depth - 1, alpha, beta) : -search(next, depth - 1, -beta, -alpha);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  };
  let chosen = { move: root[0].notation, score: 0, depth: 0 };
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let best = null, bestScore = -Infinity, alpha = -Infinity;
      for (const move of root) {
        const next = makeMove(state, move);
        const score = next.turn === state.turn ? search(next, depth - 1, alpha, Infinity) : -search(next, depth - 1, -Infinity, -alpha);
        if (score > bestScore) { bestScore = score; best = move; }
        if (score > alpha) alpha = score;
      }
      chosen = { move: best.notation, score: bestScore, depth };
      if (Math.abs(bestScore) >= WIN) break;
    } catch (error) {
      if (error !== OUT_OF_TIME) throw error;
      break;
    }
  }
  return chosen;
}
