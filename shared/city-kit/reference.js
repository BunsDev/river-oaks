// Kit streets from a geographic reference (#585 follow-through, increment 2).
// A world export (the District's `district.json`, a world-v1 export or a Studio
// region) carries mapped road centrelines in local metres. This adapter turns
// the roads inside a chosen site into a recipe skeleton: the roads are turned
// about the site's centre so the dominant grid runs east and north, cropped to
// the site, snapped to the kit's axis-aligned streets on its half-metre module,
// and merged where one mapped way arrives in pieces. Everything it could not
// express (bends, diagonals, short stubs, corridors that would overlap) is
// reported, never silently dropped. Buildings are counted, not reproduced: the
// kit builds original architecture; the reference supplies the street pattern.
import { KIT_CONVENTIONS, KIT_STYLES, KIT_VERSION } from './catalog.js';
import { expandLayout } from './layout.js';

const MODULE = KIT_CONVENTIONS.module, EPS = 1e-6;
const mm = value => Math.round(value * 1000) / 1000;
const snap = value => Math.round(value / MODULE) * MODULE;
const finite = Number.isFinite;
const fail = message => { throw new Error(`Invalid reference: ${message}`); };
const idOk = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(id);
const slug = text => String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export const REFERENCE_LIMITS = Object.freeze({ site: [40, 512], roads: 4096, points: 65536, rotation: 90 });

// Mapped roads with finite 2-D or 3-D points, sorted by ID so output never depends on source order.
function sourceRoads(world) {
  if (!world || typeof world !== 'object' || !Array.isArray(world.roads)) fail('the source has no roads array');
  if (world.roads.length > REFERENCE_LIMITS.roads) fail(`more than ${REFERENCE_LIMITS.roads} roads`);
  const ids = new Set(); let points = 0;
  const roads = world.roads.map(road => {
    if (!road || typeof road.id !== 'string' || !road.id || ids.has(road.id)) fail(`road ids must be unique strings (${road?.id})`);
    ids.add(road.id);
    if (!Array.isArray(road.points) || road.points.length < 2 || !road.points.every(point => Array.isArray(point) && point.length >= 2 && finite(point[0]) && finite(point[1]))) fail(`road ${road.id} points`);
    points += road.points.length;
    if (road.width_m !== undefined && !(finite(road.width_m) && road.width_m > 0)) fail(`road ${road.id} width`);
    return { id: road.id, name: typeof road.name === 'string' ? road.name : null, kind: typeof road.kind === 'string' ? road.kind : null, width: finite(road.width_m) ? road.width_m : null, points: road.points.map(point => [point[0], point[1]]) };
  }).sort((a, b) => a.id < b.id ? -1 : 1);
  if (points > REFERENCE_LIMITS.points) fail(`more than ${REFERENCE_LIMITS.points} road points`);
  return roads;
}

function validateOptions(options) {
  const site = options?.site;
  if (!Array.isArray(site) || site.length !== 4 || !site.every(finite) || site[0] >= site[2] || site[1] >= site[3]) fail('site must be [west, south, east, north] in source metres');
  for (const span of [site[2] - site[0], site[3] - site[1]]) if (span < REFERENCE_LIMITS.site[0] || span > REFERENCE_LIMITS.site[1]) fail(`site sides must span ${REFERENCE_LIMITS.site[0]}–${REFERENCE_LIMITS.site[1]} m`);
  const rotation = options.rotation ?? 'auto';
  if (rotation !== 'auto' && !(finite(rotation) && Math.abs(rotation) <= REFERENCE_LIMITS.rotation)) fail('rotation must be auto or degrees within ±90');
  const sidewalk = options.sidewalk ?? 3.5, lane = options.lane ?? 6, tolerance = options.tolerance ?? 5, minimumLength = options.minimumLength ?? 20;
  for (const [name, value, low, high] of [['sidewalk', sidewalk, 1, 10], ['lane', lane, 3, 20], ['tolerance', tolerance, 0.5, 15], ['minimumLength', minimumLength, 5, 200]]) if (!(finite(value) && value >= low && value <= high)) fail(`${name} must be ${low}–${high}`);
  const kinds = options.kinds ?? null;
  if (kinds !== null && !(Array.isArray(kinds) && kinds.every(kind => typeof kind === 'string'))) fail('kinds must be a list of road kinds');
  const parcels = options.parcels ?? 'quarters';
  if (!['quarters', 'ignore'].includes(parcels)) fail('parcels must be quarters or ignore');
  const id = options.id ?? 'reference';
  if (!idOk(id)) fail(`id ${id}`);
  const style = options.style ?? 'market-row';
  if (!KIT_STYLES[style]) fail(`style ${style}`);
  return { site, rotation, sidewalk, lane, tolerance, minimumLength, kinds, parcels, id, title: options.title ?? `Reference streets: ${id}`, style, source: options.source ?? {} };
}

const heading = ([ax, ay], [bx, by]) => (Math.atan2(by - ay, bx - ax) * 180 / Math.PI + 360) % 180;
// Angle of a heading from the nearest grid axis, signed, in (-45, 45].
const offAxis = (degrees, grid) => { let d = (degrees - grid) % 90; if (d > 45) d -= 90; if (d <= -45) d += 90; return d; };

// The grid the mapped streets follow: the length-weighted dominant heading modulo
// 90 of the segments inside the site, refined to a tenth of a degree.
export function dominantRotation(world, site) {
  const roads = sourceRoads(world), inside = point => point[0] >= site[0] && point[0] <= site[2] && point[1] >= site[1] && point[1] <= site[3];
  const segments = [];
  for (const road of roads) for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > 0.5 && (inside(a) || inside(b))) segments.push({ heading: heading(a, b) % 90, length });
  }
  if (!segments.length) return { rotation: 0, aligned: 0, length: 0 };
  const bins = new Array(180).fill(0);
  for (const segment of segments) bins[Math.round(segment.heading * 2) % 180] += segment.length;
  let best = 0; for (let i = 1; i < bins.length; i++) if (bins[i] > bins[best]) best = i;
  const coarse = best / 2, near = segments.filter(segment => Math.abs(offAxis(segment.heading, coarse)) <= 3);
  const refined = coarse + near.reduce((sum, segment) => sum + offAxis(segment.heading, coarse) * segment.length, 0) / near.reduce((sum, segment) => sum + segment.length, 0);
  const rotation = Math.round(((refined + 45) % 90 - 45) * 10) / 10, total = segments.reduce((sum, segment) => sum + segment.length, 0);
  return { rotation, aligned: Math.round(near.reduce((sum, segment) => sum + segment.length, 0) / total * 1000) / 1000, length: Math.round(total) };
}

// Build the recipe skeleton. `options.source` carries the file's name and hash for provenance.
export function referenceRecipe(world, options) {
  const settings = validateOptions(options), roads = sourceRoads(world), { site, sidewalk, tolerance, minimumLength } = settings;
  const rotation = settings.rotation === 'auto' ? dominantRotation(world, site).rotation : settings.rotation;
  const width = mm(site[2] - site[0]), height = mm(site[3] - site[1]);
  const cx = (site[0] + site[2]) / 2, cy = (site[1] + site[3]) / 2, cos = Math.cos(-rotation * Math.PI / 180), sin = Math.sin(-rotation * Math.PI / 180);
  // Turn about the site's centre so the grid runs east and north, then measure from the site's south-west corner.
  const local = ([x, y]) => [mm(cx + (x - cx) * cos - (y - cy) * sin - site[0]), mm(cy + (x - cx) * sin + (y - cy) * cos - site[1])];
  const insideSite = ([x, y]) => x >= -EPS && x <= width + EPS && y >= -EPS && y <= height + EPS;
  const dropped = new Map(), runs = [];
  // One entry per road and reason; bends accumulate their length and worst angle.
  const drop = (road, kind, length, detail = null) => {
    const key = `${road.id}\n${kind}`, entry = dropped.get(key) ?? { road: road.id, name: road.name, kind: road.kind, reason: kind, length: 0, segments: 0, worst: 0 };
    entry.length = mm(entry.length + length); entry.segments += 1; entry.worst = Math.max(entry.worst, detail ?? 0);
    dropped.set(key, entry);
  };
  for (const road of roads) {
    if (settings.kinds && !settings.kinds.includes(road.kind)) { drop(road, `kind ${road.kind} not requested`, 0); continue; }
    const points = road.points.map(local);
    // Split the polyline into runs of segments that follow one axis within the tolerance.
    let run = null;
    const flush = () => { if (run) runs.push(run); run = null; };
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < EPS) continue;
      if (!insideSite(a) && !insideSite(b) && !crossesSite(a, b, width, height)) { flush(); continue; }
      const degrees = heading(a, b), off = offAxis(degrees, 0), axis = Math.abs(offAxis(degrees, 0)) <= tolerance ? (Math.abs(degrees) < 45 || degrees > 135 ? 'east' : 'north') : null;
      if (!axis) { flush(); drop(road, 'bends off the grid', length, Math.round(Math.abs(off) * 10) / 10); continue; }
      if (run && run.axis !== axis) flush();
      if (!run) run = { road, axis, points: [a] };
      run.points.push(b);
    }
    flush();
  }
  // Each run becomes a street on the module, clipped to the site.
  const candidates = [];
  for (const run of runs) {
    const along = run.axis === 'east' ? 0 : 1, across = 1 - along;
    const length = run.points.slice(1).reduce((sum, point, i) => sum + Math.abs(point[along] - run.points[i][along]), 0);
    const position = snap(run.points.slice(1).reduce((sum, point, i) => sum + (point[across] + run.points[i][across]) / 2 * Math.abs(point[along] - run.points[i][along]), 0) / Math.max(length, EPS));
    const extent = [snap(Math.max(0, Math.min(...run.points.map(point => point[along])))), snap(Math.min(run.axis === 'east' ? width : height, Math.max(...run.points.map(point => point[along]))))];
    const lane = run.road.width ?? settings.lane, outer = lane / 2 + sidewalk, limit = run.axis === 'east' ? height : width;
    if (extent[1] - extent[0] < minimumLength) { drop(run.road, `shorter than ${minimumLength} m inside the site`, extent[1] - extent[0]); continue; }
    if (position - outer < -EPS || position + outer > limit + EPS) { drop(run.road, 'its corridor would leave the site', extent[1] - extent[0]); continue; }
    candidates.push({ road: run.road, axis: run.axis, position, extent, lane, outer });
  }
  // Merge pieces of one way that line up end to end, then refuse corridors that would overlap.
  candidates.sort((a, b) => a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : a.position - b.position || a.extent[0] - b.extent[0] || (a.road.id < b.road.id ? -1 : 1));
  const streets = [];
  for (const candidate of candidates) {
    const previous = streets[streets.length - 1];
    const sameLine = previous && previous.axis === candidate.axis && Math.abs(previous.position - candidate.position) <= Math.max(previous.lane, candidate.lane) / 2 + EPS && candidate.extent[0] <= previous.extent[1] + 2 + EPS;
    if (sameLine && (previous.roads[0].name === candidate.road.name || previous.roads[0].id.replace(/-\d+$/, '') === candidate.road.id.replace(/-\d+$/, ''))) {
      previous.extent[1] = Math.max(previous.extent[1], candidate.extent[1]); previous.roads.push(candidate.road); continue;
    }
    streets.push({ axis: candidate.axis, position: candidate.position, extent: [...candidate.extent], lane: candidate.lane, outer: candidate.outer, roads: [candidate.road] });
  }
  // Wider, then longer, streets win a corridor clash; the loser is reported with the winner's id.
  const kept = [];
  streets.sort((a, b) => b.lane - a.lane || (b.extent[1] - b.extent[0]) - (a.extent[1] - a.extent[0]) || a.axis.localeCompare(b.axis) || a.position - b.position || a.extent[0] - b.extent[0]);
  for (const street of streets) {
    const clash = kept.find(other => other.axis === street.axis && Math.abs(other.position - street.position) < other.outer + street.outer - EPS && street.extent[0] < other.extent[1] - EPS && other.extent[0] < street.extent[1] - EPS);
    if (clash) { for (const road of street.roads) drop(road, `its corridor overlaps ${clash.id}`, street.extent[1] - street.extent[0]); continue; }
    street.roads.sort((a, b) => a.id < b.id ? -1 : 1);
    const base = slug(street.roads[0].name ?? street.roads[0].id) || 'street';
    let id = base, n = 1; while (kept.some(other => other.id === id)) id = `${base}-${++n}`;
    if (!idOk(id)) fail(`street id ${id}`);
    kept.push({ ...street, id });
  }
  kept.sort((a, b) => a.axis.localeCompare(b.axis) || a.position - b.position || a.extent[0] - b.extent[0]);
  const buildings = Array.isArray(world.buildings) ? world.buildings.filter(building => Array.isArray(building.center) && insideSite(local(building.center))).length : 0;
  const recipe = {
    id: settings.id, title: settings.title, kit: KIT_VERSION, seed: 1,
    inspiration: `Patterns only: the street pattern of ${settings.source.name ?? 'the mapped reference'} inside the chosen site, turned ${rotation}° onto the kit grid. Buildings, names and lettering are to be original; the ${buildings} mapped buildings inside the site are counted, not reproduced.`,
    site: [0, 0, width, height],
    streets: kept.map(street => street.axis === 'east'
      ? { id: street.id, from: [street.extent[0], street.position], to: [street.extent[1], street.position], lane: mm(street.lane), sidewalk: mm(sidewalk) }
      : { id: street.id, from: [street.position, street.extent[0]], to: [street.position, street.extent[1]], lane: mm(street.lane), sidewalk: mm(sidewalk) }),
    plazas: [], blocks: [], landmarks: [], furniture: [], context: [],
    layout: { quarters: [], reserved: [] },
    overrides: {}, additions: [],
  };
  // Quarters: one per mapped parcel with bounds (a Studio region or a neighborhood-compiler
  // candidate), turned into the kit frame, snapped to the module and clipped to the site, so
  // parcels drawn in Studio decide where kit blocks go; otherwise one quarter over the site.
  const constraints = { style: settings.style, depth: [12, 16], storeys: [1, 2], bays: [4.5, 7] };
  const parcels = { quarters: [], dropped: [] };
  if (settings.parcels === 'quarters') for (const parcel of parcelsOf(world)) {
    const corners = [[parcel.bounds_m[0], parcel.bounds_m[1]], [parcel.bounds_m[2], parcel.bounds_m[1]], [parcel.bounds_m[2], parcel.bounds_m[3]], [parcel.bounds_m[0], parcel.bounds_m[3]]].map(local);
    const rect = [snap(Math.max(0, Math.min(...corners.map(c => c[0])))), snap(Math.max(0, Math.min(...corners.map(c => c[1])))), snap(Math.min(width, Math.max(...corners.map(c => c[0])))), snap(Math.min(height, Math.max(...corners.map(c => c[1]))))];
    // A parcel drawn a sidewalk's width from its street meets the kit's corridor edge, so its blocks have frontage.
    const snapped = [];
    for (const [i, axis] of [[0, 'north'], [1, 'east'], [2, 'north'], [3, 'east']]) for (const street of kept) if (street.axis === axis) for (const edge of [street.position - street.outer, street.position + street.outer]) {
      if (Math.abs(rect[i] - edge) > EPS && Math.abs(rect[i] - edge) <= 1 + EPS) { snapped.push(`${['west', 'south', 'east', 'north'][i]} ${rect[i]} to ${mm(edge)} (${street.id})`); rect[i] = mm(edge); }
    }
    const quarterId = slug(parcel.id);
    if (rect[2] - rect[0] < KIT_CONVENTIONS.bay.min || rect[3] - rect[1] < KIT_CONVENTIONS.bay.min) { parcels.dropped.push({ parcel: parcel.id, reason: rect[2] <= rect[0] || rect[3] <= rect[1] ? 'outside the site' : `only ${mm(rect[2] - rect[0])} × ${mm(rect[3] - rect[1])} m inside the site` }); continue; }
    if (!idOk(quarterId) || parcels.quarters.some(entry => entry.id === quarterId)) { parcels.dropped.push({ parcel: parcel.id, reason: `quarter id ${quarterId} is invalid or repeated` }); continue; }
    parcels.quarters.push({ id: quarterId, parcel: parcel.id, name: parcel.name ?? null, rect: [...rect], snapped });
    recipe.layout.quarters.push({ id: quarterId, rect, ...constraints, names: [] });
  }
  if (!recipe.layout.quarters.length) recipe.layout.quarters.push({ id: 'quarter', ...constraints, names: [] });
  // Count the blocks each quarter yields, so its name pool has one placeholder per block.
  for (const quarter of recipe.layout.quarters) quarter.names = Array.from({ length: 256 }, (_, i) => `Placeholder ${i + 1}`);
  let layout = null, layoutError = null;
  try { layout = expandLayout(recipe); } catch (error) { layoutError = error.message; }
  const blocks = layout?.blocks.length ?? 0;
  for (const quarter of recipe.layout.quarters) {
    const count = layout ? layout.diagnostics.cells.filter(cell => cell.quarter === quarter.id).reduce((sum, cell) => sum + cell.blocks.length, 0) : 0;
    quarter.names = Array.from({ length: Math.max(1, count) }, (_, i) => `Placeholder shop ${i + 1}`);
  }
  const openLand = layout ? mm(layout.diagnostics.cells.filter(cell => cell.result === 'open').reduce((sum, cell) => sum + (cell.rect[2] - cell.rect[0]) * (cell.rect[3] - cell.rect[1]), 0)) : 0;
  recipe.reference = {
      source: { name: settings.source.name ?? null, sha256: settings.source.sha256 ?? null, crs: world.crs ?? 'LOCAL:METRES', origin: Array.isArray(world.origin) ? [...world.origin] : null, schema_version: world.schema_version ?? null },
      site: [...site], rotation, tolerance, module: MODULE, sidewalk, minimumLength, buildings,
      streets: kept.map(street => ({ id: street.id, roads: street.roads.map(road => road.id), name: street.roads[0].name, kind: street.roads[0].kind, width: street.roads[0].width })),
      blocks, openLand, parcels: { source: settings.parcels, quarters: parcels.quarters, dropped: parcels.dropped }, layoutWarnings: layout?.diagnostics.warnings ?? [], layoutError,
      dropped: [...dropped.values()].map(entry => ({ ...entry, reason: entry.reason === 'bends off the grid' ? `bends up to ${entry.worst}° off the grid` : entry.reason, worst: undefined })).sort((a, b) => a.road < b.road ? -1 : a.road > b.road ? 1 : a.reason < b.reason ? -1 : 1),
  };
  return recipe;
}

// Mapped parcels with axis-aligned bounds (Studio regions, neighborhood-compiler candidates); GIS parcels with rings are not land to build on here.
function parcelsOf(world) {
  if (!Array.isArray(world.parcels)) return [];
  const ids = new Set();
  return world.parcels.filter(parcel => parcel && typeof parcel.id === 'string' && Array.isArray(parcel.bounds_m) && parcel.bounds_m.length === 4 && parcel.bounds_m.every(finite) && parcel.bounds_m[0] < parcel.bounds_m[2] && parcel.bounds_m[1] < parcel.bounds_m[3])
    .filter(parcel => { if (ids.has(parcel.id)) fail(`parcel ids must be unique (${parcel.id})`); ids.add(parcel.id); return true; })
    .map(parcel => ({ id: parcel.id, name: typeof parcel.name === 'string' ? parcel.name : null, bounds_m: parcel.bounds_m }))
    .sort((a, b) => a.id < b.id ? -1 : 1);
}

// A segment with both ends outside the site can still cross it.
function crossesSite(a, b, width, height) {
  const steps = 16;
  for (let i = 1; i < steps; i++) { const t = i / steps, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; if (x >= 0 && x <= width && y >= 0 && y <= height) return true; }
  return false;
}
