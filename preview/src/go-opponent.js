// The plaza regular at Go: Monte Carlo, with one tactical rule (a capture on offer is
// taken, the biggest first). For each candidate point it plays many quick
// random games to the end (never filling its own single-point eyes) and counts how
// often it wins by area; play-outs go mostly to the promising points (UCB1). It passes
// when you have just passed and the count already favours it, or when nothing is worth
// playing. Every draw comes from a seed mixed with the position (integer maths), so a
// given position always gets the same reply.
import { SIZE, areaScore, isLegal, neighbours, other, place } from './go-rules.js';
import { seededRandom } from './seeded-random.js';

const POINTS = SIZE * SIZE;
// An empty point all of whose neighbours are one colour's stones: that colour's eye.
const eyeOf = (board, index, colour) => !board[index] && neighbours(index).every(near => board[near] === colour);

function playout(board, turn, random, cap = POINTS * 2) {
  let passes = 0;
  for (let moves = 0; moves < cap && passes < 2; moves++) {
    const empties = [];
    for (let index = 0; index < POINTS; index++) if (!board[index] && !eyeOf(board, index, turn)) empties.push(index);
    let placed = null;
    while (empties.length && !placed) {
      const pick = Math.floor(random() * empties.length), index = empties[pick];
      empties[pick] = empties[empties.length - 1]; empties.pop();
      placed = place(board, index, turn);
    }
    if (placed) { board = placed.board; passes = 0; } else passes++;
    turn = other(turn);
  }
  const score = areaScore(board);
  return score.b > score.w ? 'b' : 'w';
}

export function chooseMove(state, { budget = 700, seed = 1 } = {}) {
  const me = state.turn, score = areaScore(state.board);
  const ahead = (me === 'b' ? score.b - score.w : score.w - score.b) > 0;
  if (state.passes === 1 && ahead) return 'pass';
  const candidates = [];
  for (let index = 0; index < POINTS; index++) if (!eyeOf(state.board, index, me) && isLegal(state, index)) candidates.push(index);
  if (!candidates.length) return 'pass';
  // A capture on offer is taken: play-outs only choose among the biggest captures.
  const takes = candidates.map(index => place(state.board, index, me).captured), most = Math.max(...takes);
  if (most > 0) candidates.splice(0, candidates.length, ...candidates.filter((_, i) => takes[i] === most));
  const mix = state.seen.length * 0x9e3779b1;
  const random = seededRandom((Math.imul(seed >>> 0, 0x85ebca6b) ^ Math.imul(mix >>> 0, 0xc2b2ae35) ^ state.board.reduce((hash, stone, index) => stone ? Math.imul(hash ^ (index + (stone === 'b' ? 1 : 97)), 0x27d4eb2f) : hash, 0x165667b1)) >>> 0);
  const wins = new Float64Array(candidates.length), runs = new Float64Array(candidates.length);
  for (let n = 0; n < budget; n++) {
    let pick = 0;
    if (n < candidates.length) pick = n;
    else {
      let best = -Infinity;
      for (let i = 0; i < candidates.length; i++) { const ucb = wins[i] / runs[i] + Math.sqrt(2 * Math.log(n) / runs[i]); if (ucb > best) { best = ucb; pick = i; } }
    }
    const placed = place(state.board, candidates[pick], me);
    runs[pick] += 1;
    if (playout(placed.board, other(me), random) === me) wins[pick] += 1;
  }
  let best = 0;
  for (let i = 1; i < candidates.length; i++) if (runs[i] > runs[best] || (runs[i] === runs[best] && wins[i] > wins[best])) best = i;
  // Nothing worth playing: every point loses nearly always.
  if (wins[best] / runs[best] < 0.03) return 'pass';
  return candidates[best];
}
