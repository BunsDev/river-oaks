// Wine pong on the long table by the plaza café. Two sides, six wine glasses each,
// racked in a triangle (three, two, one) at their own end of a 2.4 m table. Standing
// at your end, you throw at the far rack: an aim (left or right) and a power (how far).
// A ball that drops into a glass knocks it out of play; one that catches a rim may
// rattle in or spin out; one that lands on the table bounces on and can still drop
// into a glass; anything else is a miss. Each turn is two throws. Clear the other
// side's six glasses to win.
//
// Positions are in the table's frame: u along its length (west end -1.2, east end
// +1.2), v across it (+v is the north edge), in metres. Side 0 stands at the west end
// and defends the west rack; side 1 the east. Old throws record aim and power
// ('0.512,0.431'); positioned throws also record their table-local release point
// ('0.512,0.431,-1.700,0.250'). Rim rattles are seeded per throw, so games replay.

import { seededRandom } from './seeded-random.js';

export const TABLE = { length: 2.4, width: 0.6, height: 0.76 }, RIM = 0.042, BALL = 0.02, GLASS_HEIGHT = 0.16;
export const THROWS_PER_TURN = 2, HAND = 1.25, STAND = 1.6;
const SPACING = 0.095, ROW = Math.sqrt(SPACING ** 2 - (SPACING / 2) ** 2), BACK = TABLE.length / 2 - 0.12;
// Glass k of a side, in rack order: the back row of three, then two, then the apex.
const RACK = [[0, -1], [0, 0], [0, 1], [1, -0.5], [1, 0.5], [2, 0]];
export const glassAt = (side, k) => {
  const [row, across] = RACK[k], toward = side === 0 ? -1 : 1;
  return [toward * (BACK - row * ROW), across * SPACING];
};
// Aim and power map to a direction (±0.12 rad) and a carry of 2.2–3.1 m from the hand.
const AIM_SPREAD = 0.12, CARRY = [2.2, 0.9], BOUNCE = 0.38;
const POSITIONED_AIM_SPREAD = 0.5, POSITIONED_CARRY = [1.5, 2.5];
const releaseAt = (side, origin) => origin ?? [side === 0 ? -STAND : STAND, 0];
const validOrigin = (side, origin) => Array.isArray(origin) && origin.length === 2 && origin.every(Number.isFinite)
  && (side === 0 ? -origin[0] : origin[0]) >= TABLE.length / 2 + 0.15
  && (side === 0 ? -origin[0] : origin[0]) <= STAND + 1
  && Math.abs(origin[1]) <= 0.9;

export const startGame = (seed = 1) => ({ seed: seed >>> 0, glasses: [Array(6).fill(true), Array(6).fill(true)], turn: 0, throwsLeft: THROWS_PER_TURN, throws: 0, winner: null, last: null });

// Where a throw first comes down, in the table's frame.
export function landing(side, aim, power, origin = null) {
  const spread = origin ? POSITIONED_AIM_SPREAD : AIM_SPREAD, range = origin ? POSITIONED_CARRY : CARRY;
  const angle = (aim - 0.5) * 2 * spread, carry = range[0] + power * range[1], forward = side === 0 ? 1 : -1, from = releaseAt(side, origin);
  return [from[0] + forward * carry * Math.cos(angle), from[1] + carry * Math.sin(angle) * forward];
}

// The opponent's standing glass nearest a point, with its distance.
function nearestGlass(glasses, target, [u, v]) {
  let best = null;
  glasses[target].forEach((standing, k) => {
    if (!standing) return;
    const [gu, gv] = glassAt(target, k), distance = Math.hypot(u - gu, v - gv);
    if (!best || distance < best.distance) best = { k, distance };
  });
  return best;
}
const onTable = ([u, v]) => Math.abs(u) <= TABLE.length / 2 && Math.abs(v) <= TABLE.width / 2;
const rattle = (seed, index) => seededRandom((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0)();

// What a throw does: { result: 'in' | 'rim-in' | 'rim-out' | 'bounce-in' | 'miss', glass, land, bounce }.
export function resolve(state, aim, power, origin = null) {
  const side = state.turn, target = 1 - side, land = landing(side, aim, power, origin);
  const near = nearestGlass(state.glasses, target, land);
  if (near && near.distance <= RIM - BALL / 2) return { result: 'in', glass: near.k, land };
  if (near && near.distance <= RIM + BALL) return rattle(state.seed, state.throws) < 0.4 ? { result: 'rim-in', glass: near.k, land } : { result: 'rim-out', glass: null, land };
  if (onTable(land)) {
    const forward = side === 0 ? 1 : -1, bounce = [land[0] + forward * BOUNCE, land[1] * 1.1], after = nearestGlass(state.glasses, target, bounce);
    if (after && after.distance <= RIM - BALL / 2) return { result: 'bounce-in', glass: after.k, land, bounce };
    return { result: 'miss', glass: null, land, bounce };
  }
  return { result: 'miss', glass: null, land };
}

export function play(state, aim, power, origin = null) {
  if (state.winner !== null) throw new Error('The game is over');
  if (!(aim >= 0 && aim <= 1 && power >= 0 && power <= 1)) throw new Error(`Bad throw ${aim},${power}`);
  if (origin !== null && !validOrigin(state.turn, origin)) throw new Error('Bad release origin');
  const outcome = resolve(state, aim, power, origin), side = state.turn, target = 1 - side;
  const glasses = state.glasses.map(rack => rack.slice());
  if (outcome.glass !== null) glasses[target][outcome.glass] = false;
  const winner = glasses[target].every(standing => !standing) ? side : null;
  const throwsLeft = winner !== null ? 0 : state.throwsLeft - 1;
  const turn = winner === null && throwsLeft === 0 ? target : side;
  return { ...state, glasses, winner, turn, throwsLeft: throwsLeft === 0 && winner === null ? THROWS_PER_TURN : throwsLeft, throws: state.throws + 1, last: { side, aim, power, origin: origin?.slice() ?? null, ...outcome } };
}

export const notation = (aim, power, origin = null) => `${aim.toFixed(3)},${power.toFixed(3)}${origin ? `,${origin[0].toFixed(3)},${origin[1].toFixed(3)}` : ''}`;
export function replay(seed, throws = []) {
  let state = startGame(seed);
  const played = [];
  for (const text of throws) {
    const values = text.split(',').map(Number);
    if (![2, 4].includes(values.length)) throw new Error('Bad throw notation');
    state = play(state, values[0], values[1], values.length === 4 ? values.slice(2) : null);
    played.push(state.last);
  }
  return { state, played };
}

// The aim and power that land a throw on a point (inverse of landing()).
export function aimAt(side, [u, v], origin = null) {
  const forward = side === 0 ? 1 : -1, from = releaseAt(side, origin), du = (u - from[0]) * forward, dv = (v - from[1]) * forward;
  const carry = Math.hypot(du, dv), angle = Math.atan2(dv, du);
  const spread = origin ? POSITIONED_AIM_SPREAD : AIM_SPREAD, range = origin ? POSITIONED_CARRY : CARRY;
  return { aim: 0.5 + angle / (2 * spread), power: (carry - range[0]) / range[1] };
}

// The ball's path for drawing: points [u, v, height above the paving] from the hand
// to where it comes to rest (in a glass, on a bounce, or off the end of the table).
export function trajectory(side, outcome, steps = 24) {
  const hand = [...releaseAt(side, outcome.origin), HAND], rest = outcome.result === 'miss' ? TABLE.height : TABLE.height + (outcome.glass === null ? 0 : GLASS_HEIGHT * 0.6);
  const arc = (from, to, apex, count) => Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, lift = 4 * apex * t * (1 - t);
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t + lift];
  });
  const firstDown = [outcome.land[0], outcome.land[1], outcome.result === 'in' || outcome.result === 'rim-in' ? rest : TABLE.height + (onTable(outcome.land) ? BALL : -TABLE.height + BALL)];
  const path = arc(hand, firstDown, 0.55, steps);
  if (outcome.result === 'rim-out') {
    const forward = side === 0 ? 1 : -1, across = outcome.land[1] >= 0 ? 1 : -1;
    path.push(...arc(firstDown, [outcome.land[0] - forward * 0.12, outcome.land[1] + across * 0.1, TABLE.height + BALL], 0.08, Math.round(steps / 3)).slice(1));
  }
  if (outcome.bounce) path.push(...arc(firstDown, [outcome.bounce[0], outcome.bounce[1], outcome.result === 'bounce-in' ? rest : TABLE.height + BALL], 0.12, Math.round(steps / 3)).slice(1));
  return path;
}
