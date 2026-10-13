// The plaza regulars at wine pong: each picks a standing glass (seeded, front of the
// rack a little more often), aims at its centre and throws with a regular's wobble in
// aim and power. Every draw is seeded from the game and the throw, so a regular's
// throws replay exactly.
import { aimAt, glassAt } from './wine-pong-rules.js';
import { seededRandom } from './seeded-random.js';

// Integer maths only: a float product of a 32-bit seed rounds the throw count away.
const stream = (seed, throws) => seededRandom((Math.imul(seed >>> 0, 0x27d4eb2f) ^ Math.imul(throws + 1, 0x165667b1)) >>> 0);
const normal = next => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
export const WOBBLE = { aim: 0.08, power: 0.09 };

export function chooseThrow(state, seed = state.seed, wobble = WOBBLE) {
  const side = state.turn, target = 1 - side, next = stream(seed, state.throws);
  const standing = state.glasses[target].map((up, k) => (up ? k : -1)).filter(k => k >= 0);
  // Later glasses in the rack sit nearer the thrower: weight them a little more.
  const weights = standing.map(k => 1 + k * 0.25), total = weights.reduce((sum, w) => sum + w, 0);
  let pick = next() * total, k = standing[0];
  for (let i = 0; i < standing.length; i++) { pick -= weights[i]; if (pick <= 0) { k = standing[i]; break; } }
  const { aim, power } = aimAt(side, glassAt(target, k));
  const clamp = value => Math.min(1, Math.max(0, value));
  return { aim: clamp(aim + normal(next) * wobble.aim), power: clamp(power + normal(next) * wobble.power), glass: k };
}
