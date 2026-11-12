import { RIBBONWING_DIMENSIONS as D } from './ribbonwing-design.js';
import { VEHICLES } from './vehicle-config.js';

// The complete level aircraft, including gear, tips and the trim extending just
// beyond the design stations. The powered/tucked nozzles need the wider 12 cm
// horizontal allowance; mesh-bound regressions cover every airborne mechanism state.
export const RIBBONWING_CLEARANCE = Object.freeze({
  minX: D.noseX - 0.03, maxX: D.petalTipX + 0.12, halfWidth: D.span / 2 + 0.12,
  minY: -0.03, maxY: D.height + 0.03,
});

export function ribbonwingRotationPadding(from, to) {
  const angles = state => state.maneuverAngles ?? { pitch: state.pitch ?? 0, roll: state.roll ?? 0 };
  const a = angles(from), b = angles(to), angle = Math.abs(b.pitch - a.pitch) + Math.abs(b.roll - a.roll);
  const B = RIBBONWING_CLEARANCE, seat = VEHICLES.hover.driverSeat;
  const radius = Math.hypot(Math.max(Math.abs(B.minX - seat[0]), Math.abs(B.maxX - seat[0])), B.halfWidth + Math.abs(seat[2]), Math.max(Math.abs(B.minY), Math.abs(B.maxY)));
  // Bound the arc's departure from the endpoint chord for the sampled tilt.
  return Math.min(2 * radius, radius * angle * angle / 8) + (angle ? 0.001 : 0);
}

const tilt = (x, y, z, state) => {
  if (state.maneuverAngles) {
    const { pitch, roll } = state.maneuverAngles;
    const ry = y * Math.cos(roll) + z * Math.sin(roll), rz = -y * Math.sin(roll) + z * Math.cos(roll);
    return [x * Math.cos(pitch) + ry * Math.sin(pitch), -x * Math.sin(pitch) + ry * Math.cos(pitch), rz];
  }
  const pitch = state.pitch ?? 0, roll = state.roll ?? 0;
  const rx = x * Math.cos(roll) - y * Math.sin(roll), ry = x * Math.sin(roll) + y * Math.cos(roll);
  return [rx, ry * Math.cos(pitch) - z * Math.sin(pitch), ry * Math.sin(pitch) + z * Math.cos(pitch)];
};

export function ribbonwingFromPilot(position, yaw, altitude, groundAt) {
  const seat = VEHICLES.hover.driverSeat, c = Math.cos(yaw), s = Math.sin(yaw);
  const x = position[0] - seat[0] * c - seat[2] * s, z = position[2] + seat[0] * s - seat[2] * c;
  return { vehicle: 'hover', position: [x, groundAt(x, z), z], yaw, altitude, speed: 0 };
}

// The server owns these angles and the pilot pivot during an authored maneuver.
// Match parked-carriage's Y(heading-pi) * Z(-pitch) * X(-roll) transform.
export function ribbonwingManeuverFromPilot(position, heading, altitude, pitch, roll, groundAt) {
  const yaw = heading - Math.PI, state = ribbonwingFromPilot(position, yaw, altitude, groundAt);
  const seat = VEHICLES.hover.driverSeat, maneuverAngles = { pitch, roll };
  const [sx, sy, sz] = tilt(seat[0], 0, seat[2], { maneuverAngles }), c = Math.cos(yaw), s = Math.sin(yaw);
  const groundHeight = state.position[1] - sy;
  return { ...state, position: [position[0] - sx * c - sz * s, groundHeight, position[2] + sx * s - sz * c], groundHeight, maneuverAngles };
}

export function ribbonwingCanopyBox(state, groundAt) {
  const B = RIBBONWING_CLEARANCE, [x, , z] = state.position;
  let minX = B.minX, maxX = B.maxX, minZ = -B.halfWidth, maxZ = B.halfWidth, minY = B.minY, maxY = B.maxY;
  const pitch = state.pitch ?? 0, roll = state.roll ?? 0;
  if (pitch || roll || state.maneuverAngles) {
    minX = minY = minZ = Infinity; maxX = maxY = maxZ = -Infinity;
    for (const px of [B.minX, B.maxX]) for (const py of [B.minY, B.maxY]) for (const pz of [-B.halfWidth, B.halfWidth]) {
      const [rx, y, z] = tilt(px, py, pz, state);
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  const mid = (minX + maxX) / 2, cross = (minZ + maxZ) / 2, c = Math.cos(state.yaw), s = Math.sin(state.yaw);
  const ground = (state.groundHeight ?? groundAt(x, z)) + (state.altitude ?? 0);
  return { x: x + mid * c + cross * s, z: z - mid * s + cross * c, yaw: state.yaw,
    halfLength: (maxX - minX) / 2, halfWidth: (maxZ - minZ) / 2,
    bottom: ground + minY, top: ground + maxY };
}
