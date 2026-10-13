// The plaza regular at checkers: negamax with alpha-beta and iterative deepening,
// searching on through forced captures, with a node budget so every reply is quick
// and deterministic. Material first, then advancing men, a guarded back row and the centre.
import { legalMoves, makeMove, notation, positionKey } from './checkers-rules.js';

const MAN = 100, KING = 170, WIN = 100000;

// Score from the side to move's point of view.
export function evaluate(state) {
  let score = 0;
  state.board.forEach((piece, square) => {
    if (!piece) return;
    const side = piece.toLowerCase(), sign = side === state.turn ? 1 : -1, rank = square >> 3, file = square & 7;
    let value = piece === side ? MAN : KING;
    if (piece === side) {
      const advanced = side === 'd' ? rank : 7 - rank;
      value += advanced * 4 + (advanced === 0 ? 8 : 0);
    }
    if (file >= 2 && file <= 5 && rank >= 2 && rank <= 5) value += 4;
    score += sign * value;
  });
  return score;
}

// Longer captures first.
const order = moves => moves.slice().sort((a, b) => b.captures.length - a.captures.length || (b.crowned ? 1 : 0) - (a.crowned ? 1 : 0));

export function chooseMove(state, { budget = 40000, maxDepth = 8, history = [] } = {}) {
  const root = order(legalMoves(state));
  if (!root.length) return null;
  const seen = new Set(history);
  let nodes = 0, out = false;
  const spend = () => { if (++nodes > budget) out = true; return out; };

  function search(position, depth, alpha, beta, ply) {
    if (spend()) return 0;
    if (ply > 0 && seen.has(positionKey(position))) return 0;
    const moves = legalMoves(position);
    if (!moves.length) return -WIN + ply;
    // Captures are forced, so a position with one pending is not quiet: search on.
    if (depth <= 0 && !moves[0].captures.length) return evaluate(position);
    for (const move of order(moves)) {
      const score = -search(makeMove(position, move), depth - 1, -beta, -alpha, ply + 1);
      if (out) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  let best = root[0];
  if (root.length === 1) return { move: notation(best), nodes: 0 };
  for (let depth = 1; depth <= maxDepth && !out; depth++) {
    let alpha = -Infinity, choice = null;
    for (const move of [best, ...root.filter(move => move !== best)]) {
      const score = -search(makeMove(state, move), depth - 1, -Infinity, -alpha, 1);
      if (out) break;
      if (score > alpha) { alpha = score; choice = move; }
    }
    if (!out && choice) best = choice;
    if (alpha >= WIN - 100) break;
  }
  return { move: notation(best), nodes: Math.min(nodes, budget) };
}
