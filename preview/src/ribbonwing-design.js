// @ts-check
// The Ribbonwing's metric design contract (#777, D1 reconciled blockout): one
// set of numbers that the renderer (ribbonwing.js), the rig
// (ribbonwing-rig.js), the vehicle spec (vehicle-config.js), the flight
// envelope and the tests all read. Pure data and pure functions; no Three.js.
//
// Frame: the road-vehicle frame of road-vehicles.js. Metres; front is -X, up
// is +Y and the craft's left is +Z (the pilot sits on the left, so +Z). The
// origin is on the ground under the planform's centre with the three landing
// feet deployed. Sources and every reconciliation are recorded in
// docs/design/ribbonwing/brief.md; the reference sheets are
// docs/design/ribbonwing/references/*.png (hashes in reference-index.json).

/** @typedef {[number,number]} Point2 */
/** @typedef {[number,number,number]} Point3 */

export const RIBBONWING_VERSION = 'd2-paint-1';

// Exact palette tokens (checked separately from lit pixels). Lacquer is the
// TypeSafe pink the issue fixes; the others were sampled from the exterior and
// cockpit panels' unlit-looking midtones and rounded.
export const RIBBONWING_PALETTE = Object.freeze({
  lacquer: '#F486A1',       // TypeSafe pink inset panels
  ivory: '#F3ECE1',         // composite body and wings
  mint: '#BFE3D4',          // canopy tint
  chrome: '#E3E8EC',        // restrained edges, rims, struts
  edgeBlue: '#9FB4D6',      // the chrome trailing-edge band's cool cast
  upholsteryIvory: '#EFE3D6',
  upholsteryPink: '#E7A3B2',
  harness: '#3E4446',
  cockpit: '#2F4C48',       // dark teal cockpit tub and dash
  mechanical: '#2B2F33',    // fan blades, gear bays, joints
  bronze: '#B78A5E',        // fan hubs and thruster fan faces
});

export const RIBBONWING_DIMENSIONS = Object.freeze({
  noseX: -2.95,
  tailX: 2.0,             // end of the body between the thrusters
  petalTipX: 2.84,
  length: 5.79,           // nose to petal tips
  span: 5.84,             // wing tip to wing tip, wings spread
  height: 3.05,           // ground to petal tips, feet deployed
  canopyApex: 2.03,
  belly: .40,             // lowest body point under the cockpit, feet deployed
  floor: .56,             // cockpit floor top
  footClearance: .06,     // contact sphere radius under each pad
});

// Body stations [x, halfWidth, bottom, top, exponent]: a superellipse loft.
// Plan widths from the exterior top view (scale fixed by a 1.44 m two-seat
// canopy); heights from the left and right profiles.
/** @type {ReadonlyArray<[number,number,number,number,number]>} */
export const BODY_STATIONS = Object.freeze([
  [-2.95, .025, .80, .84, 2.2],
  [-2.82, .20, .64, .98, 2.3],
  [-2.60, .40, .54, 1.07, 2.4],
  [-2.25, .58, .45, 1.15, 2.5],
  [-1.80, .70, .40, 1.21, 2.6],
  [-1.30, .76, .40, 1.22, 2.6],
  [-.85, .76, .43, 1.26, 2.6],
  [-.40, .72, .50, 1.52, 2.6],
  [.10, .62, .57, 1.5, 2.5],
  [.60, .50, .64, 1.46, 2.4],
  [1.10, .38, .74, 1.42, 2.3],
  [1.55, .26, .86, 1.36, 2.2],
  [1.85, .14, .96, 1.26, 2.1],
  [2.00, .03, 1.06, 1.12, 2.0],
]);

// The cockpit opening: the body's top arc is cut between these stations, by up
// to `halfAngle` either side of the top, fading over `fade` metres at each end.
export const COCKPIT_OPENING = Object.freeze({ from: -2.62, to: -.42, halfAngle: .95, fade: .36, dashFace: -2.08 });

// Canopy apex profile along the opening, [s, height] with s from 0 (front) to 1.
/** @type {ReadonlyArray<Point2>} */
export const CANOPY_PROFILE = Object.freeze([[0, 1.0], [.1, 1.32], [.24, 1.68], [.4, 1.95], [.54, 2.04], [.66, 2.03], [.8, 1.88], [.92, 1.68], [1, 1.52]]);

/** @param {ReadonlyArray<Point2>} points @param {number} s */
export function profileAt(points, s) {
  if (s <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) if (s <= points[i][0]) {
    const [s0, y0] = points[i - 1], [s1, y1] = points[i], t = (s - s0) / (s1 - s0), smooth = t * t * (3 - 2 * t);
    return y0 + (y1 - y0) * smooth;
  }
  return points[points.length - 1][1];
}

/** Interpolated body station at x (clamped to the loft). @param {number} x */
export function bodyAt(x) {
  const s = BODY_STATIONS;if (x <= s[0][0]) return { x, halfWidth: s[0][1], bottom: s[0][2], top: s[0][3], exponent: s[0][4] };
  for (let i = 1; i < s.length; i++) if (x <= s[i][0]) {
    const a = s[i - 1], b = s[i], t = (x - a[0]) / (b[0] - a[0]), m = (/** @type {number} */ u, /** @type {number} */ v) => u + (v - u) * t;
    return { x, halfWidth: m(a[1], b[1]), bottom: m(a[2], b[2]), top: m(a[3], b[3]), exponent: m(a[4], b[4]) };
  }
  const l = s[s.length - 1];return { x, halfWidth: l[1], bottom: l[2], top: l[3], exponent: l[4] };
}

/** Half-angle of the cockpit cut at x (0 outside the opening). @param {number} x */
export function openingHalfAngle(x) {
  const { from, to, halfAngle, fade } = COCKPIT_OPENING;if (x <= from || x >= to) return 0;
  const edge = Math.min((x - from) / fade, (to - x) / fade, 1);return halfAngle * Math.sin(edge * Math.PI / 2);
}

// A point on a body section: angle 0 is the craft's left (+Z), PI/2 the top.
/** @param {{halfWidth:number,bottom:number,top:number,exponent:number}} section @param {number} angle @returns {[number,number]} [y, z] */
export function sectionPoint(section, angle) {
  const p = 2 / section.exponent, c = Math.cos(angle), s = Math.sin(angle), centre = (section.top + section.bottom) / 2, half = (section.top - section.bottom) / 2;
  return [centre + half * Math.sign(s) * Math.abs(s) ** p, section.halfWidth * Math.sign(c) * Math.abs(c) ** p];
}

/** Half-width of a body section at height y (0 outside it). @param {{halfWidth:number,bottom:number,top:number,exponent:number}} section @param {number} y */
export function halfWidthAt(section, y) {
  const centre = (section.top + section.bottom) / 2, half = (section.top - section.bottom) / 2, s = Math.abs(y - centre) / half;
  return s >= 1 ? 0 : section.halfWidth * (1 - s ** section.exponent) ** (1 / section.exponent);
}

/** The opening's left edge at x, [y, z] (z >= 0), or null outside the opening. @param {number} x @returns {[number,number]|null} */
export function openingEdge(x) {
  const a = openingHalfAngle(x);return a > 0 ? sectionPoint(bodyAt(x), Math.PI / 2 - a) : null;
}

/** Canopy outer surface height above z at station x, or null outside it. @param {number} x @param {number} z */
export function canopyHeightAt(x, z) {
  const edge = openingEdge(x);if (!edge) return null;
  const [edgeY, edgeZ] = edge, s = (x - COCKPIT_OPENING.from) / (COCKPIT_OPENING.to - COCKPIT_OPENING.from), apex = profileAt(CANOPY_PROFILE, s);
  if (Math.abs(z) > edgeZ) return null;
  const c = Math.abs(z) / edgeZ, t = Math.acos(Math.min(1, c));
  return edgeY + (apex - edgeY) * Math.sin(t) ** CANOPY_SECTION_POWER;
}
// The canopy section's fullness: y = edge + rise * sin(t)^power (lower is boxier).
export const CANOPY_SECTION_POWER = .3;

// The left wing's planform in the craft frame, [x, z], leading edge root to
// tip then trailing edge back to the root (the right wing mirrors z). The
// crescent follows the top view, with the leading-edge root moved aft of the
// boarding steps and the fan 0.39 m aft of its drawn position so the shroud
// keeps 0.19 m of wing ahead of it (brief.md, D1-4).
/** @type {ReadonlyArray<Point2>} */
export const WING_PLANFORM = Object.freeze([
  [-1.12, .56], [-1.1, .9], [-1.06, 1.3], [-.95, 1.6], [-.7, 1.98], [-.32, 2.34], [.12, 2.62], [.6, 2.84], [1.1, 2.92],
  [1.5, 2.88], [1.9, 2.74], [1.48, 2.62], [1.2, 2.44], [.94, 2.06], [.8, 1.6], [.72, 1.1], [.85, .56],
]);
export const WING = Object.freeze({
  rootY: .98,              // wing chord plane height at the root
  planformRoot: .56,       // span (z) where the planform meets the body
  dihedral: .045,          // rise per metre of span inboard
  tipRise: .86,            // extra rise of the crescent tip
  tipFrom: 2.24,           // span (z) where the tip begins to curl up
  thickness: .14,          // at the root, tapering to .035 at the tip
  pivot: /** @type {Point3} */ ([-.2, 1.0, .64]), // tuck/sweep pivot (left wing)
});
/** Height of the left wing's chord plane at span z. @param {number} z */
export function wingHeightAt(z) {
  const a = Math.abs(z), base = WING.rootY + WING.dihedral * Math.max(0, a - WING.planformRoot);
  const tip = Math.max(0, (a - WING.tipFrom) / (2.92 - WING.tipFrom));return base + WING.tipRise * tip * tip;
}

// Lift fans: one recessed, shrouded fan per wing; axis vertical (+Y).
export const FANS = Object.freeze({
  centres: /** @type {ReadonlyArray<Point2>} */ ([[-.1, 1.5], [-.1, -1.5]]),
  rotor: .46, shroud: .56, blades: 14, depth: .2,
});

// Twin rear thrusters on dorsal pylons; each gimbals at its pylon joint.
export const THRUSTERS = Object.freeze({
  centres: /** @type {ReadonlyArray<Point3>} */ ([[1.16, 1.74, .62], [1.16, 1.74, -.62]]),
  length: .86, radius: .3, gimbalOffset: 0, // gimbal knuckle at the nacelle's mid-length
});

// Split petal tail: two leaves from the rear spine.
export const PETALS = Object.freeze({
  roots: /** @type {ReadonlyArray<Point3>} */ ([[1.4, 1.36, .12], [1.4, 1.36, -.12]]),
  tips: /** @type {ReadonlyArray<Point3>} */ ([[2.78, 3.05, .66], [2.78, 3.05, -.66]]),
  width: .44,
});

// Seats: pilot on the craft's left (+Z), passenger on the right, side by side.
// `root` is the seat point the avatar's hips settle on (vehicle-config's
// driverSeat/passengerSeat); `floor` the floor under the feet.
export const SEATS = Object.freeze({
  pilot: { root: /** @type {Point3} */ ([-1.36, .92, .34]), floor: .56 },
  passenger: { root: /** @type {Point3} */ ([-1.36, .92, -.34]), floor: .56 },
});

// Pilot controls (left seat): a side stick on the console at the right hand
// and a throttle on the left sill at the left hand.
export const CONTROLS = Object.freeze({
  stickPivot: /** @type {Point3} */ ([-1.62, .9, .06]),
  stickGrip: /** @type {Point3} */ ([-1.62, 1.16, .07]),
  throttleGrip: /** @type {Point3} */ ([-1.56, 1.12, .62]),
  dashboard: /** @type {Point3} */ ([-2.11, 1.16, 0]),
});

// Landing feet: nose and two mains, [x, z] of each pad centre; struts hinge in
// bays in the body (nose) and under the wings (mains).
export const FEET = Object.freeze({
  pads: /** @type {ReadonlyArray<Point2>} */ ([[-2.1, 0], [.86, 1.12], [.86, -1.12]]),
  padRadius: .17,
  hinges: /** @type {ReadonlyArray<Point3>} */ ([[-2.1, .6, 0], [.86, .95, 1.12], [.86, .95, -1.12]]),
});

// Boarding steps: a telescoping ladder in a housing on each flank under the
// sill, ahead of the wing root. Stowed it is collapsed in its housing; it
// swings out and extends to the ground (brief.md, D1-5).
export const STEPS = Object.freeze({
  hinges: /** @type {ReadonlyArray<Point3>} */ ([[-1.45, 1.0, .76], [-1.45, 1.0, -.76]]),
  treads: 3, width: .42, reach: 1.2, collapsed: .1,
});

// Canopy hinge: on the centreline at the opening's rear, axis Z.
export const CANOPY_HINGE = /** @type {Point3} */ ([-.42, 1.52, 0]);

// Mechanism limits, durations (seconds for a full stroke) and axes.
export const MECHANISMS = Object.freeze({
  canopy: { axis: 'z', open: 1.1, duration: 1.6 },      // rad; rear hinge lifts the front up and back
  steps: { axis: 'x', stowed: .1, deployed: .6, duration: 1.0 }, // rad outward tilt; the ladder also extends
  gear: { axis: 'x|z', retracted: 1.48, duration: 1.4 }, // rad: nose folds forward, mains outward under the wings
  wings: { axis: 'y', tuck: .8, droop: .12, duration: .8 }, // sweep back about the root pivot, plus droop
  fans: { idle: 18, hover: 62, max: 80, spinUp: 2.2 },   // rad/s
  nozzles: { axis: 'z', hover: 1.3, cruise: 0, limit: 1.4, yawLimit: .26, slew: 1.6 }, // rad, rad/s
});

// Collision: simple compound primitives in the craft frame, never triangles.
// Capsules are [a, b, radius]; boxes are [centre, half extents]. Wing boxes
// are per wing state and are swept in flight checks.
export const COLLIDERS = Object.freeze({
  body: [
    { name: 'nose', capsule: /** @type {[Point3,Point3,number]} */ ([[-2.75, .86, 0], [-1.6, .9, 0], .42]) },
    { name: 'cabin', capsule: /** @type {[Point3,Point3,number]} */ ([[-1.6, 1.12, 0], [-.2, 1.12, 0], .7]) },
    { name: 'canopy', capsule: /** @type {[Point3,Point3,number]} */ ([[-2.2, 1.5, 0], [-.8, 1.55, 0], .5]) },
    { name: 'tail', capsule: /** @type {[Point3,Point3,number]} */ ([[-.2, 1.08, 0], [1.9, 1.12, 0], .44]) },
    { name: 'thrusters', box: /** @type {[Point3,Point3]} */ ([[1.16, 1.74, 0], [.48, .34, .96]]) },
    { name: 'petals', box: /** @type {[Point3,Point3]} */ ([[2.1, 2.25, 0], [.72, .82, .62]]) },
  ],
});

// Sample points of the hull for clearance queries ([x, y, z], craft frame).
// Wings are sampled along the planform at the chord plane; the body along its
// collider capsules' axes and tops. Used by flight admission and landing.
/** @param {{tuck?:number}} [state] @returns {Point3[]} */
export function hullSamples({ tuck = 0 } = {}) {
  const points = /** @type {Point3[]} */ ([]);
  for (const x of [-2.9, -2.4, -1.8, -1.2, -.6, 0, .6, 1.2, 1.9]) {
    const b = bodyAt(x);points.push([x, b.bottom, 0], [x, Math.max(b.top, canopyHeightAt(x, 0) ?? 0), 0], [x, (b.top + b.bottom) / 2, b.halfWidth], [x, (b.top + b.bottom) / 2, -b.halfWidth]);
  }
  for (const [x, y, z] of THRUSTERS.centres) points.push([x - THRUSTERS.length / 2, y, z], [x + THRUSTERS.length / 2, y, z], [x, y + THRUSTERS.radius, z]);
  for (const [x, y, z] of PETALS.tips) points.push([x, y, z]);
  for (const side of [1, -1]) for (const [x, z] of WING_PLANFORM.filter((_, i) => i % 2 === 0)) {
    const [px, py, pz] = wingPoint([x, wingHeightAt(z), z], tuck);points.push([px, py, side * pz]);
  }
  return points;
}

/** A left-wing point moved by the tuck (0 spread, 1 tucked). @param {Point3} point @param {number} tuck @returns {Point3} */
export function wingPoint([x, y, z], tuck) {
  const a = MECHANISMS.wings.tuck * tuck, d = MECHANISMS.wings.droop * tuck, [px, py, pz] = WING.pivot;
  // sweep about +Y through the pivot (tip moves aft), then droop about +X
  let dx = x - px, dz = z - pz;const sx = dx * Math.cos(a) + dz * Math.sin(a), sz = -dx * Math.sin(a) + dz * Math.cos(a);
  let dy = y - py;const ry = dy * Math.cos(d) - sz * Math.sin(d), rz = dy * Math.sin(d) + sz * Math.cos(d);
  return [px + sx, py + ry, pz + rz];
}

/** Half span of the planform at a tuck. @param {number} tuck */
export function halfSpan(tuck = 0) { return Math.max(...WING_PLANFORM.map(([x, z]) => wingPoint([x, wingHeightAt(z), z], tuck)[2])); }

// Named attachment points (craft frame). Seats, hands and feet for both
// occupants; cameras; mechanism pivots and emitters. The renderer creates an
// Object3D for each under its name, so integrations look them up by name.
export const ATTACHMENTS = Object.freeze({
  'seat.pilot': SEATS.pilot.root,
  'seat.passenger': SEATS.passenger.root,
  'hand.pilot.right': CONTROLS.stickGrip,
  'hand.pilot.left': CONTROLS.throttleGrip,
  'hand.passenger.right': /** @type {Point3} */ ([-1.5, 1.08, -.6]),
  'hand.passenger.left': /** @type {Point3} */ ([-1.62, .98, -.1]),
  'foot.pilot': /** @type {Point3} */ ([-1.88, .58, .34]),
  'foot.passenger': /** @type {Point3} */ ([-1.88, .58, -.34]),
  'dashboard': CONTROLS.dashboard,
  'entry.left': /** @type {Point3} */ ([-1.45, 0, 1.78]),
  'entry.right': /** @type {Point3} */ ([-1.45, 0, -1.78]),
  'camera.cockpit': /** @type {Point3} */ ([-1.05, 1.86, 0]),
  'camera.chase': /** @type {Point3} */ ([5.6, 3.1, 0]),
  'pivot.canopy': CANOPY_HINGE,
  'pivot.wing.left': WING.pivot,
  'pivot.wing.right': /** @type {Point3} */ ([WING.pivot[0], WING.pivot[1], -WING.pivot[2]]),
  'axis.fan.left': /** @type {Point3} */ ([FANS.centres[0][0], wingHeightAt(1.5), FANS.centres[0][1]]),
  'axis.fan.right': /** @type {Point3} */ ([FANS.centres[1][0], wingHeightAt(1.5), FANS.centres[1][1]]),
  'gimbal.nozzle.left': /** @type {Point3} */ ([THRUSTERS.centres[0][0] + THRUSTERS.gimbalOffset, THRUSTERS.centres[0][1], THRUSTERS.centres[0][2]]),
  'gimbal.nozzle.right': /** @type {Point3} */ ([THRUSTERS.centres[1][0] + THRUSTERS.gimbalOffset, THRUSTERS.centres[1][1], THRUSTERS.centres[1][2]]),
  'hinge.foot.nose': FEET.hinges[0],
  'hinge.foot.left': FEET.hinges[1],
  'hinge.foot.right': FEET.hinges[2],
  'hinge.steps.left': STEPS.hinges[0],
  'hinge.steps.right': STEPS.hinges[1],
  'emitter.fan.left': /** @type {Point3} */ ([FANS.centres[0][0], wingHeightAt(1.5) - .12, FANS.centres[0][1]]),
  'emitter.fan.right': /** @type {Point3} */ ([FANS.centres[1][0], wingHeightAt(1.5) - .12, FANS.centres[1][1]]),
  'emitter.nozzle.left': /** @type {Point3} */ ([THRUSTERS.centres[0][0] + THRUSTERS.length / 2, THRUSTERS.centres[0][1], THRUSTERS.centres[0][2]]),
  'emitter.nozzle.right': /** @type {Point3} */ ([THRUSTERS.centres[1][0] + THRUSTERS.length / 2, THRUSTERS.centres[1][1], THRUSTERS.centres[1][2]]),
  'emitter.cockpit': /** @type {Point3} */ ([-1.6, 1.3, 0]),
});

// Geometry levels of detail and their camera distances (metres). Near carries
// the cockpit and every mechanism; medium keeps the silhouette, fans and
// nozzles with an opaque tinted canopy; far is the petal-wing silhouette only.
export const LODS = Object.freeze([
  { name: 'near', distance: 0 },
  { name: 'medium', distance: 26 },
  { name: 'far', distance: 70 },
]);
