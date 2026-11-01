// The Five Rooms spatial contract (#825, #838): five venue envelopes on the existing District,
// the complete Ribbon (the #827 spine, a south segment and the links to each room), the
// exclusions that keep posts, canopy and planting out of people's way, and the ground each
// venue stands on. Data and validation only: nothing here renders, and nothing here moves a
// mapped parcel, street, entry anchor or the Gardens contract.
//
// Units and frame follow the city kit and district.json: metres, site-local x east, y north,
// heights as altitudes on the district datum. Every segment is expanded by ribbon-layout.js
// (`expandRibbon`), one segment at a time, so a changed point changes only that segment's
// placements and IDs. The site (buildings, roads, doors, benches, lane fixtures, tree pits,
// crowns, planting beds, tenant bays and the Gardens parcel) is passed in as plain data; the
// test rebuilds it from the live District modules, the server could do the same.
//
// A segment the ground refuses is not hidden: it is marked `status: "blocked"` in the data
// with the zones that block it and the moves that would clear it. The validator accepts a
// documented blocked segment and refuses an undocumented failure, a stale blocked claim, and
// any blocker the data names that the site does not confirm.
import { stableHash } from './assemble.js';
import { expandRibbon, RIBBON_KIT, RIBBON_RULES } from './ribbon-layout.js';
import { GARDEN_CAMPUS_LAYOUT, GARDEN_CAMPUS_VERSIONS, sourceToCampus, validateGardenCampus, rectContains } from '../garden-campus-layout.js';

export const FIVE_ROOMS_VERSION = 'five-rooms-v1';
export const VENUE_IDS = Object.freeze(['venue:counter', 'venue:atelier', 'venue:starlight-screen', 'venue:shade-garden', 'venue:studios-overlook']);
export const FIVE_ROOMS_RULES = Object.freeze({
  // A door's clear zone: along the facade and out from it. The repo states no door clearance;
  // this is the #827 working value until a door is measured.
  doorway: Object.freeze({ width: 2.4, depth: 2 }),
  // The reach in front of a storefront bench (a square), and the bench body itself.
  seatAccess: Object.freeze({ reach: 2.8, out: 0.6 }),
  bench: Object.freeze({ length: 1.6, depth: 0.6 }),
  // Lane lamps, planters and bins: a square footprint per fixture; door planters are smaller.
  fixture: 1.2,
  doorPlanter: Object.freeze({ size: 0.62, out: 1.05, across: 1.6 }),
  // A tree pit: the grate plus its stone frame. A crown is a disc of the tree's radius whose
  // underside is the lowest branch end (or 55% of the height when no branch is recorded).
  treePit: Object.freeze({ grate: 1.3, frame: 0.1 }),
  crownBaseShare: 0.55,
  // The canopy slab above the clear height, and the kerb beyond the carriageway.
  slab: 0.4,
  kerb: 0.15,
  roadPiece: 5,
  // Body clearance inside an envelope (shared/garden-campus-layout.js CAMPUS_BODY + headroom).
  minClearHeight: 2.75,
  // Two footprints sharing a mapped party wall may overlap by this much (metres).
  partyWall: 0.01,
  // How far a reach may run from a walk edge to a door, and how close a post may stand to a
  // camera's sight line.
  maxReach: 6,
  cameraStep: 0.25,
  venueKinds: Object.freeze(['bay', 'threshold']),
  retireStatuses: Object.freeze(['proposed', 'decided']),
  segmentStatuses: Object.freeze(['clear', 'blocked']),
  linkSides: Object.freeze(['left', 'right']),
  attachmentRoles: Object.freeze(['threshold', 'sign', 'counter', 'display-frame', 'seat-cluster', 'screen', 'bed', 'porch-light', 'lantern', 'anchor']),
});

const EPS = 1e-6;
const mm = value => Math.round(value * 1000) / 1000;
const idOk = (id, prefix = '') => typeof id === 'string' && id.startsWith(prefix) && /^[a-z0-9:][a-z0-9:-]{0,47}$/.test(id);
const pointOk = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const point3Ok = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const polygonOk = ring => Array.isArray(ring) && ring.length >= 3 && ring.length <= 16 && ring.every(pointOk);
const fail = message => { throw new Error(`Invalid five rooms layout: ${message}`); };
const rect = (x0, y0, x1, y1) => [mm(x0), mm(y0), mm(x1), mm(y1)];
const square = (x, y, half) => rect(x - half, y - half, x + half, y + half);
const corners = r => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
const bbox = ring => [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))];
const rectsOverlap = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > EPS && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > EPS;
const polygonArea = ring => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
// Separating axes: do two convex polygons share interior area? Touching does not count, nor an
// overlap no deeper than `tolerance` metres (mapped party walls agree only to the millimetre).
function overlaps(a, b, tolerance = 0) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], axis = [q[1] - p[1], p[0] - q[0]], size = Math.hypot(axis[0], axis[1]) || 1;
    const project = shape => shape.map(v => v[0] * axis[0] + v[1] * axis[1]);
    const pa = project(a), pb = project(b);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= (EPS + tolerance) * size) return false;
  }
  return true;
}
function inside(p, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
const distanceToSegment = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const onRing = (p, ring, tolerance) => ring.some((a, i) => distanceToSegment(p, a, ring[(i + 1) % ring.length]) <= tolerance);
const withinRing = (ring, outer, tolerance = 1e-3) => ring.every(p => inside(p, outer) || onRing(p, outer, tolerance));
const moduleShape = m => {
  const dir = [Math.cos(m.yaw), Math.sin(m.yaw)], n = [-dir[1], dir[0]], c = [(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [c[0] + i * dir[0] * m.length / 2 + j * n[0] * m.width / 2, c[1] + i * dir[1] * m.length / 2 + j * n[1] * m.width / 2]);
};
const postShape = post => corners(square(post.position[0], post.position[1], RIBBON_RULES.post / 2));
const slug = id => id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

// ---- Site: the District as plain data -------------------------------------------------
// `siteFromDistrict` takes the live world and the module outputs the test or a tool already
// has (scene-frame arrays from street-fixtures.js, street-furniture.js, landscape-models.js)
// and returns the site in source metres. Nothing here reads a renderer.
export function siteFromDistrict(world, { fixtures = { lamps: [], planters: [], bins: [] }, benches = [], treePits = [], trees = [], beds = [], tenants = [], groundAt = null, vegetation = null } = {}) {
  const supports = new Map((vegetation?.branch_supports ?? world?.vegetation?.branch_supports ?? []).map(tree => [`${mm(tree.position[0])},${mm(tree.position[1])}`, tree]));
  const named = (list, kind) => list.map((f, i) => ({ id: `${kind}-${i}`, kind, x: f[0], y: -f[2] }));
  return {
    scene: world?.scene ?? null,
    buildings: (world?.buildings ?? []).map(({ id, kind, ring, center }) => ({ id, kind, ring: ring.map(p => [p[0], p[1]]), center })),
    stores: (world?.stores ?? []).map(({ id, name, category, building_id, facade, outward }) => ({ id, name, category, buildingId: building_id, facade: [facade[0], facade[1]], outward: [outward[0], outward[1]] })),
    roads: (world?.roads ?? []).map(({ id, kind, width_m, points }) => ({ id, kind, width: width_m, points: points.map(p => [p[0], p[1]]) })),
    walkSpawn: world?.walkSpawn ? [world.walkSpawn[0], world.walkSpawn[1]] : null,
    fixtures: [...named(fixtures.lamps ?? [], 'lamp'), ...named(fixtures.planters ?? [], 'planter'), ...named(fixtures.bins ?? [], 'bin')],
    benches: benches.map((bench, i) => ({ id: `bench-${i}`, storeId: bench.storeId, x: bench.x, y: bench.north, outward: [bench.outward[0], bench.outward[1]] })),
    treePits: treePits.map((pit, i) => ({ id: `tree-pit-${i}`, x: pit[0], y: -pit[2], size: pit[3] })),
    trees: trees.map((tree, i) => {
      const x = tree.position[0], y = -tree.position[2], support = supports.get(`${mm(x)},${mm(y)}`);
      const ends = support?.endpoints?.length ? support.endpoints.map(p => p[2]) : null;
      return { id: `tree-${i}`, x, y, radius: tree.radius, height: tree.height, crownBase: ends ? Math.min(...ends) : tree.height * FIVE_ROOMS_RULES.crownBaseShare, basis: support?.basis ?? 'placement' };
    }),
    beds: beds.filter(Boolean).map(bed => ({ id: bed.id, ring: bed.ring.map(p => [p[0], p[1]]) })),
    tenants: tenants.map(room => ({ id: room.storeId, name: room.name, buildingId: room.buildingId, facade: [room.facade[0], room.facade[1]], outward: [room.outward[0], room.outward[1]], footprint: room.footprint.map(p => [p[0], p[1]]), width: room.width, depth: room.depth, floor: room.floor })),
    district: world,
    groundAt,
  };
}

// Every zone a post, seat or walk must keep out of, derived from the site. Doors of retired
// tenants become their venue's entrance zones instead (added by the expansion).
export function siteExclusions(site, { retired = new Set() } = {}) {
  const rules = FIVE_ROOMS_RULES, out = [], add = (id, kind, box, source) => out.push({ id, kind, rect: box, source });
  for (const store of site.stores) {
    if (retired.has(store.id)) continue;
    add(`door-${slug(store.id)}`.slice(0, 32), 'doorway', doorwayRect(store.facade, store.outward, rules.doorway.width, rules.doorway.depth), store.id);
    // Boxwood planters flank each boutique door (district.js); dining rooms, Le Colonial and the
    // rebuilt Harry Winston frontage have none.
    const dining = ['restaurant', 'ice_cream'].includes(store.category);
    if (!dining && store.name !== 'Le Colonial' && store.name !== 'Harry Winston') for (const side of [-1, 1]) {
      const [x, y] = store.facade, [nx, ny] = store.outward, across = side * rules.doorPlanter.across;
      add(`planter-${slug(store.id).slice(-4)}-${side < 0 ? 'l' : 'r'}`, 'no-go', square(x - ny * across + nx * rules.doorPlanter.out, y + nx * across + ny * rules.doorPlanter.out, rules.doorPlanter.size / 2), store.id);
    }
  }
  for (const bench of site.benches) {
    const [nx, ny] = bench.outward;
    add(`${bench.id}`, 'seat-access', square(bench.x + nx * rules.seatAccess.out, bench.y + ny * rules.seatAccess.out, rules.seatAccess.reach / 2), bench.storeId);
    const hx = Math.abs(ny) * rules.bench.length / 2 + Math.abs(nx) * rules.bench.depth / 2, hy = Math.abs(nx) * rules.bench.length / 2 + Math.abs(ny) * rules.bench.depth / 2;
    add(`${bench.id}-body`, 'no-go', rect(bench.x - hx, bench.y - hy, bench.x + hx, bench.y + hy), bench.storeId);
  }
  for (const fixture of site.fixtures) add(fixture.id, 'no-go', square(fixture.x, fixture.y, rules.fixture / 2), 'laneFixtures');
  site.buildings.forEach((building, i) => { const b = bbox(building.ring); add(`building-${i}`, 'no-go', rect(...b), building.id); });
  for (const road of site.roads) {
    const walkway = ['footway', 'pedestrian', 'path', 'steps'].includes(road.kind), half = road.width / 2 + (walkway ? 0 : rules.kerb), kind = walkway ? 'step-free' : 'no-go';
    let piece = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / rules.roadPiece));
      for (let j = 0; j < n; j++) {
        const p = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n], q = [a[0] + (b[0] - a[0]) * (j + 1) / n, a[1] + (b[1] - a[1]) * (j + 1) / n];
        const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1, ox = Math.abs(dy / len) * half, oy = Math.abs(dx / len) * half;
        add(`road-${road.id.replace(/^osm-way-/, '').replace(/-0$/, '')}-${piece++}`, kind, rect(Math.min(p[0], q[0]) - ox, Math.min(p[1], q[1]) - oy, Math.max(p[0], q[0]) + ox, Math.max(p[1], q[1]) + oy), road.id);
      }
    }
  }
  for (const pit of site.treePits) add(pit.id, 'no-go', square(pit.x, pit.y, pit.size / 2 + rules.treePit.frame), 'treePits');
  for (const bed of site.beds) add(bed.id, 'no-go', rect(...bbox(bed.ring)), 'reference-planting');
  return out;
}

export function doorwayRect([fx, fy], [nx, ny], width, depth) {
  const cx = fx + nx * depth / 2, cy = fy + ny * depth / 2;
  const hx = Math.abs(nx) * depth / 2 + Math.abs(ny) * width / 2, hy = Math.abs(ny) * depth / 2 + Math.abs(nx) * width / 2;
  return rect(cx - hx, cy - hy, cx + hx, cy + hy);
}

// ---- Schema ------------------------------------------------------------------------------
const KEYS = {
  root: ['id', 'version', 'kit', 'seed', 'world', 'units', 'rules', 'gardens', 'venues', 'ribbon', 'links', 'exclusions', 'notes'],
  venue: ['id', 'label', 'kind', 'host', 'retire', 'footprint', 'floor', 'entrances', 'interior', 'attachments', 'cameraCorridors', 'takesOver', 'notes'],
  entrance: ['id', 'centre', 'width', 'side', 'outward', 'link', 'approach', 'campusEntry', 'notes'],
  segment: ['id', 'points', 'width', 'clearHeight', 'style', 'seats', 'maxSpan', 'status', 'blocked', 'source', 'notes'],
  link: ['id', 'venue', 'entrance', 'segment', 'side', 'end', 'notes'],
  corridor: ['id', 'from', 'to', 'halfWidth', 'blockedBy', 'notes'],
  attachment: ['id', 'role', 'position', 'yaw', 'frame', 'notes'],
  blocked: ['reason', 'blockers', 'moves'],
};
const onlyKeys = (object, allowed, where) => { for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`${where}: unknown key ${key}`); };

export function validateFiveRooms(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) fail('not an object');
  onlyKeys(contract, KEYS.root, 'contract');
  if (!idOk(contract.id)) fail('id');
  if (contract.version !== FIVE_ROOMS_VERSION) fail(`version must be ${FIVE_ROOMS_VERSION}`);
  if (contract.kit !== RIBBON_KIT) fail(`kit must be ${RIBBON_KIT}`);
  if (!Number.isInteger(contract.seed) || contract.seed < 0 || contract.seed >= 2 ** 32) fail('seed');
  if (!contract.world || typeof contract.world.scene !== 'string') fail('world.scene');
  if (!contract.gardens || contract.gardens.layout !== GARDEN_CAMPUS_VERSIONS.layout || contract.gardens.schema !== GARDEN_CAMPUS_VERSIONS.schema) fail(`gardens must pin layout ${GARDEN_CAMPUS_VERSIONS.layout} schema ${GARDEN_CAMPUS_VERSIONS.schema}`);
  if (!GARDEN_CAMPUS_LAYOUT.entries.some(entry => entry.id === contract.gardens.entry)) fail(`gardens.entry ${contract.gardens.entry} is not a campus entry`);
  const ids = new Set(), unique = (kind, id, prefix) => { if (!idOk(id, prefix) || ids.has(id)) fail(`${kind} id ${id}`); ids.add(id); };
  const rules = FIVE_ROOMS_RULES;
  if (!Array.isArray(contract.venues) || contract.venues.length !== VENUE_IDS.length) fail(`needs ${VENUE_IDS.length} venues`);
  const entranceIds = new Map();
  contract.venues.forEach((venue, i) => {
    if (!venue || typeof venue !== 'object') fail('venue');
    onlyKeys(venue, KEYS.venue, `venue ${venue.id}`);
    if (venue.id !== VENUE_IDS[i]) fail(`venue ${i} must be ${VENUE_IDS[i]}`);
    unique('venue', venue.id, 'venue:');
    if (typeof venue.label !== 'string' || !venue.label) fail(`venue ${venue.id} label`);
    if (!rules.venueKinds.includes(venue.kind)) fail(`venue ${venue.id} kind must be ${rules.venueKinds.join(' or ')}`);
    if (!venue.host || typeof venue.host.buildingId !== 'string') fail(`venue ${venue.id} host.buildingId`);
    if (!venue.retire || !rules.retireStatuses.includes(venue.retire.status) || !Array.isArray(venue.retire.tenants) || !venue.retire.tenants.every(id => typeof id === 'string')) fail(`venue ${venue.id} retire needs a status (${rules.retireStatuses.join(', ')}) and tenants`);
    if (venue.retire.alternatives !== undefined && !(Array.isArray(venue.retire.alternatives) && venue.retire.alternatives.every(alt => alt && Array.isArray(alt.tenants) && typeof alt.note === 'string'))) fail(`venue ${venue.id} retire.alternatives`);
    if (!polygonOk(venue.footprint) || polygonArea(venue.footprint) < 4) fail(`venue ${venue.id} footprint`);
    if (!venue.floor || !Number.isFinite(venue.floor.height) || typeof venue.floor.source !== 'string' || !pointOk(venue.floor.at)) fail(`venue ${venue.id} floor needs height, source and at`);
    if (!Array.isArray(venue.entrances) || !venue.entrances.length) fail(`venue ${venue.id} needs an entrance`);
    for (const entrance of venue.entrances) {
      onlyKeys(entrance, KEYS.entrance, `entrance ${entrance.id}`);
      unique('entrance', entrance.id, 'entrance:');
      if (!pointOk(entrance.centre) || !(Number.isFinite(entrance.width) && entrance.width >= 1.2) || typeof entrance.side !== 'string' || !pointOk(entrance.outward)) fail(`entrance ${entrance.id} needs centre, width >= 1.2, side and outward`);
      if (Math.abs(Math.hypot(...entrance.outward) - 1) > 1e-3) fail(`entrance ${entrance.id} outward is not a unit vector`);
      if (typeof entrance.link !== 'string') fail(`entrance ${entrance.id} has no Ribbon link`);
      if (entrance.approach !== undefined && !(entrance.approach && entrance.approach.kind === 'lane-end' && typeof entrance.approach.road === 'string' && Number.isFinite(entrance.approach.within) && entrance.approach.within > 0 && entrance.approach.within <= 10)) fail(`entrance ${entrance.id} approach`);
      if (entrance.approach && !entrance.campusEntry) fail(`entrance ${entrance.id}: only a campus entry may approach along a lane end`);
      entranceIds.set(entrance.id, venue.id);
    }
    if (venue.kind === 'bay') {
      if (!venue.interior || !polygonOk(venue.interior.floor) || !(Number.isFinite(venue.interior.clearHeight) && venue.interior.clearHeight >= rules.minClearHeight)) fail(`venue ${venue.id} interior needs a floor polygon and clearHeight >= ${rules.minClearHeight}`);
    } else if (venue.interior !== null) fail(`venue ${venue.id} is a threshold and has no interior envelope`);
    if (!Array.isArray(venue.attachments)) fail(`venue ${venue.id} attachments`);
    for (const item of venue.attachments) {
      onlyKeys(item, KEYS.attachment, `attachment ${item.id}`);
      unique('attachment', item.id, 'attach:');
      if (!rules.attachmentRoles.includes(item.role)) fail(`attachment ${item.id} role must be one of ${rules.attachmentRoles.join(', ')}`);
      if (!point3Ok(item.position) || !Number.isFinite(item.yaw)) fail(`attachment ${item.id} needs [x, y, z] and yaw`);
      if (item.frame !== undefined && item.frame !== 'campus') fail(`attachment ${item.id} frame`);
    }
    if (!Array.isArray(venue.cameraCorridors)) fail(`venue ${venue.id} cameraCorridors`);
    for (const corridor of venue.cameraCorridors) {
      onlyKeys(corridor, KEYS.corridor, `camera corridor ${corridor.id}`);
      unique('camera corridor', corridor.id, 'camera:');
      if (!point3Ok(corridor.from) || !point3Ok(corridor.to) || !(Number.isFinite(corridor.halfWidth) && corridor.halfWidth > 0 && corridor.halfWidth <= 3)) fail(`camera corridor ${corridor.id} needs from, to and a halfWidth up to 3 m`);
      if (corridor.blockedBy !== undefined && !(Array.isArray(corridor.blockedBy) && corridor.blockedBy.every(id => typeof id === 'string'))) fail(`camera corridor ${corridor.id} blockedBy`);
    }
    if (venue.takesOver !== undefined && !(Array.isArray(venue.takesOver) && venue.takesOver.every(id => typeof id === 'string'))) fail(`venue ${venue.id} takesOver`);
  });
  if (!contract.ribbon || !Array.isArray(contract.ribbon.segments) || !contract.ribbon.segments.length) fail('ribbon needs segments');
  for (const segment of contract.ribbon.segments) {
    if (!segment || typeof segment !== 'object') fail('segment');
    onlyKeys(segment, KEYS.segment, `segment ${segment.id}`);
    unique('segment', segment.id);
    if (!rules.segmentStatuses.includes(segment.status)) fail(`segment ${segment.id} status must be ${rules.segmentStatuses.join(' or ')}`);
    if (segment.status === 'blocked') {
      if (!segment.blocked || typeof segment.blocked !== 'object') fail(`segment ${segment.id} is blocked without a blocked record`);
      onlyKeys(segment.blocked, KEYS.blocked, `segment ${segment.id} blocked`);
      if (typeof segment.blocked.reason !== 'string' || !Array.isArray(segment.blocked.blockers) || !segment.blocked.blockers.length || !Array.isArray(segment.blocked.moves) || !segment.blocked.moves.length) fail(`segment ${segment.id} blocked needs reason, blockers and moves`);
    } else if (segment.blocked !== undefined) fail(`segment ${segment.id} is clear and carries a blocked record`);
  }
  for (const join of contract.ribbon.joins ?? []) {
    if (!join || !['end', 'tee'].includes(join.kind) || !contract.ribbon.segments.some(s => s.id === join.from) || !contract.ribbon.segments.some(s => s.id === join.to)) fail(`join ${join?.from}->${join?.to}`);
  }
  if (!Array.isArray(contract.links)) fail('links');
  for (const link of contract.links) {
    onlyKeys(link, KEYS.link, `link ${link.id}`);
    unique('link', link.id, 'link:');
    if (!VENUE_IDS.includes(link.venue)) fail(`link ${link.id} venue`);
    if (entranceIds.get(link.entrance) !== link.venue) fail(`link ${link.id} entrance ${link.entrance} is not an entrance of ${link.venue}`);
    if (!contract.ribbon.segments.some(s => s.id === link.segment)) fail(`link ${link.id} segment ${link.segment}`);
    if (link.end !== undefined && link.end !== true) fail(`link ${link.id} end`);
    if (!link.end && !rules.linkSides.includes(link.side)) fail(`link ${link.id} side must be ${rules.linkSides.join(' or ')}`);
  }
  for (const venue of contract.venues) for (const entrance of venue.entrances) {
    const link = contract.links.find(item => item.id === entrance.link);
    if (!link || link.entrance !== entrance.id) fail(`entrance ${entrance.id} of ${venue.id} has no Ribbon link`);
  }
  for (const item of contract.exclusions ?? []) {
    if (!item || !idOk(item.id) || !RIBBON_RULES.exclusionKinds.includes(item.kind) || !Array.isArray(item.rect) || item.rect.length !== 4 || !item.rect.every(Number.isFinite)) fail(`exclusion ${item?.id}`);
  }
  return contract;
}

// ---- Expansion ---------------------------------------------------------------------------
const stripSegment = ({ status, blocked, source, notes, ...segment }) => segment;
const segmentRuns = segment => segment.points.slice(1).map((to, i) => { const from = segment.points[i], dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy); return { from, to, length, dir: [dx / length, dy / length] }; });
// The nearest station on a segment's centreline to a point, with the offset to the right.
function stationOf(segment, point) {
  let best = null, start = 0;
  for (const run of segmentRuns(segment)) {
    const t = Math.max(0, Math.min(run.length, (point[0] - run.from[0]) * run.dir[0] + (point[1] - run.from[1]) * run.dir[1]));
    const at = [run.from[0] + run.dir[0] * t, run.from[1] + run.dir[1] * t], gap = Math.hypot(point[0] - at[0], point[1] - at[1]);
    if (!best || gap < best.gap) best = { gap, station: start + t, at, dir: run.dir, right: ((point[0] - at[0]) * run.dir[1] - (point[1] - at[1]) * run.dir[0]) };
    start += run.length;
  }
  return best;
}

function expandSegment(contract, segment, zones) {
  const base = { id: contract.id, kit: contract.kit, seed: contract.seed };
  const geometry = expandRibbon({ ...base, segments: [stripSegment(segment)], exclusions: [] });
  // What the site says about this geometry, post by post and module by module.
  const findings = [];
  for (const post of geometry.posts) for (const zone of zones) if (overlaps(postShape(post), corners(zone.rect))) findings.push({ element: post.id, zone: zone.id, kind: zone.kind, what: 'post' });
  for (const module of geometry.modules) for (const zone of zones) if (zone.kind === 'no-go' && overlaps(moduleShape(module), corners(zone.rect))) findings.push({ element: module.id, zone: zone.id, kind: zone.kind, what: 'walk' });
  let plan = null, refusal = null;
  try { plan = expandRibbon({ ...base, segments: [stripSegment(segment)], exclusions: zones }); } catch (error) { refusal = error.message; }
  const walkBlocked = findings.filter(item => item.what === 'walk');
  const clear = plan && !walkBlocked.length;
  return { geometry, plan: clear ? plan : geometry, findings, refusal: refusal ?? (walkBlocked.length ? `the walk of ${segment.id} runs over ${[...new Set(walkBlocked.map(item => item.zone))].join(', ')}` : null), clear };
}

// Tree crowns against the canopy: a crown whose underside is below the slab top and whose
// disc overlaps a module's plan passes through the canopy.
function crownFindings(site, modules) {
  const out = [], rules = FIVE_ROOMS_RULES;
  for (const module of modules) {
    const shape = moduleShape(module), c = [(module.from[0] + module.to[0]) / 2, (module.from[1] + module.to[1]) / 2], reach = module.length / 2 + module.width / 2;
    for (const tree of site.trees) {
      if (Math.hypot(tree.x - c[0], tree.y - c[1]) > reach + tree.radius) continue;
      const gap = Math.min(...shape.map((p, i) => distanceToSegment([tree.x, tree.y], p, shape[(i + 1) % shape.length])));
      const planGap = inside([tree.x, tree.y], shape) ? -gap : gap;
      if (planGap >= tree.radius) continue;
      const verticalGap = mm(tree.crownBase - (module.clearHeight + rules.slab));
      out.push({ module: module.id, segment: module.segment, tree: tree.id, at: [mm(tree.x), mm(tree.y)], planGap: mm(planGap), crownBase: mm(tree.crownBase), verticalGap, through: verticalGap < 0 });
    }
  }
  return out;
}

// A camera corridor is a sight line with a half width. Posts (to their height), canopy slabs
// and tree crowns on the line block it; the Ribbon's blocks are errors, trees must be declared.
function cameraFindings(corridor, plan, site, groundAt) {
  const rules = FIVE_ROOMS_RULES, out = [], [fx, fy, fz] = corridor.from, [tx, ty, tz] = corridor.to;
  const length = Math.hypot(tx - fx, ty - fy), dir = [(tx - fx) / length, (ty - fy) / length], n = [-dir[1], dir[0]];
  const steps = Math.max(1, Math.ceil(length / rules.cameraStep));
  const hit = new Map();
  for (let k = 0; k <= steps; k++) for (const lateral of [-corridor.halfWidth, 0, corridor.halfWidth]) {
    const t = k / steps, p = [fx + dir[0] * length * t + n[0] * lateral, fy + dir[1] * length * t + n[1] * lateral], z = fz + (tz - fz) * t;
    for (const post of plan.posts) {
      const ground = groundAt ? groundAt(post.position[0], post.position[1]) : 0;
      if (Math.hypot(post.position[0] - p[0], post.position[1] - p[1]) <= RIBBON_RULES.post / 2 + 1e-9 && z <= ground + post.height) hit.set(post.id, 'post');
    }
    for (const module of plan.modules) {
      if (!inside(p, moduleShape(module))) continue;
      const ground = groundAt ? groundAt(p[0], p[1]) : 0, bottom = ground + module.clearHeight, top = bottom + rules.slab;
      if (z >= bottom - 1e-9 && z <= top + 1e-9) hit.set(module.id, 'canopy');
    }
    for (const tree of site.trees) {
      if (Math.hypot(tree.x - p[0], tree.y - p[1]) > tree.radius) continue;
      const ground = groundAt ? groundAt(tree.x, tree.y) : 0;
      if (z >= ground + tree.crownBase && z <= ground + tree.height) hit.set(tree.id, 'tree');
    }
  }
  for (const [id, what] of hit) out.push({ corridor: corridor.id, element: id, what });
  return out;
}

export function expandFiveRooms(source, site) {
  const contract = validateFiveRooms(source), rules = FIVE_ROOMS_RULES;
  if (!site || !Array.isArray(site.buildings) || !Array.isArray(site.stores) || !Array.isArray(site.roads)) fail('site needs buildings, stores and roads');
  const building = id => site.buildings.find(item => item.id === id);
  const store = id => site.stores.find(item => item.id === id);
  // The Gardens contract is untouched: the live district must still validate it, and the
  // contract must pin the entry it uses.
  if (site.district) {
    const { ok, findings } = validateGardenCampus(GARDEN_CAMPUS_LAYOUT, { district: site.district });
    if (!ok) fail(`the Gardens contract no longer matches the district: ${findings.map(f => `${f.rule} ${f.id}: ${f.message}`).join('; ')}`);
  }
  const campusEntry = GARDEN_CAMPUS_LAYOUT.entries.find(entry => entry.id === contract.gardens.entry);
  const campusBuilding = building(GARDEN_CAMPUS_LAYOUT.source.buildingId);
  if (!campusBuilding) fail(`Gardens building ${GARDEN_CAMPUS_LAYOUT.source.buildingId} is not in the site`);
  const parcel = campusBuilding.ring;
  // Retired tenants leave the door list; their bays become venue envelopes.
  const retired = new Map();
  for (const venue of contract.venues) for (const id of venue.retire.tenants) {
    const tenant = store(id);
    if (!tenant) fail(`${venue.id} retires ${id}, which is not a District tenant`);
    if (tenant.buildingId !== venue.host.buildingId) fail(`${venue.id} retires ${tenant.name}, a tenant of ${tenant.buildingId}, not of its host ${venue.host.buildingId}`);
    if (retired.has(id)) fail(`${id} is retired twice`);
    retired.set(id, venue.id);
  }
  const zones = [...siteExclusions(site, { retired: new Set(retired.keys()) }), ...(contract.exclusions ?? []).map(item => ({ ...item, source: 'authored' }))];
  // Venues: inside their host, clear of every kept tenant, with their entrances on the Ribbon.
  const venues = [], entranceZones = [];
  for (const venue of contract.venues) {
    const host = building(venue.host.buildingId);
    if (!host) fail(`${venue.id} host ${venue.host.buildingId} is not a District building`);
    if (venue.kind === 'bay') {
      if (!withinRing(venue.footprint, host.ring, 0.05)) fail(`${venue.id} footprint leaves its host building ${host.id}`);
      if (host.id === campusBuilding.id) fail(`${venue.id} is a bay inside the Gardens parcel; only a threshold may touch the campus`);
    } else {
      // A threshold stands in a public campus path at the pinned entry; it builds no massing.
      const path = GARDEN_CAMPUS_LAYOUT.paths.find(item => item.id === campusEntry.path);
      for (const p of venue.footprint) if (!rectContains(path.rect, sourceToCampus(p))) fail(`${venue.id} threshold corner ${p.map(mm).join(', ')} is outside campus path ${path.id}`);
    }
    for (const tenant of site.tenants) {
      if (retired.has(tenant.id)) continue;
      if (overlaps(venue.footprint, tenant.footprint, FIVE_ROOMS_RULES.partyWall)) fail(`${venue.id} overlaps kept tenant ${tenant.id} (${tenant.name})`);
      const door = doorwayRect(tenant.facade, tenant.outward, rules.doorway.width, rules.doorway.depth);
      if (overlaps(venue.footprint, corners(door))) fail(`${venue.id} overlaps the door zone of kept tenant ${tenant.id} (${tenant.name})`);
    }
    if (venue.kind === 'bay' && !withinRing(venue.interior.floor, venue.footprint, 0.05)) fail(`${venue.id} interior floor leaves its footprint`);
    if (site.groundAt) {
      const ground = site.groundAt(venue.floor.at[0], venue.floor.at[1]);
      if (Math.abs(ground - venue.floor.height) > 0.011) fail(`${venue.id} floor ${venue.floor.height} is not the ground ${mm(ground)} at ${venue.floor.at.join(', ')}`);
    }
    const entrances = venue.entrances.map(entrance => {
      if (!onRing(entrance.centre, venue.footprint, 0.3)) fail(`entrance ${entrance.id} is not on the ${venue.id} boundary`);
      if (entrance.campusEntry) {
        if (entrance.campusEntry !== campusEntry.id) fail(`entrance ${entrance.id} names campus entry ${entrance.campusEntry}, the contract pins ${campusEntry.id}`);
        const [u, v] = sourceToCampus(entrance.centre), path = GARDEN_CAMPUS_LAYOUT.paths.find(item => item.id === campusEntry.path);
        if (Math.abs(u - campusEntry.position[0]) > 0.3 || Math.abs(v - campusEntry.position[1]) > 0.3) fail(`entrance ${entrance.id} is not at campus entry ${campusEntry.id}`);
        if (Math.abs(entrance.width - (path.rect[3] - path.rect[1])) > 1e-6) fail(`entrance ${entrance.id} width ${entrance.width} is not the ${path.id} opening ${path.rect[3] - path.rect[1]}`);
        if (entrance.approach && entrance.approach.road !== campusEntry.lane) fail(`entrance ${entrance.id} approaches along ${entrance.approach.road}, not the campus entry lane ${campusEntry.lane}`);
      }
      const zone = { id: `door-${slug(entrance.id)}`.slice(0, 40), kind: 'doorway', rect: doorwayRect(entrance.centre, entrance.outward, entrance.width, rules.doorway.depth), source: venue.id };
      entranceZones.push(zone);
      return { ...entrance, venue: venue.id, doorway: zone.rect };
    });
    for (const item of venue.attachments) {
      if (item.frame === 'campus') {
        const [u, v, z] = item.position, tower = GARDEN_CAMPUS_LAYOUT.towers.find(t => rectContains(t.roof.rect, [u, v]));
        if (!tower) fail(`attachment ${item.id} is not on a Gardens roof deck`);
        if (z > tower.silhouette.capZ + 1e-9 || z < tower.roof.z) fail(`attachment ${item.id} z ${z} is outside the ${tower.id} roof silhouette (${tower.roof.z} to ${tower.silhouette.capZ})`);
      } else {
        if (!inside([item.position[0], item.position[1]], venue.footprint) && !onRing([item.position[0], item.position[1]], venue.footprint, 0.3)) fail(`attachment ${item.id} is outside ${venue.id}`);
        const top = venue.floor.height + (venue.interior?.clearHeight ?? 6);
        if (item.position[2] < venue.floor.height - 0.01 || item.position[2] > top + 0.01) fail(`attachment ${item.id} z ${item.position[2]} is outside the ${venue.id} envelope (${mm(venue.floor.height)} to ${mm(top)})`);
      }
    }
    venues.push({ ...venue, host: { ...venue.host, kind: host.kind }, retire: { ...venue.retire, names: venue.retire.tenants.map(id => store(id).name) }, entrances });
  }
  for (let i = 0; i < venues.length; i++) for (let j = i + 1; j < venues.length; j++) {
    if (overlaps(venues[i].footprint, venues[j].footprint, FIVE_ROOMS_RULES.partyWall)) fail(`${venues[i].id} overlaps ${venues[j].id}`);
  }
  // Reaches: the ground between a walk edge and each linked entrance. Each becomes a doorway
  // zone before any segment expands, so a post that would stand in it is left out under the
  // segment's maxSpan (or the segment is refused), exactly as for a shop door.
  const reaches = contract.links.map(link => {
    const venue = venues.find(item => item.id === link.venue), entrance = venue.entrances.find(item => item.id === link.entrance), segment = contract.ribbon.segments.find(s => s.id === link.segment);
    return { link, venue, entrance, segment, ...reachOf(link, entrance, segment) };
  });
  const reachZones = reaches.map(item => ({ id: `reach-${slug(item.link.id.replace(/^link:/, ''))}`.slice(0, 40), kind: 'doorway', rect: rect(...bbox(item.reach)), source: item.link.id }));
  const allZones = [...zones, ...entranceZones, ...reachZones];
  // Segments, one expansion each, so a changed point changes only its own placements.
  const segments = [], merged = { modules: [], posts: [], lamps: [], fans: [], seats: [], skipped: [] };
  for (const segment of contract.ribbon.segments) {
    const result = expandSegment(contract, segment, allZones);
    const crowns = crownFindings(site, result.geometry.modules), through = crowns.filter(item => item.through);
    const clear = result.clear && !through.length;
    // Blockers are what must move for the segment to pass: every no-go zone its posts or walk
    // touch and every crown through its canopy; if spans still fail once those are gone, the
    // doorway and seat zones that remain are named too.
    let blockers = [];
    if (!clear) {
      const hard = new Set(result.findings.filter(item => item.kind === 'no-go').map(item => item.zone));
      try { expandRibbon({ id: contract.id, kit: contract.kit, seed: contract.seed, segments: [stripSegment(segment)], exclusions: allZones.filter(zone => !hard.has(zone.id)) }); }
      catch { for (const item of result.findings) hard.add(item.zone); }
      blockers = [...new Set([...hard, ...through.map(item => item.tree)])].sort();
    }
    if (segment.status === 'clear' && !clear) fail(`segment ${segment.id} is documented as clear but the site refuses it: ${result.refusal ?? `crowns through the canopy (${through.map(item => `${item.tree} at ${item.at.join(', ')}`).join('; ')})`}; blockers ${blockers.join(', ')}`);
    if (segment.status === 'blocked') {
      if (clear) fail(`segment ${segment.id} is documented as blocked but passes; set status clear`);
      const documented = new Set(segment.blocked.blockers);
      const undocumented = blockers.filter(id => !documented.has(id));
      if (undocumented.length) fail(`segment ${segment.id} is blocked by undocumented ${undocumented.join(', ')}`);
      const stale = segment.blocked.blockers.filter(id => !blockers.includes(id));
      if (stale.length) fail(`segment ${segment.id} names blockers the site does not confirm: ${stale.join(', ')}`);
    }
    const plan = result.plan;
    for (const key of Object.keys(merged)) merged[key].push(...plan[key]);
    segments.push({ id: segment.id, status: segment.status, width: segment.width, clearHeight: segment.clearHeight, style: segment.style, maxSpan: segment.maxSpan ?? null, length: mm(segmentRuns(segment).reduce((sum, run) => sum + run.length, 0)), stats: plan.stats, findings: result.findings, refusal: result.refusal, crowns, blocked: segment.blocked ?? null, source: segment.source ?? null });
  }
  // Posts never stand in another segment's walk, except the end posts an end join shares: the
  // first boundary of the `to` segment and the last boundary of the `from` segment.
  const shared = new Set();
  for (const join of contract.ribbon.joins ?? []) {
    if (join.kind !== 'end') continue;
    const lastBoundary = Math.max(...merged.posts.filter(post => post.segment === join.from).map(post => post.boundary));
    for (const post of merged.posts) if ((post.segment === join.to && post.boundary === 0) || (post.segment === join.from && post.boundary === lastBoundary)) shared.add(post.id);
  }
  for (const post of merged.posts) for (const module of merged.modules) {
    if (module.segment === post.segment) continue;
    if (shared.has(post.id) && ((contract.ribbon.joins ?? []).some(join => join.kind === 'end' && [join.from, join.to].includes(module.segment) && [join.from, join.to].includes(post.segment)))) continue;
    if (overlaps(postShape(post), moduleShape(module))) fail(`${post.id} stands in the walk of ${module.id}`);
  }
  // Joins: an end join shares its end posts; a tee starts beside the other walk's edge.
  const joins = (contract.ribbon.joins ?? []).map(join => {
    const from = contract.ribbon.segments.find(s => s.id === join.from), to = contract.ribbon.segments.find(s => s.id === join.to);
    if (join.kind === 'end') {
      const a = from.points.at(-1), b = to.points[0];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.001 || Math.abs(from.width - to.width) > 1e-9) fail(`join ${join.from}->${join.to}: ${join.from} must end where ${join.to} starts, at the same width`);
      const shared = merged.posts.filter(post => post.segment === join.to && post.boundary === 0).map(post => [post.id, merged.posts.find(other => other.segment === join.from && other.boundary !== 0 && Math.hypot(other.position[0] - post.position[0], other.position[1] - post.position[1]) < 0.005)?.id ?? null]);
      return { ...join, at: a.map(mm), sharedPosts: shared };
    }
    const start = from.points[0], at = stationOf(to, start);
    if (!at || Math.abs(Math.abs(at.right) - to.width / 2) > 0.5) fail(`join ${join.from}->${join.to}: ${join.from} must start beside the walk edge of ${join.to}`);
    return { ...join, at: start.map(mm), station: mm(at.station), gap: mm(Math.abs(at.right) - to.width / 2) };
  });
  // Links: the reach from a walk edge to its entrance, clear ground all the way. A post of a
  // blocked segment that its own record already names in this reach is a documented blocker.
  const links = reaches.map(({ link, venue, entrance, segment, reach, station }, i) => {
    const door = corners(entrance.doorway), own = reachZones[i];
    const span = Math.max(...reach.map(p => distanceToSegment(p, door[0], door[2])));
    if (span > rules.maxReach + entrance.width) fail(`link ${link.id}: the reach from ${segment.id} to ${entrance.id} is over ${rules.maxReach} m`);
    const laneEnd = entrance.approach ? laneEndZones(site, entrance.approach, entrance.centre) : new Set();
    // A threshold opens into its host: the host's own footprint box is not in its way.
    const hostZone = venue.kind === 'threshold' ? venue.host.buildingId : null;
    const blocked = [];
    for (const zone of allZones) {
      if (zone.kind === 'seat-access' || zone.kind === 'step-free' || zone === own) continue;
      if (hostZone && zone.source === hostZone && zone.id.startsWith('building-')) continue;
      if (zone.kind === 'doorway' && zone.rect === entrance.doorway) continue;
      if (laneEnd.has(zone.id)) continue;
      if (overlaps(reach, corners(zone.rect))) blocked.push(zone.id);
    }
    for (const post of merged.posts) {
      if (!overlaps(reach, postShape(post))) continue;
      const record = segments.find(item => item.id === post.segment);
      if (record.status === 'blocked' && record.findings.some(item => item.element === post.id && item.zone === own.id)) continue;
      blocked.push(post.id);
    }
    if (!overlaps(reach, door) && !door.some(p => onRing(p, reach, 0.001))) fail(`link ${link.id}: the reach does not touch ${entrance.id}`);
    if (blocked.length) fail(`link ${link.id}: the reach from ${segment.id} to ${entrance.id} is blocked by ${blocked.join(', ')}`);
    return { ...link, station, reach: reach.map(p => p.map(mm)), zone: own.id, crossesLaneEnd: laneEnd.size ? [...laneEnd].filter(id => overlaps(reach, corners(allZones.find(z => z.id === id).rect))) : [] };
  });
  // Camera corridors: the Ribbon never crosses one; a tree that does must be declared.
  const cameras = [];
  for (const venue of venues) for (const corridor of venue.cameraCorridors) {
    const findings = cameraFindings(corridor, merged, site, site.groundAt);
    const ribbon = findings.filter(item => item.what !== 'tree');
    if (ribbon.length) fail(`camera corridor ${corridor.id} of ${venue.id} is crossed by ${ribbon.map(item => `${item.what} ${item.element}`).join(', ')}`);
    const trees = findings.filter(item => item.what === 'tree').map(item => item.element), declared = corridor.blockedBy ?? [];
    const undeclared = trees.filter(id => !declared.includes(id)), stale = declared.filter(id => !trees.includes(id));
    if (undeclared.length) fail(`camera corridor ${corridor.id} of ${venue.id} is crossed by undeclared tree ${undeclared.join(', ')}`);
    if (stale.length) fail(`camera corridor ${corridor.id} declares ${stale.join(', ')}, which does not cross it`);
    cameras.push({ ...corridor, venue: venue.id, trees });
  }
  // Nothing of the Ribbon enters the Gardens parcel.
  for (const post of merged.posts) if (inside(post.position, parcel)) fail(`${post.id} stands inside the Gardens parcel`);
  for (const module of merged.modules) if (overlaps(moduleShape(module), parcel)) fail(`${module.id} enters the Gardens parcel`);
  const round = value => Array.isArray(value) ? value.map(round) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round(v)])) : typeof value === 'number' ? mm(value) + 0 : value;
  const placements = round({ modules: merged.modules, posts: merged.posts, lamps: merged.lamps, fans: merged.fans, seats: merged.seats, skipped: merged.skipped });
  const output = round({ venues, segments, joins, links, cameras, exclusions: allZones.map(({ source, ...zone }) => zone) });
  const stats = {
    venues: venues.length, segments: segments.length, clear: segments.filter(s => s.status === 'clear').length, blocked: segments.filter(s => s.status === 'blocked').length,
    modules: merged.modules.length, posts: merged.posts.length, lamps: merged.lamps.length, fans: merged.fans.length, seats: merged.seats.length, skipped: merged.skipped.length,
    links: links.length, cameras: cameras.length, exclusions: allZones.length, retired: retired.size,
  };
  return { id: contract.id, version: contract.version, kit: contract.kit, seed: contract.seed, ...output, ...placements, stats, hash: stableHash({ ...output, ...placements }) };
}

// The quad from a walk edge to the two nearest corners of an entrance's doorway zone: at the end
// of the segment for an end link, or across from the entrance's station for a side link.
function reachOf(link, entrance, segment) {
  const door = corners(entrance.doorway), half = segment.width / 2;
  if (link.end) {
    // The reach starts just beyond the end posts, which a span can never leave out.
    const run = segmentRuns(segment).at(-1), n = [-run.dir[1], run.dir[0]], clear = RIBBON_RULES.post / 2 + 0.01;
    const end = [run.to[0] + run.dir[0] * clear, run.to[1] + run.dir[1] * clear];
    const edge = [[end[0] + n[0] * half, end[1] + n[1] * half], [end[0] - n[0] * half, end[1] - n[1] * half]];
    const near = door.map(p => ({ p, d: Math.hypot(p[0] - end[0], p[1] - end[1]) })).sort((a, b) => a.d - b.d).slice(0, 2).map(item => item.p);
    return { reach: hull([...edge, ...near]), station: mm(segmentRuns(segment).reduce((sum, r) => sum + r.length, 0)) };
  }
  const at = stationOf(segment, entrance.centre);
  if (!at) fail(`link ${link.id}: no station`);
  const sign = link.side === 'left' ? 1 : -1, n = [-at.dir[1] * sign, at.dir[0] * sign];
  if (at.right * sign > 0) fail(`link ${link.id}: ${entrance.id} is on the other side of ${segment.id}`);
  const w = entrance.width / 2, edge = [[at.at[0] + n[0] * half + at.dir[0] * w, at.at[1] + n[1] * half + at.dir[1] * w], [at.at[0] + n[0] * half - at.dir[0] * w, at.at[1] + n[1] * half - at.dir[1] * w]];
  const near = door.map(p => ({ p, d: distanceToSegment(p, edge[0], edge[1]) })).sort((a, b) => a.d - b.d).slice(0, 2).map(item => item.p);
  return { reach: hull([...edge, ...near]), station: mm(at.station) };
}

// The pieces of a road within `within` metres of the end nearest the entrance: a campus entry's
// lane end. (A lane's point order is the source's; either end may meet the entry.)
function laneEndZones(site, approach, near) {
  const road = site.roads.find(item => item.id === approach.road);
  if (!road) fail(`approach road ${approach.road} is not in the site`);
  const ends = [road.points[0], road.points.at(-1)], gap = p => Math.hypot(p[0] - near[0], p[1] - near[1]);
  const end = gap(ends[0]) <= gap(ends[1]) ? ends[0] : ends[1], out = new Set(), prefix = `road-${road.id.replace(/^osm-way-/, '').replace(/-0$/, '')}-`;
  for (const zone of siteExclusions({ ...site, stores: [], benches: [], fixtures: [], buildings: [], treePits: [], beds: [], roads: [road] })) {
    if (!zone.id.startsWith(prefix)) continue;
    if (corners(zone.rect).some(p => Math.hypot(p[0] - end[0], p[1] - end[1]) <= approach.within + road.width / 2)) out.add(zone.id);
  }
  return out;
}

function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of sorted) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of sorted.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
