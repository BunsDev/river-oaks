// Finite canopy envelopes for an already expanded Ribbon plan. Renderer-free: callers supply
// the admitted plan, its actual slab/edge dimensions and the same ground sampler as the mesh.
// Scene coordinates are [east, up, -north] metres. This module does not select or admit a plan.
export const RIBBON_CANOPY_SKIN = 0.001; // Covers the instanced mesh's Float32 transform rounding.

const positive = value => Number.isFinite(value) && value > 0;
const nonnegative = value => Number.isFinite(value) && value >= 0;
const point = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export function ribbonCanopyVolumes(plan, groundAt, { slab, edgeBeyondWalk } = {}) {
  if (!positive(slab) || !nonnegative(edgeBeyondWalk) || typeof groundAt !== 'function') throw new TypeError('Canopy dimensions and ground sampler required');
  return (plan?.modules ?? []).map(module => {
    if (![module.length, module.width, module.clearHeight].every(positive) || !Number.isFinite(module.yaw)
      || ![module.from, module.to].every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) throw new TypeError('Invalid expanded canopy module');
    const x = (module.from[0] + module.to[0]) / 2, z = -(module.from[1] + module.to[1]) / 2;
    // Each rendered slab is level at its midpoint, even where the ground slopes beneath it.
    const ground = groundAt(x, z);
    if (!Number.isFinite(ground)) throw new TypeError('Finite canopy ground required');
    return Object.freeze({ id: module.id, x, z, cos: Math.cos(module.yaw), sin: Math.sin(module.yaw),
      halfLength: module.length / 2 + RIBBON_CANOPY_SKIN,
      halfWidth: module.width / 2 + edgeBeyondWalk + RIBBON_CANOPY_SKIN,
      bottom: ground + module.clearHeight - RIBBON_CANOPY_SKIN,
      top: ground + module.clearHeight + slab + RIBBON_CANOPY_SKIN });
  });
}

function extent({ radius = 0, below = 0, above = 0 } = {}) {
  if (![radius, below, above].every(nonnegative)) throw new TypeError('Finite nonnegative canopy clearance required');
  return { radius, below, above };
}

const local = (volume, p) => {
  const dx = p[0] - volume.x, dz = p[2] - volume.z;
  return [dx * volume.cos - dz * volume.sin, p[1], dx * volume.sin + dz * volume.cos];
};

// A vertical cylinder/point against a finite oriented slab. Explicit vertical extents let a
// caller use the real mover's datum and size; a camera point need not inherit a flight body.
export function ribbonCanopyBlocks(volumes, position, clearance) {
  if (!point(position)) throw new TypeError('Finite scene point required');
  const { radius, below, above } = extent(clearance);
  return volumes.some(volume => {
    if (position[1] + above < volume.bottom || position[1] - below > volume.top) return false;
    const [x, , z] = local(volume, position);
    const dx = Math.max(0, Math.abs(x) - volume.halfLength), dz = Math.max(0, Math.abs(z) - volume.halfWidth);
    return dx * dx + dz * dz <= radius * radius;
  });
}

// Earliest contact over the whole segment, including clear endpoints on opposite faces.
// No fixed sampling interval can skip a thin slab or its edge at a long camera distance.
export function ribbonCanopyHit(volumes, from, to, clearance) {
  if (!point(from) || !point(to)) throw new TypeError('Finite scene segment required');
  const { radius, below, above } = extent(clearance);
  let earliest = null;
  for (const volume of volumes) {
    const a = local(volume, from), b = local(volume, to);
    const lows = [-volume.halfLength - radius, volume.bottom - above, -volume.halfWidth - radius];
    const highs = [volume.halfLength + radius, volume.top + below, volume.halfWidth + radius];
    let enter = 0, leave = 1;
    for (let axis = 0; axis < 3; axis++) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-12) {
        if (a[axis] < lows[axis] || a[axis] > highs[axis]) { enter = 1; leave = 0; break; }
      } else {
        const p = (lows[axis] - a[axis]) / delta, q = (highs[axis] - a[axis]) / delta;
        enter = Math.max(enter, Math.min(p, q)); leave = Math.min(leave, Math.max(p, q));
        if (enter > leave) break;
      }
    }
    if (enter > leave) continue;
    if (radius > 0) {
      // The disk's swept footprint has rounded corners. The expanded box above
      // is only a broad phase: do not turn its empty corners into phantom walls.
      let contact = null;
      for (const [hx, hz] of [[volume.halfLength, volume.halfWidth + radius], [volume.halfLength + radius, volume.halfWidth]]) {
        let first = enter, last = leave;
        for (const [axis, half] of [[0, hx], [2, hz]]) {
          const delta = b[axis] - a[axis];
          if (Math.abs(delta) < 1e-12) {
            if (Math.abs(a[axis]) > half) { first = 1; last = 0; break; }
          } else {
            const p = (-half - a[axis]) / delta, q = (half - a[axis]) / delta;
            first = Math.max(first, Math.min(p, q)); last = Math.min(last, Math.max(p, q));
          }
        }
        if (first <= last) contact = Math.min(contact ?? first, first);
      }
      const vx = b[0] - a[0], vz = b[2] - a[2], speed2 = vx * vx + vz * vz;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const dx = a[0] - sx * volume.halfLength, dz = a[2] - sz * volume.halfWidth;
        const c = dx * dx + dz * dz - radius * radius;
        if (speed2 < 1e-24) {
          if (c <= 0) contact = Math.min(contact ?? enter, enter);
        } else {
          const dot = dx * vx + dz * vz, discriminant = dot * dot - speed2 * c;
          if (discriminant < 0) continue;
          const root = Math.sqrt(discriminant), first = Math.max(enter, (-dot - root) / speed2), last = Math.min(leave, (-dot + root) / speed2);
          if (first <= last) contact = Math.min(contact ?? first, first);
        }
      }
      if (contact === null) continue;
      enter = contact;
    }
    if (earliest === null || enter < earliest.fraction) earliest = { id: volume.id, fraction: enter };
  }
  return earliest;
}

// Oriented aircraft box against the canopy, including translation and rotation.
// Four horizontal separating axes and the vertical interval give exact box contact
// for translation. Bounded angular pieces enclose the entire intervening rotation.
export function ribbonCanopyBoxHit(volumes, from, to = from) {
  const valid = box => box && ['x', 'z', 'bottom', 'top', 'yaw', 'halfLength', 'halfWidth'].every(key => Number.isFinite(box[key]))
    && box.halfLength > 0 && box.halfWidth > 0 && box.top >= box.bottom;
  if (!valid(from) || !valid(to)) throw new TypeError('Finite oriented flight boxes required');
  const deltaYaw = Math.atan2(Math.sin(to.yaw) * Math.cos(from.yaw) - Math.cos(to.yaw) * Math.sin(from.yaw),
    Math.cos(to.yaw) * Math.cos(from.yaw) + Math.sin(to.yaw) * Math.sin(from.yaw));
  const startYaw = Math.atan2(Math.sin(from.yaw), Math.cos(from.yaw));
  const steps = Math.max(1, Math.ceil(Math.abs(deltaYaw) / 0.05));
  const interpolate = t => Object.fromEntries(['x', 'z', 'bottom', 'top', 'halfLength', 'halfWidth'].map(key => [key, from[key] + (to[key] - from[key]) * t]));
  for (let step = 0; step < steps; step++) {
    const t0 = step / steps, t1 = (step + 1) / steps, a = interpolate(t0), b = interpolate(t1);
    const yaw = startYaw + deltaYaw * (t0 + t1) / 2, c = Math.cos(yaw), s = Math.sin(yaw);
    const turnPadding = 2 * Math.hypot(Math.max(a.halfLength, b.halfLength), Math.max(a.halfWidth, b.halfWidth)) * Math.sin(Math.abs(deltaYaw) / steps / 4);
    const length = Math.max(a.halfLength, b.halfLength) + turnPadding, width = Math.max(a.halfWidth, b.halfWidth) + turnPadding;
    let earliest = null;
    for (const volume of volumes) {
      let enter = 0, leave = 1;
      const clip = (value, delta, low, high) => {
        if (Math.abs(delta) < 1e-12) return value >= low && value <= high;
        const p = (low - value) / delta, q = (high - value) / delta;
        enter = Math.max(enter, Math.min(p, q)); leave = Math.min(leave, Math.max(p, q));
        return enter <= leave;
      };
      // Treat each vertical face separately so sloped support along the path is retained.
      if (!clip(a.top, b.top - a.top, volume.bottom, Infinity)
        || !clip(a.bottom, b.bottom - a.bottom, -Infinity, volume.top)) continue;
      const axes = [[volume.cos, -volume.sin], [volume.sin, volume.cos], [c, -s], [s, c]];
      let separated = false;
      for (const [ax, az] of axes) {
        const limit = volume.halfLength * Math.abs(ax * volume.cos - az * volume.sin)
          + volume.halfWidth * Math.abs(ax * volume.sin + az * volume.cos)
          + length * Math.abs(ax * c - az * s) + width * Math.abs(ax * s + az * c);
        if (!clip((a.x - volume.x) * ax + (a.z - volume.z) * az, (b.x - a.x) * ax + (b.z - a.z) * az, -limit, limit)) { separated = true; break; }
      }
      if (!separated && (earliest === null || enter < earliest.fraction)) earliest = { id: volume.id, fraction: enter };
    }
    if (earliest) return { ...earliest, fraction: t0 + earliest.fraction / steps };
  }
  return null;
}
