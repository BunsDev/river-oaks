// The plaza regular at Chinese checkers races forward. Each move is scored by the rows it
// gains toward the far tip, plus half the best gain it would set up for its next move
// (so it builds ladders to hop along), with a nudge for bringing up its last marble and
// for staying near the middle of the board. Ties go to a seeded draw, so games vary.
import { HOLES, legalMoves, movesFrom, rowsToGo } from './chinese-checkers-rules.js';
import { seededRandom } from './seeded-random.js';

const across = hole => Math.abs(HOLES[hole][0] + HOLES[hole][1] / 2);

export function chooseMove(state, seed = 1) {
  const player = state.turn, moves = legalMoves(state);
  if (!moves.length) return null;
  const next = seededRandom((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(state.plies + 1, 0x85ebca6b)) >>> 0);
  const mine = state.board.flatMap((owner, hole) => (owner === player ? [hole] : []));
  const rear = Math.max(...mine.map(hole => rowsToGo(player, hole)));
  let best = null;
  for (const move of moves) {
    const from = move.path[0], gain = rowsToGo(player, from) - rowsToGo(player, move.to);
    const board = state.board.slice(); board[from] = null; board[move.to] = player;
    let follow = 0;
    for (const hole of mine.map(h => (h === from ? move.to : h))) for (const option of movesFrom(board, hole)) follow = Math.max(follow, rowsToGo(player, hole) - rowsToGo(player, option.to));
    const value = gain + follow * 0.5 + (rowsToGo(player, from) === rear && gain > 0 ? 0.6 : 0) - (across(move.to) - across(from)) * 0.15 + next() * 0.01;
    if (!best || value > best.value) best = { value, move };
  }
  return best.move.path.join('-');
}
