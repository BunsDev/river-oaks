// The plaza regulars at Jenga: each pulls the block that looks loosest (the widest safe
// zone, never one that can only fall), sparing middles that would leave a level with
// no safe pull, with a little seeded taste among near-equal choices so the tower does
// not always lose the same blocks. Whether a regular's hand
// stays steady is seeded too, from the same zone the player's meter shows.
import { legalPulls, zone } from './jenga-rules.js';
import { seededRandom } from './seeded-random.js';

// Integer maths only: a float product of a 32-bit seed rounds the pull count away.
const draw = (seed, pulls, salt) => seededRandom((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(pulls + 1, 0x85ebca6b) ^ Math.imul(salt, 0xc2b2ae35)) >>> 0)();

export function choosePull(state, seed = 1) {
  // A middle block slides out easily but leaves its level on two edges, where every later
  // pull can only fall; a regular keeps that level for later unless little else is left.
  const spends = ({ level, slot }) => slot === 1 && state.levels[level].every(Boolean) ? 0.12 : 0;
  const options = legalPulls(state).filter(option => !option.fatal).map(option => ({ ...option, width: zone(state, option) - spends(option) }));
  if (!options.length) return legalPulls(state)[0] ?? null;
  const best = Math.max(...options.map(option => option.width));
  const near = options.filter(option => option.width >= best - 0.03);
  const { level, slot } = near[Math.floor(draw(seed, state.pulls, 1) * near.length)];
  return { level, slot };
}

// The chance a hand stays steady for a safe zone of this width.
export const steadiness = width => width <= 0 ? 0 : Math.min(0.997, 0.72 + width);
export const steadyFor = (state, choice, seed = 1) => draw(seed, state.pulls, 2) < steadiness(zone(state, choice));
