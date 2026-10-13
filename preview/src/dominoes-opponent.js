// The plaza regulars at dominoes. A regular sees only what a player at the table
// could: its own hand, the line, how many tiles everyone holds, and which numbers
// each player has already failed to follow. It sheds heavy tiles and doubles
// early, keeps numbers it can still answer, and plays onto numbers the next
// player is known to lack. Deterministic: ties go to the lower tile.
import { publicView, values } from './dominoes-rules.js';

// The open ends after a play, as the view would show them.
function endsAfter(line, move) {
  const [a, b] = values(move.tile);
  if (!line.length) return [a, b];
  const [left, right] = [line[0].left, line.at(-1).right];
  if (move.end === 'left') return [a === left ? b : a, right];
  return [left, a === right ? b : a];
}

export function chooseMove(state, played, moves) {
  if (!moves.length) return null;
  const plays = moves.filter(move => move.kind === 'play');
  if (!plays.length) return moves[0];
  const player = state.turn, view = publicView(state, played, player), nextPlayer = (player + 1) % state.players;
  const scored = plays.map(move => {
    const [a, b] = values(move.tile), rest = view.hand.filter(tile => tile !== move.tile), open = endsAfter(view.line, move);
    let score = a + b;
    if (a === b) score += 6;
    // Keep answers: tiles left in hand that would still fit an open end.
    score += 3 * rest.filter(tile => values(tile).some(value => open.includes(value))).length;
    // Lock out the next player on numbers they could not follow before.
    score += 5 * open.filter(value => view.lacks[nextPlayer].includes(value)).length;
    return { move, score };
  });
  scored.sort((x, y) => y.score - x.score || (x.move.tile < y.move.tile ? -1 : x.move.tile > y.move.tile ? 1 : 0) || (x.move.end < y.move.end ? -1 : 1));
  return scored[0].move;
}
