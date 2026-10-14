// The plaza regular at xiangqi: iterative-deepening negamax with alpha-beta, captures
// searched on to quiet positions, and a small evaluation (material; soldiers worth more
// across the river and as they close in; horses and cannons a little better toward the
// middle). A node budget bounds every reply, so it answers in about a second in a worker
// and stays beatable. Deterministic: the same position gets the same reply.
import { VALUE, inCheck, legalMoves, makeMove, notation, positionKey, sideOf } from './xiangqi-rules.js';

const MATE = 100000;
const rankOf = index => Math.floor(index / 9), fileOf = index => index % 9;

// Score from the side to move's point of view.
export function evaluate(state) {
  let score = 0;
  state.board.forEach((piece, index) => {
    if (!piece) return;
    const type = piece.toLowerCase(), side = sideOf(piece), sign = side === 'r' ? 1 : -1;
    const advance = side === 'r' ? rankOf(index) : 9 - rankOf(index), centre = 4 - Math.abs(fileOf(index) - 4);
    let value = VALUE[type];
    if (type === 'p') value += advance >= 5 ? 90 + (advance - 5) * 12 + centre * 6 : 0;
    if (type === 'h' || type === 'c') value += centre * 6 + Math.min(advance, 6) * 4;
    if (type === 'r') value += Math.min(advance, 7) * 3;
    score += sign * value;
  });
  return state.turn === 'r' ? score : -score;
}

const order = moves => moves.map(move => ({ move, rank: move.captured ? 10 * (VALUE[move.captured.toLowerCase()] || 2000) - VALUE[move.piece.toLowerCase()] + 10000 : 0 }))
  .sort((a, b) => b.rank - a.rank).map(({ move }) => move);

export function chooseMove(state, { budget = 30000, history = [] } = {}) {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  let nodes = 0, best = order(moves)[0];
  const seen = new Set(history);
  const out = () => nodes > budget;

  function quiesce(position, alpha, beta) {
    nodes++;
    const stand = evaluate(position);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    for (const move of order(legalMoves(position).filter(option => option.captured))) {
      if (out()) break;
      const score = -quiesce(makeMove(position, move), -beta, -alpha);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function search(position, depth, alpha, beta, ply) {
    nodes++;
    const replies = legalMoves(position);
    // No legal move loses, in check or not.
    if (!replies.length) return -MATE + ply;
    if (ply > 0 && seen.has(positionKey(position))) return 0;
    if (depth <= 0) return quiesce(position, alpha, beta);
    for (const move of order(replies)) {
      if (out()) break;
      const child = makeMove(position, move), extend = inCheck(child.board, child.turn) ? 1 : 0;
      const score = -search(child, depth - 1 + (ply < 4 ? extend : 0), -beta, -alpha, ply + 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  for (let depth = 1; depth <= 6 && !out(); depth++) {
    let alpha = -Infinity, bestHere = null;
    // Search the last depth's best first.
    for (const move of [best, ...order(moves).filter(option => option !== best)]) {
      const score = -search(makeMove(state, move), depth - 1, -Infinity, -alpha, 1);
      if (out() && bestHere) break;
      if (score > alpha) { alpha = score; bestHere = move; }
    }
    if (bestHere && (!out() || depth === 1)) best = bestHere;
    if (alpha >= MATE - 100) break;
  }
  return notation(best);
}
