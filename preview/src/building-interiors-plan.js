// A bounded, serializable building interior contract. The server approves this
// plan; renderers may turn it into meshes but must not invent shared collision.
export const BUILDING_INTERIOR_GENERATOR_VERSION = 1;

const finite = value => Number.isFinite(value);
const point = value => Array.isArray(value) && value.length >= 2 && finite(value[0]) && finite(value[1])
  && Math.abs(value[0]) <= 10000 && Math.abs(value[1]) <= 10000;
const fail = message => { throw new Error(`Invalid building interior ${message}`); };
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const distanceToEdge = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const onBoundary = (p, ring, tolerance = 1e-7) => ring.some((a, index) => distanceToEdge(p, a, ring[(index + 1) % ring.length]) <= tolerance);
const inside = (p, ring) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
};
const segmentsCross = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < -1e-12 && cross(c, d, a) * cross(c, d, b) < -1e-12;
const ringArea = ring => Math.abs(ring.reduce((area, p, index) => area + p[0] * ring[(index + 1) % ring.length][1] - ring[(index + 1) % ring.length][0] * p[1], 0)) / 2;

function normalizedRing(value) {
  if (!Array.isArray(value) || value.length < 4 || value.length > 64 || !value.every(point)) fail('footprint');
  const ring = value.map(([x, y]) => [x, y]);
  if (Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) < 1e-7) ring.pop();
  if (ring.length < 3 || ringArea(ring) < 24) fail('footprint');
  for (let i = 0; i < ring.length; i++) {
    if (Math.hypot(ring[i][0] - ring[(i + 1) % ring.length][0], ring[i][1] - ring[(i + 1) % ring.length][1]) < 0.1) fail('footprint');
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue;
      if (segmentsCross(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) fail('footprint');
    }
  }
  return ring;
}

function polygonFits(polygon, ring, clearance = 0.25) {
  if (polygon.some(p => !inside(p, ring) || ring.some((edge, i) => distanceToEdge(p, edge, ring[(i + 1) % ring.length]) < clearance))) return false;
  for (let i = 0; i < polygon.length; i++) for (let j = 0; j < ring.length; j++)
    if (segmentsCross(polygon[i], polygon[(i + 1) % polygon.length], ring[j], ring[(j + 1) % ring.length])) return false;
  // A concave notch may lie wholly inside the candidate despite its corners
  // being inside the building, so reject any ring vertex within the candidate.
  if (ring.some(p => inside(p, polygon) || onBoundary(p, polygon))) return false;
  return true;
}

function polygonsOverlap(a, b, clearance = 0.2) {
  if (a.some(p => inside(p, b) || onBoundary(p, b)) || b.some(p => inside(p, a) || onBoundary(p, a))) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    if (distanceToEdge(a[i], b[j], b[(j + 1) % b.length]) < clearance
      || distanceToEdge(b[j], a[i], a[(i + 1) % a.length]) < clearance) return true;
  }
  return false;
}

function hash32(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

const footprint = (toWorld, left, right, front, back) => [
  toWorld(left, front), toWorld(right, front), toWorld(right, back), toWorld(left, back),
];

export function buildingLocalToWorld(anchor, [u, v]) {
  return [anchor.origin[0] + u * anchor.eastAxis[0] + v * anchor.northAxis[0],
    anchor.origin[1] + u * anchor.eastAxis[1] + v * anchor.northAxis[1]];
}

export function worldToBuildingLocal(anchor, [east, north]) {
  const x = east - anchor.origin[0], y = north - anchor.origin[1];
  return [x * anchor.eastAxis[0] + y * anchor.eastAxis[1],
    x * anchor.northAxis[0] + y * anchor.northAxis[1]];
}

/** Generate one versioned building plan from approved primitive and entrance data. */
export function generateBuildingInteriorPlan({ worldId, building, entrance, seed = building?.id, levels = 1, baseElevation = building?.center?.[2], reservedFootprints = [] } = {}) {
  if (!id(worldId) || !id(building?.id) || !Array.isArray(building?.center) || building.center.length !== 3
    || !point(building.center) || !finite(building.center[2])
    || !Array.isArray(building?.size) || building.size.length !== 3 || !building.size.every(finite)
    || building.size[0] < 5 || building.size[1] < 4.5 || building.size[2] < 4.3
    || !finite(building.yaw_deg) || !finite(baseElevation)) fail('building anchor');
  if (typeof seed !== 'string' || seed.length < 1 || seed.length > 128 || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(seed)) fail('seed');
  if (!Number.isInteger(levels) || levels < 1 || levels > 8) fail('level count');
  if (!Array.isArray(reservedFootprints) || reservedFootprints.length > 32
    || reservedFootprints.some(polygon => !Array.isArray(polygon) || polygon.length < 3 || polygon.length > 64 || !polygon.every(point))) fail('reserved footprint');
  const reserved = reservedFootprints.map(polygon => polygon.map(([x, y]) => [x, y]));
  const ring = normalizedRing(building.ring);
  const roof = building.center[2] + building.size[2];
  const floorElevation = index => baseElevation + (index ? 4.2 + (index - 1) * 3.5 : 0);
  const clearHeight = index => index ? 3.2 : 3.9;
  if (floorElevation(levels - 1) + clearHeight(levels - 1) + 0.4 > roof + 1e-8) fail('height');
  if (!id(entrance?.id) || !point(entrance.position) || !point(entrance.outward)) fail('entrance');
  const [ex, ey] = entrance.position, [ox, oy] = entrance.outward, length = Math.hypot(ox, oy);
  if (length < 0.99 || length > 1.01 || !onBoundary([ex, ey], ring, 0.25)) fail('entrance');
  const outward = [ox / length, oy / length], inward = [-outward[0], -outward[1]], right = [-outward[1], outward[0]];
  if (!inside([ex + inward[0] * 0.5, ey + inward[1] * 0.5], ring)
    || inside([ex + outward[0] * 0.5, ey + outward[1] * 0.5], ring)) fail('entrance direction');
  const toWorld = (across, depth) => [ex + right[0] * across + inward[0] * depth, ey + right[1] * across + inward[1] * depth];
  let chosen = null;
  for (let width = 10; width >= 5; width -= 0.5) for (let depth = 9; depth >= 4.5; depth -= 0.5) {
    const polygon = footprint(toWorld, -width / 2, width / 2, 0.5, depth);
    if (width * depth <= (chosen?.area ?? 0) || !polygonFits(polygon, ring)
      || reserved.some(other => polygonsOverlap(polygon, other))) continue;
    chosen = { width, depth, polygon, area: width * depth };
  }
  if (!chosen) fail('footprint or entrance clearance');
  const stairCenter = toWorld(chosen.width / 2 - 1.35, chosen.depth - 1.8);
  const stairFootprint = footprint(toWorld, chosen.width / 2 - 2.15, chosen.width / 2 - 0.55, chosen.depth - 3, chosen.depth - 0.6);
  if (!polygonFits(stairFootprint, ring)) fail('stair clearance');
  const displayFootprint = footprint(toWorld, -chosen.width / 2 + 0.3, -chosen.width / 2 + 0.8, 2, 3.1);
  const radians = building.yaw_deg * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  const anchor = { origin: [building.center[0], building.center[1]], eastAxis: [c, s], northAxis: [-s, c], baseElevation };
  const localFootprint = polygon => polygon.map(p => worldToBuildingLocal(anchor, p));
  const key = `${worldId}:${building.id}:v${BUILDING_INTERIOR_GENERATOR_VERSION}:${seed}`;
  const palettes = ['limestone', 'oak', 'terracotta', 'concrete'];
  const planLevels = Array.from({ length: levels }, (_, index) => {
    const levelId = `${building.id}/l${index}`, elevation = floorElevation(index);
    const portals = index === 0 ? [{ id: `${levelId}/portal/${entrance.id}`, kind: 'entrance', position: [ex, ey], outward, levelId }] : [];
    if (index > 0) portals.push({ id: `${levelId}/portal/stairs-down`, kind: 'stairs', position: [...stairCenter], levelId, toLevelId: `${building.id}/l${index - 1}` });
    if (index < levels - 1) portals.push({ id: `${levelId}/portal/stairs-up`, kind: 'stairs', position: [...stairCenter], levelId, toLevelId: `${building.id}/l${index + 1}` });
    for (const portal of portals) portal.localPosition = worldToBuildingLocal(anchor, portal.position);
    return {
      id: levelId, index, floorElevation: elevation, clearHeight: clearHeight(index),
      rooms: [{ id: `${levelId}/room/main`, kind: 'primary', footprint: chosen.polygon.map(p => [...p]), localFootprint: localFootprint(chosen.polygon) }],
      portals,
      layers: {
        shell: [{ id: `${levelId}/shell`, floor: chosen.polygon.map(p => [...p]), localFloor: localFootprint(chosen.polygon),
          stairOpening: levels > 1 ? stairFootprint.map(p => [...p]) : null,
          localStairOpening: levels > 1 ? localFootprint(stairFootprint) : null }],
        partitions: [], fixtures: [{ id: `${levelId}/object/wall-display`, kind: 'display', footprint: displayFootprint.map(p => [...p]),
          localFootprint: localFootprint(displayFootprint) }],
        finishes: [{ id: `${levelId}/finish/floor`, material: palettes[hash32(`${key}:${index}:floor`) % palettes.length], variation: hash32(`${key}:${index}:variation`) }],
        authoredOverrides: [],
      },
    };
  });
  return {
    schemaVersion: 1, generatorVersion: BUILDING_INTERIOR_GENERATOR_VERSION, worldId, buildingId: building.id, seed,
    anchor,
    footprint: ring, levels: planLevels,
  };
}
