// The plaza regular: a small, deterministic chess opponent. Iterative-deepening
// negamax with alpha-beta, captures searched to quiet positions, and the simplified
// piece-square evaluation (Michniewski). A node budget bounds every reply, so it
// answers in well under a second in a worker and stays beatable.
import { inCheck, legalMoves, makeMove, positionKey, uci } from './chess-rules.js';

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// White's view, a8 first; black reads the mirrored square.
const TABLE = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
const MATE = 100000;

// Score from the side to move's point of view.
export function evaluate(state) {
  let score = 0;
  state.board.forEach((piece, square) => {
    if (!piece) return;
    const type = piece.toLowerCase(), white = piece !== type;
    const index = white ? (7 - (square >> 3)) * 8 + (square & 7) : square;
    score += (white ? 1 : -1) * (VALUE[type] + TABLE[type][index]);
  });
  return state.turn === 'w' ? score : -score;
}

// Captures first, most valuable victim by least valuable attacker; then promotions.
const order = moves => moves.map(move => ({ move, rank: (move.captured ? 10 * VALUE[move.captured.toLowerCase()] - VALUE[move.piece.toLowerCase()] + 10000 : 0) + (move.promotion ? VALUE[move.promotion] : 0) }))
  .sort((a, b) => b.rank - a.rank).map(({ move }) => move);

export function chooseMove(state, { budget = 40000, maxDepth = 4, history = [] } = {}) {
  const root = order(legalMoves(state));
  if (!root.length) return null;
  const seen = new Set(history);
  let nodes = 0, out = false;
  const spend = () => { if (++nodes > budget) out = true; return out; };

  function quiet(position, alpha, beta) {
    if (spend()) return 0;
    const standing = evaluate(position);
    if (standing >= beta) return beta;
    if (standing > alpha) alpha = standing;
    for (const move of order(legalMoves(position).filter(move => move.captured || move.promotion))) {
      const score = -quiet(makeMove(position, move), -beta, -alpha);
      if (out) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function search(position, depth, alpha, beta, ply) {
    if (spend()) return 0;
    // Steering back into a position already played counts as a draw.
    if (ply > 0 && seen.has(positionKey(position))) return 0;
    if (position.halfmove >= 100) return 0;
    const moves = legalMoves(position);
    if (!moves.length) return inCheck(position) ? -MATE + ply : 0;
    if (depth === 0) return quiet(position, alpha, beta);
    for (const move of order(moves)) {
      const score = -search(makeMove(position, move), depth - 1, -beta, -alpha, ply + 1);
      if (out) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  // Each completed depth replaces the answer; the deepest finished search wins.
  let best = root[0];
  for (let depth = 1; depth <= maxDepth && !out; depth++) {
    let alpha = -Infinity, choice = null;
    // Search the previous best first, so a cut-off depth still improves on it.
    for (const move of [best, ...root.filter(move => move !== best)]) {
      const score = -search(makeMove(state, move), depth - 1, -Infinity, -alpha, 1);
      if (out) break;
      if (score > alpha) { alpha = score; choice = move; }
    }
    if (!out && choice) best = choice;
    if (alpha >= MATE - 100) break;
  }
  return { move: uci(best), nodes: Math.min(nodes, budget) };
}
