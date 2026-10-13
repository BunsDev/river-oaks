// The plaza regular at Connect Four: negamax with alpha-beta and iterative deepening,
// centre columns first, with a node budget so every reply is quick and deterministic.
// It scores every window of four by how many of one side's discs it holds with the
// rest empty, and prefers a faster win and a slower loss.
import { COLUMNS, ROWS, legalMoves, makeMove, winningLine } from './connect-four-rules.js';

const WIN = 100000;
const CENTRE_FIRST = [3, 2, 4, 1, 5, 0, 6];
const WINDOW_SCORE = [0, 1, 6, 40];

// Score from the side to move's point of view.
export function evaluate(state) {
  const { board, turn } = state;
  let score = 0;
  for (let row = 0; row < ROWS; row++) for (let column = 0; column < COLUMNS; column++) {
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const endC = column + dc * 3, endR = row + dr * 3;
      if (endC >= COLUMNS || endR < 0 || endR >= ROWS) continue;
      let mine = 0, theirs = 0;
      for (let step = 0; step < 4; step++) {
        const disc = board[(row + dr * step) * COLUMNS + column + dc * step];
        if (disc === turn) mine++; else if (disc) theirs++;
      }
      if (!theirs) score += WINDOW_SCORE[mine] ?? 0;
      else if (!mine) score -= WINDOW_SCORE[theirs] ?? 0;
    }
  }
  // A disc in the centre column joins the most lines.
  for (let row = 0; row < ROWS; row++) {
    const disc = board[row * COLUMNS + 3];
    if (disc) score += disc === turn ? 3 : -3;
  }
  return score;
}

const ordered = moves => moves.slice().sort((a, b) => CENTRE_FIRST.indexOf(a.column) - CENTRE_FIRST.indexOf(b.column));

export function chooseMove(state, { budget = 60000, maxDepth = 9 } = {}) {
  const root = ordered(legalMoves(state));
  if (!root.length) return null;
  // A winning drop is played at once.
  for (const move of root) if (winningLine(makeMove(state, move).board)) return { move: move.notation, score: WIN, depth: 1 };
  let nodes = 0;
  const OUT_OF_TIME = Symbol('budget');
  const search = (position, depth, alpha, beta, ply) => {
    if (++nodes > budget) throw OUT_OF_TIME;
    if (winningLine(position.board)) return -WIN + ply;
    const moves = legalMoves(position);
    if (!moves.length) return 0;
    if (depth === 0) return evaluate(position);
    let best = -Infinity;
    for (const move of ordered(moves)) {
      const score = -search(makeMove(position, move), depth - 1, -beta, -alpha, ply + 1);
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
        const score = -search(makeMove(state, move), depth - 1, -Infinity, -alpha, 1);
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
