// The Gardens' upper floors as authoritative walking levels (#508), shared by the client's
// walking prediction and the server's pose authority. Every campus floor above the street
// (garden-campus/l1..l7) is one generated-plan room whose support is #506's
// campusSupportAt: a body stands on public or private-suite floor of its own level, never in
// a service room, and never within its radius of a shaft, guard, planter, headhouse, suite
// wall (#507 partitions), facade glass or registered furniture. Facade glass is each plate
// edge minus the contract's skywalk portals and terrace doors, so a walker crosses a facade
// only where the drawings open it, and walks the skywalks from facade to facade.
//
// The street level (l0) stays the street: its halls are store rooms that carry
// planId 'garden-campus/l0', so their core lobbies are where the lift and stairs start.
// Which suite a resident may enter is per player and the server's (#509 campusSuiteAccess);
// this shared room treats suite floor as walkable and the walls leave only the door.
import { CAMPUS_BODY, GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, campusSupportAt, campusToSource, sourceToCampus } from '../../shared/garden-campus-layout.js';
import { campusPartitions } from '../../shared/garden-campus-partitions.js';

export const CAMPUS_BUILDING_ID = 'garden-campus';
export const CAMPUS_GROUND_LEVEL = `${CAMPUS_BUILDING_ID}/l0`;
export const isCampusLevelId = levelId => typeof levelId === 'string' && /^garden-campus\/l[0-7]$/.test(levelId);
const GLASS = 0.14; // the glass line sits 0.1 m inside the plate edge; the band covers it and its mullions
const EPS = 1e-6;
const rectGap = ([u0, v0, u1, v1], [u, v]) => Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1));

// Extra per-level blockers (#510's fit-out furniture): provider(levelId) -> [{ id, rect }] in
// campus metres. Contract-derived and the same for every world, so registered once per module.
const providers = [];
let providerVersion = 0;
export function registerCampusLevelObstacles(provider) {
  if (typeof provider !== 'function') throw new TypeError('A campus obstacle provider is a function of the level id');
  providers.push(provider);providerVersion++;
}
// The client's own prediction may refuse suites its resident cannot enter, so a stranger is
// stopped at the door instead of corrected after it. The server never sets this; it checks
// suite access per player on every step.
let suiteGate = null;
export function setCampusSuiteGate(gate) { suiteGate = typeof gate === 'function' ? gate : null; }

const planCache = new WeakMap();
/** The campus floors as one interior plan, in source coordinates; null without the campus. */
export function campusInteriorPlan(world) {
  if (!world?.gardenCampus) return null;
  if (!planCache.has(world)) {
    const levels = campusLevels(CAMPUS).map(level => ({
      id: level.id, index: Number(level.id.slice(-1)), z: level.z, floorElevation: CAMPUS.frame.baseAltitude + level.z,
      portals: level.portals.map(portal => ({ id: portal.id, kind: portal.kind, tower: portal.tower,
        position: campusToSource(portal.position).slice(0, 2), toLevelId: portal.toLevel, toPortal: portal.toPortal })),
    }));
    planCache.set(world, { buildingId: CAMPUS_BUILDING_ID, campus: true, levels });
  }
  return planCache.get(world);
}

/** The glass on each plate edge of a level, as thin rects inside the plate, minus the openings it has. */
export function campusFacadeGlass(levelId) {
  const level = campusLevels(CAMPUS).find(item => item.id === levelId), glass = [];
  if (!level) return glass;
  const cuts = level.openings.filter(opening => opening.kind === 'skywalk-portal' || opening.kind === 'terrace-door' || opening.kind === 'entrance');
  for (const tower of CAMPUS.towers) for (const floor of tower.levels.filter(item => item.z0 === level.z)) {
    const [u0, v0, u1, v1] = floor.rect;
    for (const [axis, at, lo, hi, band] of [[1, v0, u0, u1, [v0, v0 + GLASS]], [1, v1, u0, u1, [v1 - GLASS, v1]], [0, u0, v0, v1, [u0, u0 + GLASS]], [0, u1, v0, v1, [u1 - GLASS, u1]]]) {
      let free = [[lo, hi]];
      for (const opening of cuts.filter(item => Math.abs(item.position[axis] - at) < EPS)) {
        const centre = opening.position[1 - axis], half = opening.width / 2;
        free = free.flatMap(([a, b]) => [[a, Math.min(b, centre - half)], [Math.max(a, centre + half), b]].filter(([x, y]) => y - x > 0.02));
      }
      for (const [a, b] of free) glass.push({ id: `${floor.id}/glass-${axis ? (at === v0 ? 'south' : 'north') : (at === u0 ? 'west' : 'east')}`, rect: axis ? [a, band[0], b, band[1]] : [band[0], a, band[1], b] });
    }
  }
  return glass;
}

const roomCache = new WeakMap();
/** The generated-plan room for an upper campus level (index > 0), or null. */
export function campusLevelRoom(world, levelId) {
  const plan = campusInteriorPlan(world), level = plan?.levels.find(item => item.id === levelId && item.index > 0);
  if (!level) return null;
  if (!roomCache.has(world)) roomCache.set(world, new Map());
  const rooms = roomCache.get(world);
  if (!rooms.has(levelId)) rooms.set(levelId, buildLevelRoom(plan, level));
  return rooms.get(levelId);
}

function buildLevelRoom(plan, level) {
  const contract = campusLevels(CAMPUS).find(item => item.id === level.id), slab = CAMPUS.bridges[0].slab;
  const walls = campusPartitions(CAMPUS).walls.filter(wall => wall.levelId === level.id && wall.z0 <= level.z + EPS);
  const fixed = [...contract.obstacles, ...walls.map(wall => ({ id: `${wall.room}/wall`, kind: 'wall', rect: wall.rect })), ...campusFacadeGlass(level.id).map(item => ({ ...item, kind: 'glass' })),
    ...contract.surfaces.filter(surface => surface.access === 'service').map(surface => ({ id: surface.id, kind: 'service', rect: surface.rect }))];
  let registered = [], seenVersion = -1;
  const blockers = () => {
    if (seenVersion !== providerVersion) { registered = providers.flatMap(provider => provider(level.id) ?? []);seenVersion = providerVersion; }
    return registered.length ? [...fixed, ...registered] : fixed;
  };
  const corners = contract.surfaces.flatMap(({ rect: [u0, v0, u1, v1] }) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(point => campusToSource(point)));
  const tops = CAMPUS.towers.flatMap(tower => tower.levels.filter(floor => floor.z0 === level.z).map(floor => floor.z1 - slab));
  const local = (east, north) => sourceToCampus([east, north]);
  const support = (east, north) => {
    const [u, v] = local(east, north), at = campusSupportAt(level.id, u, v);
    if (!at || at.access === 'service') return null;
    if (at.access === 'private-suite' && suiteGate && !suiteGate(at.surfaceId)) return null;
    return at;
  };
  const room = {
    id: `campus-level:${level.id}`, storeId: `campus-level:${level.id}`, buildingId: plan.buildingId, planId: level.id, generatedPlan: level,
    name: `The Gardens · Floor ${level.index + 1}`, category: 'campus', theme: 'campus', campusLevel: level.id,
    floor: level.floorElevation, height: tops.length ? Math.min(...tops) - level.z : CAMPUS_BODY.height + 1,
    // Campus metres as the room's local frame: a along v, d along u.
    toLocal: (east, north) => { const [u, v] = local(east, north);return [v, u]; },
    toWorld: (a, d) => campusToSource([d, a]).slice(0, 2),
    obstacles: [], fixtures: [], people: [], lights: [],
    summary: { label: 'Public galleries, skywalks, terraces and roofs', highlights: ['lift and stairs at every core', 'suites by lease'] },
    lookupBounds: [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])), Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1]))],
    supportAt: support,
    contains: (east, north) => Boolean(support(east, north)),
    containsAccess: (east, north) => Boolean(support(east, north)),
    blocks: (east, north, radius = 0) => { const point = local(east, north);return blockers().some(item => rectGap(item.rect, point) < radius); },
  };
  return room;
}

/** The plan level for any interior level id: a building interior's or the campus's. */
export function interiorLevelFor(world, levelId) {
  for (const plan of world?.buildingInteriors ?? []) { const level = plan.levels?.find(item => item.id === levelId);if (level) return { plan, level }; }
  const plan = campusInteriorPlan(world), level = plan?.levels.find(item => item.id === levelId);
  return level ? { plan, level } : null;
}
