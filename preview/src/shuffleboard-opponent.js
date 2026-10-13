// The plaza regular at shuffleboard: if your puck lies furthest it knocks it off (aimed
// straight at it, hard enough to carry it past the end); otherwise it places a puck in
// the three zone, a little to one side of any puck already there. Its hand wobbles: a
// seeded spread in aim and power (integer-mixed seeds), so it misses sometimes.
import { SPREAD, powerFor } from './shuffleboard-rules.js';
import { seededRandom } from './seeded-random.js';

export const WOBBLE = { aim: 0.05, power: 0.045 };
const normal = next => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
// Aim for a lateral position v at the far end: the start offset plus the drift come to about 5 × SPREAD per unit of aim.
const aimFor = v => Math.min(1, Math.max(0, 0.5 + v / (5 * SPREAD)));

export function chooseThrow(state, seed = 1, wobble = WOBBLE) {
  const me = state.turn, on = state.pucks.filter(p => !p.out), mine = on.filter(p => p.owner === me), theirs = on.filter(p => p.owner !== me);
  const best = side => side.reduce((top, p) => (!top || p.u > top.u ? p : top), null), lead = best(theirs);
  let aim = 0.5, power = powerFor(2.32);
  if (lead && (!best(mine) || lead.u > best(mine).u)) { aim = aimFor(lead.v); power = Math.min(1, powerFor(lead.u) + 0.18); }
  else if (on.some(p => Math.abs(p.u - 2.32) < 0.08 && Math.abs(p.v) < 0.06)) aim = aimFor(0.09);
  const next = seededRandom((Math.imul(seed >>> 0, 0x27d4eb2f) ^ Math.imul(state.round * 16 + state.thrown[0] + state.thrown[1] + 1, 0x165667b1)) >>> 0);
  const clamp = value => Math.min(1, Math.max(0, value));
  return { aim: clamp(aim + normal(next) * wobble.aim), power: clamp(power + normal(next) * wobble.power) };
}
