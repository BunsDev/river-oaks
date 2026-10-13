// The plaza regular at darts: it aims where a decent pub player would (the treble 20,
// or the first bed of a checkout when one is on) and its hand wobbles: each dart lands
// at the aim plus a seeded scatter of a few centimetres, so it averages around forty
// a turn. Every draw is seeded from the game and the dart (integer maths).
import { checkout, targetPoint } from './darts-rules.js';
import { seededRandom } from './seeded-random.js';

export const WOBBLE = 24;
const stream = (seed, dart) => seededRandom((Math.imul(seed >>> 0, 0x27d4eb2f) ^ Math.imul(dart + 1, 0x165667b1)) >>> 0);
const normal = next => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());

// The point the regular aims at for the player to move.
export function aimFor(state) {
  const score = state.scores[state.turn], left = 3 - state.darts.length;
  const plan = score <= 170 ? checkout(score, left) : null;
  if (plan) return targetPoint(plan[0].number, plan[0].ring);
  // Out of finishing range: the treble 20, or the 19 when 20s risk leaving 1 or a bust.
  return score - 60 < 2 || score - 20 < 2 ? targetPoint(19, 'single') : targetPoint(20, 'treble');
}

export function throwPoint(state, seed, wobble = WOBBLE) {
  const [x, y] = aimFor(state), next = stream(seed, state.history.reduce((n, turn) => n + turn.darts.length, 0) + state.darts.length);
  return [x + normal(next) * wobble, y + normal(next) * wobble];
}
