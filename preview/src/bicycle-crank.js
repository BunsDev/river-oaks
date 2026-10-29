// The plaza bicycle's crank, shared by the ridden bike and its rider so the pedals
// and the feet on them turn together. Points are in the bike frame (forward is -X,
// +Z is the rider's left). Angles turn about +Z; positive is forward pedalling, the
// same sense as the wheels. At angle 0 the right crank points back (+X), which is
// where the parked bikes' pedals have always stood.
export const BICYCLE_CRANK = Object.freeze({ center: Object.freeze([.05, .30]), length: .165, pedalZ: .10, development: 4.5 });

// A city gear: 4.5 m of road per crank turn, about 67 rpm at the 5 m/s cruise.
export function bicycleCrankAngle(distance) {
  return Number.isFinite(distance) ? distance / BICYCLE_CRANK.development * Math.PI * 2 : 0;
}

// The pedal spindle centre for side 'l' (+Z) or 'r' (-Z).
export function bicyclePedal(side, angle, out = [0, 0, 0]) {
  const a = angle + (side === 'l' ? Math.PI : 0), { center, length, pedalZ } = BICYCLE_CRANK;
  out[0] = center[0] + Math.cos(a) * length; out[1] = center[1] + Math.sin(a) * length; out[2] = side === 'l' ? pedalZ : -pedalZ;
  return out;
}

// Ankling, as a toe-down pitch in radians about +Z: the heel drops as the foot
// pushes over the top and front (about 5°), and the toe points as it sweeps back
// through the bottom (about 23°). Each pedal turns with the foot on it.
export function bicyclePedalPitch(side, angle) {
  const a = angle + (side === 'l' ? Math.PI : 0);
  return .24 - .16 * Math.cos(a - 3 * Math.PI / 4);
}

// The seat post slides along the seat tube (bottom bracket to the saddle clamp).
// A ridden bike raises it by up to `reach` to fit its rider, as a shared bike's
// quick-release post allows.
const TUBE = Math.hypot(.09, .58);
export const BICYCLE_SEATPOST = Object.freeze({ axis: Object.freeze([.09 / TUBE, .58 / TUBE]), reach: .18 });
