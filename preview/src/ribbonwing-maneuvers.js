// @ts-check
// Ribbonwing maneuvers (#777): authored, deterministic paths the server admits
// and owns, and every client (pilot, passenger, observer) replays from the same
// server start time. A path is a function of normalised time in the craft's
// heading frame: forward (m), left (m), up (m above the start altitude), roll
// (rad, right wing down positive), pitch (rad, nose up positive), wing tuck
// (0 spread .. 1 tucked). The craft's heading is fixed for the whole path.
//
// Server frame: [east, north]; heading h points forward = [cos h, sin h], left
// = [-sin h, cos h]. Altitude is metres above the ground under the craft, as in
// poses.

/** @typedef {'roll'|'loop'|'tuck_dive'|'petal_roll'} RibbonwingManeuverKind */
/** @typedef {{forward:number,left:number,up:number,roll:number,pitch:number,tuck:number}} ManeuverSample */

const TAU = Math.PI * 2;
const ease = (/** @type {number} */ t) => t * t * (3 - 2 * t);
const clamp01 = (/** @type {number} */ t) => Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
// The wing tuck ramps in over `rise` and back out over the last `fall`.
const tuckWindow = (/** @type {number} */ t, rise = .15, fall = .2) => Math.min(1, t / rise, (1 - t) / fall);

/** @type {Readonly<Record<RibbonwingManeuverKind,{label:string,duration:number,path:(t:number)=>Omit<ManeuverSample,'pitch'>&{pitch?:number}}>>} */
export const RIBBONWING_MANEUVERS = Object.freeze({
  // Aileron roll: a full turn about the flight path, level, at cruise speed.
  roll: { label: 'Roll', duration: 2600, path: t => ({ forward: 22 * t, left: 0, up: 0, roll: TAU * ease(t), tuck: 0 }) },
  // Inside loop of 5 m radius, drifting 6 m forward so it exits ahead of the entry.
  loop: { label: 'Loop', duration: 4400, path: t => { const a = TAU * ease(t);return { forward: 5 * Math.sin(a) + 6 * t, left: 0, up: 5 * (1 - Math.cos(a)), roll: 0, pitch: a, tuck: 0 }; } },
  // Tuck dive: wings sweep back, the nose drops about 6 m and pulls out level 2 m below the entry.
  tuck_dive: { label: 'Tuck dive', duration: 3400, path: t => ({ forward: 24 * t, left: 0, up: -2.5 * (1 - Math.cos(TAU * t)) - 2 * ease(t), roll: 0, tuck: tuckWindow(t) }) },
  // Petal Roll: a barrel roll round a 3 m tube with the wings half-tucked like closing petals.
  petal_roll: { label: 'Petal Roll', duration: 3600, path: t => { const a = TAU * ease(t);return { forward: 26 * t, left: -3 * Math.sin(a), up: 3 * (1 - Math.cos(a)), roll: a, tuck: .45 * Math.sin(Math.PI * t) }; } },
});
export const RIBBONWING_MANEUVER_KINDS = Object.freeze(/** @type {RibbonwingManeuverKind[]} */ (Object.keys(RIBBONWING_MANEUVERS)));

// Admission: the centre stays this high above the ground everywhere on the path
// (room to recover level), and each wingtip this high.
export const MANEUVER_RECOVERY_ALTITUDE = 3;
export const MANEUVER_TIP_CLEARANCE = 1;
// Wing half-span, spread and tucked (ribbonwing-design.js halfSpan(0), halfSpan(1)).
export const MANEUVER_HALF_SPAN = Object.freeze({ spread: 2.92, tucked: 1.93 });
// Path samples are at most this far apart along the swept centre and tips.
export const MANEUVER_SWEEP_STEP = .15;

export const isManeuverKind = (/** @type {unknown} */ kind) => typeof kind === 'string' && Object.hasOwn(RIBBONWING_MANEUVERS, kind);

/** The path sample at normalised time t (0..1). @param {RibbonwingManeuverKind} kind @param {number} t @returns {ManeuverSample} */
export function maneuverSample(kind, t) {
  const { path } = RIBBONWING_MANEUVERS[kind], at = clamp01(t), sample = path(at);
  if (sample.pitch !== undefined) return /** @type {ManeuverSample} */ (sample);
  // Pitch follows the climb or descent of the path.
  const d = .002, a = path(Math.max(0, at - d)), b = path(Math.min(1, at + d));
  return { ...sample, pitch: Math.atan2(b.up - a.up, Math.hypot(b.forward - a.forward, b.left - a.left) || 1e-9) };
}

/** A maneuver as the server publishes it. @typedef {{id:string,seq:number,kind:RibbonwingManeuverKind,heading:number,startedAt:number,origin:[number,number],altitude:number}} RibbonwingManeuver */

/** World pose of a published maneuver at server time `time` (ms). Ground follows `groundAt(east, north)` when given. */
export function maneuverPose(/** @type {RibbonwingManeuver} */ maneuver, /** @type {number} */ time) {
  const { duration } = RIBBONWING_MANEUVERS[maneuver.kind], t = clamp01((time - maneuver.startedAt) / duration), s = maneuverSample(maneuver.kind, t);
  const c = Math.cos(maneuver.heading), n = Math.sin(maneuver.heading);
  return {
    t, done: time >= maneuver.startedAt + duration,
    east: maneuver.origin[0] + s.forward * c - s.left * n, north: maneuver.origin[1] + s.forward * n + s.left * c,
    altitude: maneuver.altitude + s.up, heading: maneuver.heading, roll: s.roll, pitch: s.pitch, tuck: s.tuck,
  };
}

/**
 * Swept points of the path for admission: the centre and both wingtips (rolled
 * and pitched with the craft, spread by the tuck), each [east, north, altitude],
 * no further apart than MANEUVER_SWEEP_STEP. @returns {{centre:number[][],tips:number[][]}}
 */
export function maneuverSweep(/** @type {Omit<RibbonwingManeuver,'id'|'seq'|'startedAt'>} */ maneuver, step = MANEUVER_SWEEP_STEP) {
  const { kind, heading, origin, altitude } = maneuver, c = Math.cos(heading), n = Math.sin(heading);
  // Path length bound (the tips sweep at most span * |roll rate| further than the centre).
  let length = 0, prev = maneuverSample(kind, 0);
  for (let i = 1; i <= 200; i++) { const s = maneuverSample(kind, i / 200);length += Math.hypot(s.forward - prev.forward, s.left - prev.left, s.up - prev.up) + MANEUVER_HALF_SPAN.spread * (Math.abs(s.roll - prev.roll) + Math.abs(s.pitch - prev.pitch));prev = s; }
  const count = Math.max(2, Math.ceil(length / step)), centre = [], tips = [];
  for (let i = 0; i <= count; i++) {
    const s = maneuverSample(kind, i / count), east = origin[0] + s.forward * c - s.left * n, north = origin[1] + s.forward * n + s.left * c, up = altitude + s.up;
    centre.push([east, north, up]);
    const span = MANEUVER_HALF_SPAN.spread + (MANEUVER_HALF_SPAN.tucked - MANEUVER_HALF_SPAN.spread) * s.tuck;
    for (const side of [1, -1]) {
      // A left wingtip at +span rolls up (right wing down) and, inverted in a loop, hangs below.
      const lateral = side * span * Math.cos(s.roll), rise = side * span * Math.sin(s.roll) * Math.cos(s.pitch);
      tips.push([east - lateral * n, north + lateral * c, up + rise]);
    }
  }
  return { centre, tips };
}

/** Lowest centre / tip heights above the start altitude and the highest point. */
export function maneuverEnvelope(/** @type {RibbonwingManeuverKind} */ kind) {
  const { centre, tips } = maneuverSweep({ kind, heading: 0, origin: [0, 0], altitude: 0 });
  return { lowest: Math.min(...centre.map(p => p[2])), lowestTip: Math.min(...tips.map(p => p[2])), highest: Math.max(...centre.map(p => p[2]), ...tips.map(p => p[2])) };
}

/** The altitude a maneuver needs at entry. @param {RibbonwingManeuverKind} kind */
export function maneuverMinimumAltitude(kind) {
  const e = maneuverEnvelope(kind);
  return Math.max(MANEUVER_RECOVERY_ALTITUDE - e.lowest, MANEUVER_TIP_CLEARANCE - e.lowestTip);
}

/** Whether a published maneuver is well formed (clients ignore anything else). @returns {m is RibbonwingManeuver} */
export function validManeuver(/** @type {any} */ m) {
  return Boolean(m && typeof m === 'object' && isManeuverKind(m.kind) && typeof m.id === 'string'
    && [m.heading, m.startedAt, m.altitude].every(Number.isFinite) && m.altitude >= 0
    && Array.isArray(m.origin) && m.origin.length === 2 && m.origin.every(Number.isFinite));
}
