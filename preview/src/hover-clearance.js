import { VEHICLES } from './vehicle-config.js';

// Shared by the normal hull controller and authoritative pose/checkpoint admission.
// No rendered scene or Three.js state is needed to check the same metric envelope.
export function hoverClear(state, environment) {
  const spec = VEHICLES[state.vehicle]; if (!spec?.flies) return false;
  if (environment.canopyHullClear && !environment.canopyHullClear(state)) return false;
  const fly = environment.canFly ?? ((x, _height, z) => environment.isFree(x, z));
  const c = Math.cos(state.yaw), s = Math.sin(state.yaw), hl = spec.length / 2, hw = spec.width / 2;
  if ((state.altitude ?? 0) > 0.1) {
    // Euler YXZ, matching the rendered pilot offset used by the controller.
    const [sx, sy, sz] = spec.driverSeat.map(value => value * (state.scale ?? 1));
    const roll = state.roll ?? 0, pitch = state.pitch ?? 0;
    const rx = sx * Math.cos(roll) - sy * Math.sin(roll), ry = sx * Math.sin(roll) + sy * Math.cos(roll);
    const rz = ry * Math.sin(pitch) + sz * Math.cos(pitch);
    const x = state.position[0] + rx * c + rz * s, z = state.position[2] - rx * s + rz * c;
    if (!fly(x, environment.groundAt(x, z) + state.altitude, z, { radius: 1.3 })) return false;
  }
  for (const [a, b] of [[0, 0], [-hl, 0], [hl, 0], [0, -hw], [0, hw], [-hl * 0.7, -hw], [-hl * 0.7, hw], [hl * 0.7, -hw], [hl * 0.7, hw]]) {
    const x = state.position[0] + a * c + b * s, z = state.position[2] - a * s + b * c, ground = environment.groundAt(x, z);
    for (const height of [0.4, spec.bodyHeight]) if (!fly(x, ground + state.altitude + height, z, { radius: 1.3, above: spec.bodyHeight - height })) return false;
  }
  return true;
}
