// Place one approved furnished-space revision in a creator-region building (#420).
// One rigid transform maps the reviewed doorway onto the building's mapped entrance;
// nothing is scaled to fit. The server compiles the plan once, and the browser and the
// shared simulation consume that plan unchanged: collision, rendering and routes all
// read the same transformed objects.
import { APPROVED_SPACES, APPROVED_SPACE_ADAPTER_VERSION, approvedSpaceRecord, validApprovedSpaceDeclaration } from './approved-spaces.js';
export { validApprovedSpaceDeclaration };
import { spaceFootprint, spaceObjectBlocks, validateSpace } from './studio/space-document.js';
import { spaceRouteProfile } from './studio/space-templates.js';
import { spaceMovementSegment, SPACE_ROUTE_BUDGET } from './studio/space-assessment.js';
import { STREET } from './street-profile.js';

/** The renderer sources and textures this build draws approved spaces with (checked against the files in tests). */
export const CURRENT_SPACE_ASSETS = Object.freeze({ id: 'studio-space-forms', sha256: '615f2391fdbb92199366c25bb9b2b760091d9fea0c1624cd56a200bca1349588' });
export const APPROVED_SPACE_KIND = 'approved-space';
// A floor or object that differs from the doorway datum by more than this would float
// or sink at player height (#418 keeps contact within 5 mm on a level floor).
export const SUPPORT_TOLERANCE_M = 0.05;
const GRID = 0.25, DEPARTURE_GRID = 0.5, DEPARTURE_REACH_M = 80;

export class ApprovedSpaceError extends Error {
  constructor(code, message) { super(message); this.name = 'ApprovedSpaceError'; this.code = code; }
}
const fail = (code, message) => { throw new ApprovedSpaceError(code, message); };

const round = value => Math.round(value * 1e6) / 1e6 || 0;
const add = (a, b, scale = 1) => [a[0] + b[0] * scale, a[1] + b[1] * scale];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const distanceToSegment = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const inside = (p, ring) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
};
const edges = ring => ring.map((a, index) => [a, ring[(index + 1) % ring.length]]);
const edgeDistance = (p, ring) => Math.min(...edges(ring).map(([a, b]) => distanceToSegment(p, a, b)));
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segmentsCross = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < -1e-12 && cross(c, d, a) * cross(c, d, b) < -1e-12;
const segmentDistance = (a, b, c, d) => segmentsCross(a, b, c, d) ? 0
  : Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
/** Gap between two polygons: 0 when they touch, cross or one contains the other. */
const polygonGap = (a, b) => {
  if (a.some(p => inside(p, b)) || b.some(p => inside(p, a))) return 0;
  return Math.min(...edges(a).flatMap(([p, q]) => edges(b).map(([r, s]) => segmentDistance(p, q, r, s))));
};
const polygonPointGap = (polygon, p) => inside(p, polygon) ? 0 : edgeDistance(p, polygon);
// A street is drawn with its curb and sidewalk (sidewalks.js), raised above the terrain the
// server walks on; the terrace and arrival stay off the whole section. Footways are flat paths.
const streetReach = road => road.width_m / 2 + (road.kind === 'footway' ? 0.5 : STREET.curbWidth + STREET.sidewalkWidth);
const roadGap = (polygon, road) => Math.min(...road.points.slice(1).map((b, index) => {
  const a = road.points[index];
  return Math.min(polygonPointGap(polygon, a), ...edges(polygon).map(([p, q]) => segmentDistance(p, q, a, b)));
}));
const openRing = ring => {
  const points = ring.map(([x, y]) => [x, y]);
  if (points.length > 1 && Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 1e-7) points.pop();
  return points;
};

/**
 * Resolve a declaration to its reviewed record. `digest` hashes a string (the server
 * passes SHA-256), so a corrupted registry entry fails closed instead of being trusted.
 */
export function resolveApprovedSpace(declaration, { registry = APPROVED_SPACES, assets = CURRENT_SPACE_ASSETS, digest } = {}) {
  if (!validApprovedSpaceDeclaration(declaration)) fail('approved_space_invalid', 'Use an approved space reference: id, revision and sha256.');
  const record = approvedSpaceRecord(declaration.id, declaration.revision, registry);
  if (!record) fail('approved_space_unknown', 'That space revision has not been approved for placement.');
  if (declaration.sha256 !== record.documentSha256) fail('approved_space_stale', 'The approved space revision does not match the digest this region expects.');
  if (typeof digest !== 'function' || digest(JSON.stringify(record.space)) !== record.documentSha256)
    fail('approved_space_unknown', 'The approved space record failed its integrity check.');
  if (record.assets?.id !== assets.id || record.assets?.sha256 !== assets.sha256)
    fail('approved_space_assets', 'This approved space was reviewed with different assets; review and record a new revision.');
  validateSpace(record.space);
  const profile = spaceRouteProfile(record.profile);
  if (!profile || profile.targets.some(target => !record.space.objects.some(item => item.id === target.objectId && item.kind === target.kind)))
    fail('approved_space_policy', 'This approved space does not satisfy its current route profile.');
  return record;
}

/** The frame that carries the reviewed doorway onto a mapped entrance. */
export function approvedSpaceFrame(record, door, outward) {
  const length = Math.hypot(outward[0], outward[1]);
  if (!(length > 0.99 && length < 1.01)) fail('approved_space_fit', 'The building entrance has no direction.');
  const out = [outward[0] / length, outward[1] / length];
  const right = [-out[1], out[0]], inward = [-out[0], -out[1]];
  const { position: origin, outward: spaceOut } = record.placement.entrance;
  const spaceRight = [-spaceOut[1], spaceOut[0]], spaceIn = [-spaceOut[0], -spaceOut[1]];
  // A proper rotation: both bases are right-handed, so nothing is mirrored.
  const toLocal = p => [dot([p[0] - origin[0], p[1] - origin[1]], spaceRight), dot([p[0] - origin[0], p[1] - origin[1]], spaceIn)];
  const fromLocal = ([a, d]) => add(add(door, right, a), inward, d);
  const toWorld = p => fromLocal(toLocal(p));
  const east = [right[0] * spaceRight[0] + inward[0] * spaceIn[0], right[1] * spaceRight[0] + inward[1] * spaceIn[0]];
  const north = [right[0] * spaceRight[1] + inward[0] * spaceIn[1], right[1] * spaceRight[1] + inward[1] * spaceIn[1]];
  const rotation = Math.atan2(east[1], east[0]) * 180 / Math.PI;
  return { door, outward: out, right, inward, east, north, rotation, toWorld, toLocal,
    fromWorld: p => { const v = [p[0] - door[0], p[1] - door[1]]; return add(add(origin, spaceRight, dot(v, right)), spaceIn, dot(v, inward)); },
    depth: p => dot([p[0] - door[0], p[1] - door[1]], inward) };
}

const yawIn = (yaw, rotation) => { let value = yaw + rotation; while (value > 180) value -= 360; while (value <= -180) value += 360; return round(value); };

/**
 * Transform an approved revision into one building and check volume, neighbours and
 * support. Routes are checked separately, against the assembled world.
 * `region`: { bounds, buildings, roads, trees, places, parcels, stores, spawn }.
 */
export function placeApprovedSpace({ worldId, building, store, record, interior, altitude, region }) {
  if (!record.placement.buildingKinds.includes(building.kind) || !record.placement.categories.includes(interior.category))
    fail('approved_space_policy', `${record.name} can only be placed in a ${record.placement.categories.join(' or ')} venue.`);
  const ring = openRing(building.ring), door = store.facade.slice(0, 2), floor = store.facade[2];
  const frame = approvedSpaceFrame(record, door, store.outward);
  const room = record.placement.room;
  const roomWorld = room.map(p => frame.toWorld(p).map(round));
  const nearRoom = p => inside(p, room) || edgeDistance(p, room) <= 0.1;
  const objects = record.space.objects.map(item => {
    const [east, north] = frame.toWorld([item.east, item.north]);
    return { ...item, east: round(east), north: round(north), yaw: yawIn(item.yaw, frame.rotation), outdoor: !nearRoom([item.east, item.north]) };
  });
  const footprintOf = item => spaceFootprint(item).map(p => p.map(round));
  // Volume: the walk-in floor and everything standing on it stay inside the building,
  // apart from the street glazing, which may sit up to 10 cm proud of the facade.
  if (building.size[2] < record.placement.clearHeight + 0.4) fail('approved_space_fit', `${record.name} needs ${record.placement.clearHeight + 0.4} m of building height.`);
  // Points on the facade line are tested 2 cm inside it, so rounding after a rotation
  // cannot make an edge that runs along the facade appear to cross it.
  const intoBuilding = point => { const depth = frame.depth(point); return depth < 0.02 ? add(point, frame.inward, 0.02 - depth) : point; };
  const shell = [roomWorld, ...objects.filter(item => !item.outdoor).map(footprintOf)];
  for (const polygon of shell) for (const point of polygon) {
    if (frame.depth(point) < -0.1 || !inside(intoBuilding(point), ring))
      fail('approved_space_fit', `${record.name} does not fit this building at its entrance; choose a larger building.`);
  }
  const roomInside = roomWorld.map(intoBuilding);
  if (ring.some(p => inside(p, roomInside)) || edges(roomInside).some(([a, b]) => edges(ring).some(([c, d]) => segmentsCross(a, b, c, d))))
    fail('approved_space_fit', `${record.name} does not fit this building at its entrance; choose a larger building.`);
  for (const other of region.stores) {
    if (other.id === store.id || other.building_id !== building.id) continue;
    if (inside(other.facade, roomWorld) || edgeDistance(other.facade, roomWorld) < 1.5)
      fail('approved_space_neighbor', `${record.name} would cover another venue's doorway in this building.`);
  }
  // Neighbours and support for everything outside the facade (the terrace and arrival).
  const [west, south, east, north] = region.bounds;
  const blockers = [];
  for (const item of objects.filter(item => item.outdoor)) {
    const footprint = footprintOf(item), blocks = spaceObjectBlocks(item);
    if (footprint.some(([x, y]) => x < west + 1 || x > east - 1 || y < south + 1 || y > north - 1))
      fail('approved_space_neighbor', `${record.name}'s ${item.label.toLowerCase()} would leave the region.`);
    if (polygonGap(footprint, ring) < 0.05) fail('approved_space_neighbor', `${record.name}'s ${item.label.toLowerCase()} would stand in its own building.`);
    for (const other of region.buildings) if (other.id !== building.id && polygonGap(footprint, openRing(other.ring)) < 0.2)
      fail('approved_space_neighbor', `${record.name}'s ${item.label.toLowerCase()} would touch ${other.id}.`);
    for (const road of region.roads) if (roadGap(footprint, road) < streetReach(road))
      fail('approved_space_neighbor', `${record.name}'s ${item.label.toLowerCase()} would stand on ${road.name} or its sidewalk.`);
    for (const tree of region.trees) if (polygonPointGap(footprint, tree.position) < 0.4)
      fail('approved_space_neighbor', `${record.name}'s ${item.label.toLowerCase()} would stand on a tree.`);
    for (const parcel of region.parcels) {
      const [l, b, r, t] = parcel.bounds_m, center = building.center;
      const owns = center[0] > l && center[0] < r && center[1] > b && center[1] < t;
      if (!owns && footprint.some(([x, y]) => x > l && x < r && y > b && y < t)) fail('approved_space_neighbor', `${record.name}'s ${item.label.toLowerCase()} would reach into ${parcel.name}.`);
    }
    if (blocks) {
      const keepClear = [region.spawn, ...region.places.map(place => place.position),
        ...region.stores.filter(other => other.id !== store.id).flatMap(other => [other.facade, other.visit])];
      if (keepClear.some(point => polygonPointGap(footprint, point) < 0.6))
        fail('approved_space_neighbor', `${record.name}'s ${item.label.toLowerCase()} would block an arrival or a named place.`);
      blockers.push({ id: `${building.id}/outdoor/${item.id}`, kind: item.kind, footprint });
    }
    const center = [item.east, item.north];
    for (const point of [center, ...footprint]) if (Math.abs(altitude(point) - floor) > SUPPORT_TOLERANCE_M)
      fail('approved_space_support', `${record.name}'s ${item.label.toLowerCase()} needs level ground at the doorway's height.`);
  }
  const profile = spaceRouteProfile(record.profile);
  const arrival = frame.toWorld(record.space.spawn).map(round);
  if (Math.abs(altitude(arrival) - floor) > SUPPORT_TOLERANCE_M) fail('approved_space_support', `${record.name}'s arrival needs level ground at the doorway's height.`);
  const near = [arrival[0] - 0.35, arrival[1] - 0.35], far = [arrival[0] + 0.35, arrival[1] + 0.35];
  const standing = [near, [far[0], near[1]], far, [near[0], far[1]]];
  for (const road of region.roads) if (roadGap(standing, road) < streetReach(road))
    fail('approved_space_neighbor', `${record.name}'s arrival would stand on ${road.name} or its sidewalk.`);
  const levelId = `${building.id}/l0`;
  const indoorBlockers = objects.filter(item => !item.outdoor && spaceObjectBlocks(item));
  const floorFinish = record.space.objects.find(item => item.kind === 'floor' && nearRoom([item.east, item.north]))?.finish ?? 'limestone';
  return {
    schemaVersion: 1, kind: APPROVED_SPACE_KIND, adapterVersion: APPROVED_SPACE_ADAPTER_VERSION, worldId, buildingId: building.id,
    source: { id: record.id, revision: record.revision, name: record.name, documentSha256: record.documentSha256,
      assetsSha256: record.assets.sha256, profile: { ...record.profile } },
    placement: { door: door.map(round), outward: frame.outward.map(round), east: frame.east.map(round), north: frame.north.map(round),
      rotationDeg: round(frame.rotation), spaceEntrance: [...record.placement.entrance.position], spaceBounds: [...record.space.bounds_m], floorElevation: round(floor) },
    footprint: ring.map(p => p.map(round)),
    levels: [{
      id: levelId, index: 0, floorElevation: round(floor), clearHeight: record.placement.clearHeight,
      rooms: [{ id: `${levelId}/room/main`, kind: 'primary', footprint: roomWorld }],
      portals: [{ id: `${levelId}/portal/${store.id}`, kind: 'entrance', position: door.map(round), outward: frame.outward.map(round), levelId }],
      layers: {
        shell: [{ id: `${levelId}/shell`, floor: roomWorld, stairOpening: null }], partitions: [],
        fixtures: indoorBlockers.map(item => ({ id: `${levelId}/object/${item.id}`, kind: item.kind, footprint: footprintOf(item) })),
        finishes: [{ id: `${levelId}/finish/floor`, material: floorFinish }], authoredOverrides: [],
      },
    }],
    space: { lighting: record.space.lighting, objects },
    outdoor: blockers,
    routes: { arrival, exit: arrival,
      targets: profile.targets.map(target => ({ id: target.id, label: target.label, objectId: target.objectId, position: frame.toWorld(target.position).map(round) })) },
  };
}

/** The reviewed revisions a compiled world places, as sorted `id@revision` keys. */
export const approvedSpaceSources = world => [...new Set((world?.buildingInteriors ?? [])
  .filter(plan => plan.kind === APPROVED_SPACE_KIND).map(plan => `${plan.source.id}@${plan.source.revision}`))].sort();

/**
 * Recheck a compiled world's placed revisions against what this build serves: the
 * record, its document and asset digests, the adapter and the route profile. Activation
 * calls this again because a candidate may have been compiled by an older build.
 */
export function approvedSpacesCurrent(world, { registry = APPROVED_SPACES, assets = CURRENT_SPACE_ASSETS } = {}) {
  return (world?.buildingInteriors ?? []).filter(plan => plan.kind === APPROVED_SPACE_KIND).every(plan => {
    const record = approvedSpaceRecord(plan.source?.id, plan.source?.revision, registry);
    return Boolean(record) && plan.adapterVersion === APPROVED_SPACE_ADAPTER_VERSION
      && plan.source.documentSha256 === record.documentSha256 && plan.source.assetsSha256 === record.assets.sha256
      && record.assets.id === assets.id && record.assets.sha256 === assets.sha256
      && plan.source.profile?.templateId === record.profile.templateId && plan.source.profile?.profileVersion === record.profile.profileVersion
      && Boolean(spaceRouteProfile(record.profile));
  });
}

/** Whether every point keeps `distance` from the space's pieces outside the building. */
export const outdoorClearOf = (plan, points, distance) => plan.space.objects.filter(item => item.outdoor)
  .every(item => { const footprint = spaceFootprint(item); return points.every(point => polygonPointGap(footprint, point) >= distance); });

/** Collision rings outside the building, for the compiled world's shared collision list. */
export const approvedSpaceOutdoorRings = plan => plan.outdoor.map(item => [...item.footprint.map(p => [...p]), [...item.footprint[0]]]);

/**
 * Walk every required route in the assembled world with the real controller: from the
 * arrival to each destination and back, the exit, and away to the nearest street. The
 * search uses the same bounded grid and both-way segment checks as Studio (#414).
 */
export function verifyApprovedSpaceRoutes(plan, environment, { roads = [], maxWork = SPACE_ROUTE_BUDGET } = {}) {
  const { door, east: E, north: N, spaceEntrance, spaceBounds } = plan.placement;
  const toSpace = p => { const v = [p[0] - door[0], p[1] - door[1]]; return [spaceEntrance[0] + dot(v, E), spaceEntrance[1] + dot(v, N)]; };
  const result = { status: 'passed', controller: 'studio-walking-v1', radius: 0.35, grid: GRID, work: 0, findings: [], routes: [] };
  const exhausted = Symbol('budget');
  const spend = () => { if (++result.work > Math.min(SPACE_ROUTE_BUDGET, maxWork)) throw exhausted; };
  const segments = new Map(), key = p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const free = p => environment.isFree(p[0], -p[1]);
  const edge = (a, b) => {
    const id = [key(a), key(b)].sort().join('|');
    if (!segments.has(id)) { spend(); segments.set(id, spaceMovementSegment(environment, a, b) && spaceMovementSegment(environment, b, a)); }
    return segments.get(id);
  };
  // Destination routes stay inside the reviewed bounds, as in Studio.
  const withinSpace = p => {
    const [u, v] = toSpace(p), [w, s, e, n] = spaceBounds;
    return u >= w && u <= e && v >= s && v <= n;
  };
  const route = (from, to, grid, bounded) => {
    if (!free(from) || !free(to)) return null;
    const start = { p: from, ix: 0, iy: 0, cost: 0, parent: null }, open = [start], best = new Map([[key(from), 0]]);
    const heuristic = p => { const [u, v] = [dot([to[0] - p[0], to[1] - p[1]], E), dot([to[0] - p[0], to[1] - p[1]], N)]; return Math.abs(u) + Math.abs(v); };
    while (open.length) {
      spend();
      let index = 0;
      for (let i = 1; i < open.length; i++) {
        const f = open[i].cost + heuristic(open[i].p), g = open[index].cost + heuristic(open[index].p);
        if (f < g - 1e-9 || Math.abs(f - g) <= 1e-9 && heuristic(open[i].p) < heuristic(open[index].p)) index = i;
      }
      const current = open.splice(index, 1)[0];
      if (current.cost !== best.get(key(current.p))) continue;
      if (Math.hypot(current.p[0] - to[0], current.p[1] - to[1]) <= grid && edge(current.p, to)) {
        const points = [to];
        for (let node = current; node; node = node.parent) points.push(node.p);
        return points.reverse();
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ix = current.ix + dx, iy = current.iy + dy;
        const p = add(add(from, E, ix * grid), N, iy * grid), cost = current.cost + grid;
        if (bounded && !withinSpace(p) || (best.get(key(p)) ?? Infinity) <= cost) continue;
        if (!edge(current.p, p)) continue;
        best.set(key(p), cost); open.push({ p, ix, iy, cost, parent: current });
      }
    }
    return null;
  };
  const targets = [{ id: 'exit', label: 'exit', position: plan.routes.exit }, ...plan.routes.targets];
  let target;
  try {
    for (target of targets) {
      const points = route(plan.routes.arrival, target.position, GRID, true);
      if (!points) { result.findings.push({ ruleId: 'required-route', targetId: target.id, message: `No walkable route from the arrival to ${target.label} and back.` }); return { ...result, status: 'blocked' }; }
      result.routes.push({ targetId: target.id, points: points.length, returnChecked: true });
    }
    // Departure: the nearest free street point outside the reviewed space.
    target = { id: 'departure', label: 'the street' };
    const candidates = [];
    for (const road of roads) for (let index = 1; index < road.points.length; index++) {
      const a = road.points[index - 1], b = road.points[index], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t <= length; t += 0.5) {
        const p = [a[0] + (b[0] - a[0]) * t / length, a[1] + (b[1] - a[1]) * t / length];
        const distance = Math.hypot(p[0] - plan.routes.arrival[0], p[1] - plan.routes.arrival[1]);
        if (distance <= DEPARTURE_REACH_M && !withinSpace(p) && free(p)) candidates.push({ p, distance });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const street = candidates[0]?.p;
    const points = street && route(plan.routes.arrival, street, DEPARTURE_GRID, false);
    if (!points) { result.findings.push({ ruleId: 'departure', targetId: 'departure', message: 'No walkable route from the arrival to the street.' }); return { ...result, status: 'blocked' }; }
    result.routes.push({ targetId: 'departure', points: points.length, returnChecked: true, to: street.map(round) });
  } catch (error) {
    if (error !== exhausted) throw error;
    result.findings.push({ ruleId: 'route-budget', targetId: target?.id ?? 'exit', message: 'Route checks reached their work limit.' });
    return { ...result, status: 'blocked' };
  }
  return result;
}
