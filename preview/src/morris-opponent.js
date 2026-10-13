// The plaza regular at nine men's morris: negamax with alpha-beta and iterative
// deepening under a node budget, so every reply is quick and deterministic. It counts
// pieces (on the board and in hand), open two-in-a-rows that threaten a mill, and room to
// move, and takes a win or stops a mill when it sees one.
import { MILLS, NEIGHBOURS, POINTS, count, legalMoves, makeMove, other, outcome, positionKey } from './morris-rules.js';

const WIN = 100000;

// Score from the side to move's point of view.
export function evaluate(state) {
  const { board, turn } = state, them = other(turn);
  const pieces = side => count(state, side) + state.hand[side];
  let score = 120 * (pieces(turn) - pieces(them));
  for (const line of MILLS) {
    const mine = line.filter(point => board[point] === turn).length, theirs = line.filter(point => board[point] === them).length;
    if (mine === 2 && !theirs) score += 18;
    if (theirs === 2 && !mine) score -= 22;
    if (mine === 3) score += 8;
    if (theirs === 3) score -= 8;
  }
  const room = side => POINTS.reduce((total, from) => total + (board[from] === side ? NEIGHBOURS.get(from).filter(to => !board[to]).length : 0), 0);
  return score + 3 * (room(turn) - room(them));
}

// Mills first, then placements and moves toward busy lines, for good cut-offs.
const ordered = moves => moves.slice().sort((a, b) => (b.take !== null) - (a.take !== null) || a.to - b.to || (a.take ?? -1) - (b.take ?? -1));

export function chooseMove(state, { budget = 40000, maxDepth = 8, history = [] } = {}) {
  const root = ordered(legalMoves(state));
  if (!root.length) return null;
  if (root.length === 1) return { move: root[0].notation, score: 0, depth: 0 };
  let nodes = 0;
  const OUT_OF_TIME = Symbol('budget');
  const search = (position, keys, depth, alpha, beta, ply) => {
    if (++nodes > budget) throw OUT_OF_TIME;
    const ended = outcome(position, keys);
    if (ended) return ended.winner === null ? 0 : ended.winner === position.turn ? WIN - ply : -WIN + ply;
    if (depth === 0) return evaluate(position);
    let best = -Infinity;
    for (const move of ordered(legalMoves(position))) {
      const next = makeMove(position, move);
      const score = -search(next, [...keys, positionKey(next)], depth - 1, -beta, -alpha, ply + 1);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  };
  const start = history.length ? history : [positionKey(state)];
  let chosen = { move: root[0].notation, score: 0, depth: 0 };
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let best = null, bestScore = -Infinity, alpha = -Infinity;
      for (const move of root) {
        const next = makeMove(state, move);
        const score = -search(next, [...start, positionKey(next)], depth - 1, -Infinity, -alpha, 1);
        if (score > bestScore) { bestScore = score; best = move; }
        if (score > alpha) alpha = score;
      }
      chosen = { move: best.notation, score: bestScore, depth };
      if (Math.abs(bestScore) >= WIN - 64) break;
    } catch (error) {
      if (error !== OUT_OF_TIME) throw error;
      break;
    }
  }
  return chosen;
}
