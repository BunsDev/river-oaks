// Table shuffleboard on the long linen table by the café. Two players slide four
// weighted pucks each, in turn, from the near end toward the far one. A puck slows
// steadily (friction) and knocks others it meets (equal masses, a little lively);
// over a side it drops in the gutter, and past the far end it falls off, unless only
// part of it hangs over the edge: a "hanger". A puck that stops short of the foul line
// is taken off. When all eight are down, only the player whose puck lies furthest
// scores: every one of their pucks further than the opponent's best counts, 1, 2 or 3
// by the zone it rests in (3 nearest the end), and 4 for a hanger. First to 15 wins;
// the other player throws first in the next round.
//
// Positions are metres in the table's frame: u along it from the throwing end (0) to
// the far end (TABLE.length), v across (± half the width). A throw is an aim (0–1,
// across) and a power (0–1); the slide is simulated in fixed steps, so a game replays
// exactly from its throws. Pure and dependency-free.

export const TABLE = { length: 2.4, width: 0.6 }, PUCK = 0.029, PUCKS = 4, TARGET = 15;
export const FOUL = 1.65, ZONES = [{ from: 1.65, points: 1 }, { from: 1.95, points: 2 }, { from: 2.2, points: 3 }];
// SPREAD sets how far aim turns the throw: at either extreme a firm slide reaches the gutter.
const FRICTION = 0.32, STEP = 1 / 240, RESTITUTION = 0.9, START = 0.12, SPEED = [0.83, 0.40];
export const SPREAD = 0.14;

export const startGame = () => ({ pucks: [], round: 1, first: 0, thrown: [0, 0], turn: 0, scores: [0, 0], winner: null, last: null, history: [] });

const onTable = puck => !puck.out;
// Where a puck rests: off the end entirely, hanging (its centre past the end but less than a radius beyond), or on.
export const hanging = puck => puck.u > TABLE.length && puck.u < TABLE.length + PUCK * 0.6;
export function pointsFor(puck) {
  if (hanging(puck)) return 4;
  let points = 0;
  for (const zone of ZONES) if (puck.u >= zone.from) points = zone.points;
  return points;
}

// Slides a new puck in among the ones down, returning where everything comes to rest and the path of each step.
export function slide(pucks, owner, aim, power) {
  const moving = [...pucks.filter(onTable).map(p => ({ ...p, du: 0, dv: 0 })), { owner, u: START, v: (aim - 0.5) * 2 * SPREAD * 0.6, du: SPEED[0] + power * SPEED[1], dv: (aim - 0.5) * 2 * SPREAD, out: false }];
  const frames = [];
  for (let step = 0; step < 240 * 20; step++) {
    let any = false;
    for (const p of moving) {
      if (p.out) continue;
      const speed = Math.hypot(p.du, p.dv);
      if (speed < 1e-4) { p.du = p.dv = 0; continue; }
      any = true;
      const slow = Math.max(0, speed - FRICTION * STEP) / speed;
      p.du *= slow; p.dv *= slow; p.u += p.du * STEP; p.v += p.dv * STEP;
      if (Math.abs(p.v) > TABLE.width / 2 || p.u > TABLE.length + PUCK * 0.6) { p.out = true; p.du = p.dv = 0; }
    }
    // Collisions between pucks still on the table: swap the velocity along the line of centres.
    for (let i = 0; i < moving.length; i++) for (let j = i + 1; j < moving.length; j++) {
      const a = moving[i], b = moving[j];
      if (a.out || b.out) continue;
      const du = b.u - a.u, dv = b.v - a.v, dist = Math.hypot(du, dv);
      if (dist >= 2 * PUCK || dist === 0) continue;
      const nu = du / dist, nv = dv / dist, rel = (a.du - b.du) * nu + (a.dv - b.dv) * nv;
      const overlap = 2 * PUCK - dist; a.u -= nu * overlap / 2; a.v -= nv * overlap / 2; b.u += nu * overlap / 2; b.v += nv * overlap / 2;
      if (rel <= 0) continue;
      const impulse = rel * (1 + RESTITUTION) / 2;
      a.du -= impulse * nu; a.dv -= impulse * nv; b.du += impulse * nu; b.dv += impulse * nv;
    }
    if (step % 8 === 0) frames.push(moving.map(p => [p.u, p.v, p.out]));
    if (!any) break;
  }
  frames.push(moving.map(p => [p.u, p.v, p.out]));
  const thrown = moving.at(-1);
  // A puck that stops short of the foul line is taken off.
  for (const p of moving) if (!p.out && p.u < FOUL) p.out = true;
  return { pucks: moving.map(({ du, dv, ...rest }) => rest), frames, thrown };
}

// The round's score: [player, points] for whoever lies furthest, or null if nobody is on.
export function roundScore(pucks) {
  const on = pucks.filter(onTable);
  if (!on.length) return null;
  const best = [0, 1].map(owner => Math.max(-Infinity, ...on.filter(p => p.owner === owner).map(p => p.u)));
  const leader = best[0] > best[1] ? 0 : 1, rival = best[1 - leader];
  const points = on.filter(p => p.owner === leader && p.u > rival).reduce((sum, p) => sum + pointsFor(p), 0);
  return points ? [leader, points] : null;
}

export function play(state, aim, power) {
  if (state.winner !== null) throw new Error('The game is over');
  if (!(aim >= 0 && aim <= 1 && power >= 0 && power <= 1)) throw new Error(`Bad throw ${aim},${power}`);
  const player = state.turn, { pucks, thrown } = slide(state.pucks, player, aim, power), counts = state.thrown.slice();
  counts[player] += 1;
  const last = { player, aim, power, rest: { u: thrown.u, v: thrown.v, out: thrown.out } };
  const other = 1 - player;
  if (counts[0] + counts[1] < PUCKS * 2) return { ...state, pucks, thrown: counts, turn: counts[other] < PUCKS ? other : player, last };
  // The round is over: score it, then the other player throws first.
  const scored = roundScore(pucks), scores = state.scores.slice();
  if (scored) scores[scored[0]] += scored[1];
  const winner = scores.some(score => score >= TARGET) ? (scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1) : null;
  const first = 1 - state.first;
  return { ...state, pucks: winner === null ? [] : pucks, round: state.round + 1, first, thrown: [0, 0], turn: first, scores, winner, last: { ...last, scored, ended: pucks }, history: [...state.history, { round: state.round, scored, pucks }] };
}

export const notation = (aim, power) => `${aim.toFixed(3)},${power.toFixed(3)}`;
export function replay(throws = []) {
  let state = startGame();
  for (const text of throws) { const [aim, power] = text.split(',').map(Number); state = play(state, aim, power); }
  return { state };
}
// The power that brings a lone puck to rest at distance u (inverse of the slide, ignoring others).
export const powerFor = u => (Math.sqrt(2 * FRICTION * (u - START)) - SPEED[0]) / SPEED[1];
// And the reverse: where a straight lone throw of this power comes to rest.
export const restFor = power => START + (SPEED[0] + power * SPEED[1]) ** 2 / (2 * FRICTION);
