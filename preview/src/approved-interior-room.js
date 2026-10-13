import { DOOR_HALF_WIDTH } from './store-rooms.js';

const distanceToEdge = (point, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
};
const inside = (point, polygon) => {
  let found = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) found = !found;
  }
  return found;
};
const clearOfPolygon = (point, polygon, margin = 0) => {
  const contained = inside(point, polygon);
  if (margin === 0) return contained;
  const distance = Math.min(...polygon.map((a, index) => distanceToEdge(point, a, polygon[(index + 1) % polygon.length])));
  return margin > 0 ? contained && distance > margin : contained || distance < -margin;
};

/** Adapt an approved level to the existing walking/room contract. */
export function approvedLevelRoom(plan, level, legacy) {
  const primary = level?.rooms?.[0], ground = level?.index === 0;
  const entrance = level?.portals?.find(portal => portal.kind === 'entrance');
  const stairs = level?.portals?.find(portal => portal.kind === 'stairs' && portal.toLevelId === plan?.levels?.[level.index - 1]?.id);
  if (!legacy || !Number.isInteger(level?.index) || plan?.levels?.[level.index]?.id !== level.id
    || !primary?.footprint || plan.buildingId !== legacy.buildingId
    || (ground ? entrance?.id !== `${level.id}/portal/${legacy.storeId}` : !stairs)) {
    throw new Error('Invalid approved level room');
  }
  const polygon = primary.footprint, local = polygon.map(point => legacy.toLocal(...point));
  const aMin = Math.min(...local.map(point => point[0])), aMax = Math.max(...local.map(point => point[0]));
  const frontInset = Math.min(...local.map(point => point[1])), depth = Math.max(...local.map(point => point[1]));
  const obstacles = level.layers.fixtures.map(fixture => {
    const points = fixture.footprint.map(point => legacy.toLocal(...point));
    return { id: fixture.id, kind: fixture.kind, footprint: fixture.footprint,
      a0: Math.min(...points.map(point => point[0])), a1: Math.max(...points.map(point => point[0])),
      d0: Math.min(...points.map(point => point[1])), d1: Math.max(...points.map(point => point[1])) };
  });
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const people = [];
  for (const person of ground ? legacy.people : []) {
    const desired = [clamp(person.a, aMin + 0.75, aMax - 0.75),
      clamp(person.d, frontInset + 0.75, depth - 0.75)];
    let placed = null;
    for (const [da, dd] of [[0, 0], [0, -0.75], [0, 0.75], [1, 0], [-1, 0], [1, -0.75], [-1, -0.75], [0, 1.5]]) {
      const a = clamp(desired[0] + da, aMin + 0.75, aMax - 0.75);
      const d = clamp(desired[1] + dd, frontInset + 0.75, depth - 0.75);
      const position = legacy.toWorld(a, d);
      if (!clearOfPolygon(position, polygon, 0.4)
        || obstacles.some(item => clearOfPolygon(position, item.footprint, -0.45))
        || people.some(other => Math.hypot(other.a - a, other.d - d) < 0.8)) continue;
      placed = { ...person, a, d }; break;
    }
    if (!placed) throw new Error('Approved room has no standing clearance');
    people.push(placed);
  }
  const bounds = ground ? [...polygon, legacy.toWorld(-DOOR_HALF_WIDTH, -1.4), legacy.toWorld(DOOR_HALF_WIDTH, -1.4)] : polygon;
  const room = {
    ...legacy, id: primary.id, planId: level.id, generatedPlan: level,
    aMin, aMax, center: (aMin + aMax) / 2, width: aMax - aMin, depth,
    frontInset, height: level.clearHeight, floor: level.floorElevation,
    footprint: polygon, obstacles, fixtures: [], people, lights: legacy.lights,
    summary: { label: ground ? legacy.summary.label : `${legacy.summary.label} · Level ${level.index + 1}`, highlights: [
      ...new Set(obstacles.map(item => item.kind === 'display' ? 'wall display' : item.kind)),
      `${level.layers.finishes[0]?.material ?? 'stone'} floor`,
    ] },
    lookupBounds: [Math.min(...bounds.map(p => p[0])), Math.min(...bounds.map(p => p[1])),
      Math.max(...bounds.map(p => p[0])), Math.max(...bounds.map(p => p[1]))],
  };
  room.contains = (east, north, margin = 0) => clearOfPolygon([east, north], polygon, margin);
  room.containsAccess = (east, north, margin = 0) => {
    if (room.contains(east, north, margin)) return true;
    if (!ground) return false;
    const [a, d] = room.toLocal(east, north);
    return d > -1.4 + Math.max(0, margin) && d < frontInset + Math.max(0, margin)
      && Math.abs(a) < DOOR_HALF_WIDTH - Math.max(0, margin);
  };
  room.blocks = (east, north, radius = 0) => obstacles.some(item =>
    clearOfPolygon([east, north], item.footprint, -radius));
  return room;
}

export function approvedGroundRoom(plan, legacy) {
  return approvedLevelRoom(plan, plan?.levels?.[0], legacy);
}
