// Five Rooms QA (#842, part of #825): the pure parts of the five-rooms journey (five-rooms.js)
// and the matched camera runner (five-rooms-cameras.mjs), so preview/tests/five-rooms-plan.test.js
// can hold them without a browser.
//
// The journey and the cameras are derived from the Spatial contract (#838,
// config/ribbon/five-rooms.json, validated by shared/city-kit/five-rooms-layout.js) rather than
// from a copy of its numbers, so a moved entrance moves the stop and the camera with it. This
// reader checks only the fields QA uses and names the first one that is missing or malformed;
// five-rooms.js reports that as a finding for #838 instead of guessing. Fields read (site-local
// metres, x east, y north; the #838 v1 draft of 2026-11-01):
//
//   { version, venues: [{ id: 'venue:<slug>', label, kind: 'bay'|'threshold', host: { buildingId },
//       footprint: [[x, y], ...], floor: { height, at },
//       entrances: [{ id, centre: [x, y], width, outward: [ux, uy], link: '<link id>' }],
//       interior: { floor: [[x, y], ...], clearHeight } | null (a threshold has none),
//       attachments: [{ id, role, position: [x, y, z], yaw, frame? }] }],
//     ribbon: { segments: [{ id, points, width, clearHeight, status: 'clear'|'blocked', ... }] },
//     links: [{ id, venue, entrance, segment }] }
//
// The spine is the segment called `spine`. An entrance's `outward` points from the room to the
// street. The walk goes spine start to spine end, then along each entrance's link segment to a
// stop outside the door; a `blocked` segment is still walked and its status is reported.
import { readFile } from 'node:fs/promises';
import { KIT_FINISHES } from '../../shared/city-kit/catalog.js';

export const CONTRACT_PATH = 'config/ribbon/five-rooms.json';
// The five rooms by #825's working labels, in the order the walk and the cameras visit them.
export const VENUE_IDS = Object.freeze(['venue:counter', 'venue:atelier', 'venue:starlight-screen', 'venue:shade-garden', 'venue:studios-overlook']);
export const SPINE_ID = 'spine';
export const EYE = 1.68, SEATED_EYE = 1.2;
// Noon is the day reference; the client's #sun-hour slider stops at 19:00 (preview/index.html),
// where atmosphereFor's twilight is already 1, so night is pinned there (as pink-jet-age-routes-plan.mjs).
export const HOURS = Object.freeze({ noon: 12, night: 19 });
export const CLIENT_LATEST_HOUR = 19;
export const FINISHES = Object.freeze(['classic', 'pink-jet-age']);
export const LIVE_FINISHES = Object.freeze(Object.keys(KIT_FINISHES));
export const GRAPHICS = Object.freeze(['sharp', 'smooth']);
// The views every venue gets, so classic and pink, noon and night, are compared at the same poses.
export const VENUE_VIEWS = Object.freeze(['street', 'entrance', 'indoor', 'seated', 'aerial']);

const point2 = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const idOk = id => typeof id === 'string' && /^[a-z0-9:][a-z0-9:-]{0,47}$/.test(id);
const slug = venueId => venueId.replace(/^venue:/, '');
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const unit = (from, to) => { const d = [to[0] - from[0], to[1] - from[1]], n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; };
const along = (p, dir, metres) => [p[0] + dir[0] * metres, p[1] + dir[1] * metres];
const centroid = points => points.reduce((sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length], [0, 0]);
const fail = message => { throw new Error(`Spatial contract: ${message}`); };

/** The contract with the fields QA reads checked; throws naming the first element that is missing or malformed. */
export function normalizeContract(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('not an object');
  if (!(Number.isInteger(raw.version) && raw.version >= 1) && !(typeof raw.version === 'string' && raw.version)) fail('version is required');
  if (!raw.ribbon || !Array.isArray(raw.ribbon.segments) || !raw.ribbon.segments.length) fail('ribbon.segments is required');
  const segments = new Map();
  for (const segment of raw.ribbon.segments) {
    if (!idOk(segment?.id)) fail(`segment id ${JSON.stringify(segment?.id)}`);
    if (segments.has(segment.id)) fail(`duplicate segment ${segment.id}`);
    if (!Array.isArray(segment.points) || segment.points.length < 2 || !segment.points.every(point2)) fail(`segment ${segment.id} needs two or more [x, y] points`);
    if (!(Number.isFinite(segment.width) && segment.width > 0)) fail(`segment ${segment.id} width`);
    segments.set(segment.id, segment);
  }
  if (!segments.has(SPINE_ID)) fail(`segment ${SPINE_ID} is required (the #827 District spine)`);
  if (!Array.isArray(raw.links)) fail('links is required');
  const links = new Map();
  for (const link of raw.links) {
    if (!idOk(link?.id)) fail(`link id ${JSON.stringify(link?.id)}`);
    if (!segments.has(link.segment)) fail(`link ${link.id} segment ${JSON.stringify(link.segment)} names no segment`);
    links.set(link.id, link);
  }
  if (!Array.isArray(raw.venues)) fail('venues is required');
  const venues = new Map();
  for (const venue of raw.venues) {
    if (!idOk(venue?.id)) fail(`venue id ${JSON.stringify(venue?.id)}`);
    if (venues.has(venue.id)) fail(`duplicate venue ${venue.id}`);
    if (typeof venue.host?.buildingId !== 'string' || !venue.host.buildingId) fail(`venue ${venue.id} host.buildingId`);
    if (!Array.isArray(venue.footprint) || venue.footprint.length < 3 || !venue.footprint.every(point2)) fail(`venue ${venue.id} footprint needs three or more [x, y] points`);
    if (!Array.isArray(venue.entrances) || !venue.entrances.length) fail(`venue ${venue.id} needs an entrance`);
    const entrances = venue.entrances.map(entrance => {
      if (!idOk(entrance?.id)) fail(`venue ${venue.id} entrance id ${JSON.stringify(entrance?.id)}`);
      if (!point2(entrance.centre) || !point2(entrance.outward) || Math.abs(Math.hypot(...entrance.outward) - 1) > 1e-3) fail(`entrance ${entrance.id} needs a centre and a unit outward`);
      if (!(Number.isFinite(entrance.width) && entrance.width >= 0.8)) fail(`entrance ${entrance.id} is narrower than 0.8 m`);
      const link = links.get(entrance.link);
      if (!link || link.entrance !== entrance.id) fail(`entrance ${entrance.id} link ${JSON.stringify(entrance.link)} names no link back to it`);
      return { id: entrance.id, door: entrance.centre, outward: entrance.outward, width: entrance.width, link: link.id, segment: link.segment };
    });
    const interior = venue.interior ?? null;
    if (interior !== null && (!Array.isArray(interior.floor) || interior.floor.length < 3 || !interior.floor.every(point2) || !(Number.isFinite(interior.clearHeight) && interior.clearHeight >= 2.2))) fail(`venue ${venue.id} interior floor polygon and clearHeight (>= 2.2 m)`);
    if (interior === null && venue.kind !== 'threshold') fail(`venue ${venue.id} interior is required for a ${venue.kind ?? 'bay'}`);
    const seats = (venue.attachments ?? []).filter(item => item?.frame !== 'campus' && /seat|bench/.test(`${item?.role} ${item?.id}`) && Array.isArray(item.position) && item.position.every(Number.isFinite)).map(item => [item.position[0], item.position[1]]);
    venues.set(venue.id, { id: venue.id, label: venue.label ?? slug(venue.id), kind: venue.kind ?? 'bay', building: venue.host.buildingId, footprint: venue.footprint, floor: venue.floor ?? null, entrances, interior, seats });
  }
  for (const id of VENUE_IDS) if (!venues.has(id)) fail(`venue ${id} is missing (the contract must name all five rooms)`);
  return { version: raw.version, venues: VENUE_IDS.map(id => venues.get(id)), segments: [...segments.values()], links: [...links.values()] };
}

/** `{ contract, path }` when the contract exists and validates, else `{ contract: null, reason }`. */
export async function readContract(root) {
  const path = new URL(CONTRACT_PATH, root);
  let text;
  try { text = await readFile(path, 'utf8'); } catch (error) {
    return { contract: null, path: path.pathname, reason: error.code === 'ENOENT' ? `${CONTRACT_PATH} does not exist on this head (#838 v1 not published here)` : error.message };
  }
  try { return { contract: normalizeContract(JSON.parse(text)), path: path.pathname, reason: null }; }
  catch (error) { return { contract: null, path: path.pathname, reason: error.message }; }
}

/** A segment's points ordered from its far end toward the point it serves. */
function orientedToward(segment, target) {
  const points = segment.points, first = points[0], last = points.at(-1);
  const forward = Math.hypot(last[0] - target[0], last[1] - target[1]) <= Math.hypot(first[0] - target[0], first[1] - target[1]);
  return forward ? points : [...points].reverse();
}

/**
 * The walk: the spine end to end, then each venue's first entrance along its link segment. Each
 * stop stands `standOff` metres outside the door on its outward side and faces in.
 */
export function ribbonTraversal(contract, { standOff = 1.2 } = {}) {
  const segments = new Map(contract.segments.map(segment => [segment.id, segment]));
  const spine = segments.get(SPINE_ID).points;
  const stops = contract.venues.map(venue => {
    const entrance = venue.entrances[0], door = entrance.door, segment = segments.get(entrance.segment), inward = [-entrance.outward[0], -entrance.outward[1]];
    const stand = along(door, entrance.outward, standOff), face = along(door, inward, 2);
    const approach = segment.id === SPINE_ID ? [stand] : [...orientedToward(segment, stand), stand];
    return { venue: venue.id, label: venue.label, entrance: entrance.id, link: entrance.link, segment: segment.id, status: segment.status ?? 'clear', approach, door, stand, face, inward };
  });
  return { spine, stops };
}

const camera = (id, group, stop, subject, position, target, fov, extra = {}) => ({ id, group, stop, subject, frame: 'source', source: { position, target }, fov, ...extra });
// The spine station nearest a point, for the IPIC and venue street views.
function nearestOnPolyline(points, p) {
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], ab = [b[0] - a[0], b[1] - a[1]], len2 = ab[0] ** 2 + ab[1] ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2)), q = [a[0] + ab[0] * t, a[1] + ab[1] * t], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!best || d < best.d) best = { d, q, dir: unit(a, b) };
  }
  return best;
}

/**
 * The spawn frame: the arrival spawn looking toward walkLookAt at eye height, from world data
 * alone, so the draw-call baseline can be measured on main before any contract exists.
 */
export function spawnCamera(world, ground = () => 0) {
  const [east, north] = world.walkSpawn, look = world.walkLookAt ?? [east, north + 35];
  return camera('r01-arrival', 'route', 'arrival', 'The arrival spawn toward the walk look-at (the #825 M0 view and the draw-call budget frame)', [east, north, ground(east, north) + EYE], [look[0], look[1], ground(look[0], look[1]) + EYE], 62);
}

/**
 * The matched camera table in source metres [east, north, altitude]: five views per venue
 * (street, entrance, indoor, seated, aerial) and five Ribbon route views. `ground(east, north)`
 * is the walking surface height; `world` supplies walkSpawn and the IPIC facade for the route views.
 */
export function fiveRoomsCameras(contract, { ground = () => 0, world = null } = {}) {
  const { spine, stops } = ribbonTraversal(contract), cameras = [];
  let n = 0;
  const id = (prefix, name) => `${prefix}${String(++n).padStart(2, '0')}-${name}`;
  const start = spine[0], end = spine.at(-1), dir0 = unit(spine[0], spine[1]), dirEnd = unit(spine.at(-2), spine.at(-1));
  cameras.push(world?.walkSpawn ? spawnCamera(world, ground) : camera(id('r', 'arrival'), 'route', 'arrival', 'Before the Ribbon start, along the walk (no world given)', [...along(start, dir0, -8), ground(...start) + EYE], [...along(start, dir0, 12), ground(...start) + 3], 62));
  n = Math.max(n, 1);
  cameras.push(camera(id('r', 'spine-south'), 'route', 'spine', 'Under the canopy at the spine start, along the walk', [...along(start, dir0, 1), ground(...start) + EYE], [...along(start, dir0, 25), ground(...start) + 2.5], 66));
  const ipic = world?.stores?.find(store => /ipic/i.test(store.name));
  const station = nearestOnPolyline(spine, ipic ? [ipic.facade[0], ipic.facade[1]] : mid(start, end));
  cameras.push(camera(id('r', 'spine-ipic'), 'route', 'spine', ipic ? 'On the spine beside IPIC, north along the walk' : 'On the spine at its midpoint, along the walk', [...along(station.q, station.dir, -6), ground(...station.q) + EYE], [...along(station.q, station.dir, 18), ground(...station.q) + 2.5], 66));
  cameras.push(camera(id('r', 'spine-north-end'), 'route', 'spine', 'From the spine end, back along the whole walk', [...along(end, dirEnd, 1), ground(...end) + EYE], [...along(end, dirEnd, -30), ground(...end) + 2.5], 66));
  const middle = mid(start, end);
  cameras.push(camera(id('r', 'district-aerial'), 'route', 'aerial', 'The District from above, the whole Ribbon and the five rooms', [middle[0] - 45, middle[1] - 45, ground(...middle) + 70], [...middle, ground(...middle) + 5], 55));
  n = 0;
  for (const [i, stop] of stops.entries()) {
    const venue = contract.venues[i], name = slug(venue.id), g = p => ground(p[0], p[1]);
    // The street view stands where the link leaves the Ribbon; an entrance on the spine itself has no link, so 6 m out along its outward.
    const linkStart = stop.approach[0], street = Math.hypot(linkStart[0] - stop.door[0], linkStart[1] - stop.door[1]) >= 4 ? linkStart : along(stop.door, [-stop.inward[0], -stop.inward[1]], 6);
    const doorEye = [...stop.door, g(stop.door) + 1.4];
    // A bay's indoor view stands at its interior floor's centroid; a threshold (no envelope) 3 m in from its opening.
    const inside = venue.interior ? centroid(venue.interior.floor) : along(stop.door, stop.inward, 3);
    const seat = venue.seats[0] ?? along(stop.door, stop.inward, 4);
    const foot = centroid(venue.footprint);
    cameras.push(
      camera(id('v', `${name}-street`), 'venue', 'street', `${stop.label}: from the Ribbon (${stop.segment}), toward the entrance`, [...street, g(street) + EYE], doorEye, 66, { venue: venue.id }),
      camera(id('v', `${name}-entrance`), 'venue', 'entrance', `${stop.label}: standing ${1.2} m outside the door line, looking in`, [...stop.stand, g(stop.stand) + EYE], [...stop.face, g(stop.face) + 1.4], 72, { venue: venue.id }),
      camera(id('v', `${name}-indoor`), 'venue', 'indoor', `${stop.label}: inside the blank envelope (a threshold: 3 m in), looking back to the entrance`, [...inside, g(inside) + EYE], doorEye, 72, { venue: venue.id }),
      camera(id('v', `${name}-seated`), 'venue', 'seated', `${stop.label}: seated height at the first seat attachment (or 4 m inside the door), toward the entrance`, [...seat, g(seat) + SEATED_EYE], doorEye, 70, { venue: venue.id }),
      camera(id('v', `${name}-aerial`), 'venue', 'aerial', `${stop.label}: oblique aerial over the footprint`, [foot[0] - 22, foot[1] - 22, g(foot) + 30], [...foot, g(foot) + 2], 55, { venue: venue.id }),
    );
  }
  return validateCameras(cameras);
}

const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
/** Throws on a malformed table: ids, groups, finite poses, a real look direction. */
export function validateCameras(cameras) {
  const ids = new Set();
  for (const item of cameras) {
    const where = item?.id ?? JSON.stringify(item);
    if (!/^[rv]\d\d-[a-z0-9-]+$/.test(item?.id ?? '')) throw new Error(`${where}: id must be v<nn>-name or r<nn>-name`);
    if (ids.has(item.id)) throw new Error(`${where}: duplicate id`);
    ids.add(item.id);
    if (!['venue', 'route'].includes(item.group) || item.id[0] !== item.group[0]) throw new Error(`${where}: group and id prefix disagree`);
    if (item.group === 'venue' && (!VENUE_IDS.includes(item.venue) || !VENUE_VIEWS.includes(item.stop))) throw new Error(`${where}: venue cameras name a venue and one of ${VENUE_VIEWS.join(', ')}`);
    if (!vector(item.source?.position) || !vector(item.source?.target)) throw new Error(`${where}: position and target must be finite [east, north, altitude]`);
    if (Math.hypot(...item.source.position.map((value, i) => value - item.source.target[i])) < 2) throw new Error(`${where}: target closer than 2 m`);
    if (!(item.fov >= 30 && item.fov <= 100)) throw new Error(`${where}: fov out of 30-100`);
    if (!item.subject || !item.stop) throw new Error(`${where}: subject and stop are required`);
  }
  return cameras;
}

/** The Three.js pose __riverRenderAudit.view takes: source [east, north, altitude] to [east, altitude, -north]. */
export const scenePose = item => ({ position: [item.source.position[0], item.source.position[2], -item.source.position[1]], target: [item.source.target[0], item.source.target[2], -item.source.target[1]], fov: item.fov });

export const viewName = (item, hour, finish) => `${item.id}-${hour}-${finish}`;
/** The audited page's address for a finish; classic is explicit, so a stored choice never leaks in. */
export const districtPath = (finish, { hour = null } = {}) => {
  if (!LIVE_FINISHES.includes(finish)) throw new Error(`Unknown finish ${finish}`);
  return `/?render-audit=1&finish=${encodeURIComponent(finish)}${hour === null ? '' : `&time=${hour}`}`;
};

// The draw-call budget (#842): no 657 constant exists in the code, so the budget is pinned from
// the measured classic spawn frame on main (same camera, revision, graphics preset and viewport)
// plus a headroom for the five shells and the Ribbon. The pin file records what was measured.
export const BUDGET_HEADROOM = 0.15;
export const BUDGET_PATH = 'preview/e2e/five-rooms-budget.json';
export const drawCallBudget = (baselineCalls, headroom = BUDGET_HEADROOM) => {
  if (!(Number.isFinite(baselineCalls) && baselineCalls > 0)) throw new Error('a measured baseline is required to pin a budget');
  return Math.ceil(baselineCalls * (1 + headroom));
};
/** Throws unless the pin records a measured baseline and the budget derived from it. */
export function validateBudgetPin(pin) {
  for (const key of ['measuredAt', 'head', 'camera', 'graphics']) if (typeof pin?.[key] !== 'string' || !pin[key]) throw new Error(`budget pin: ${key} is required`);
  if (!Array.isArray(pin.viewport) || pin.viewport.length !== 2) throw new Error('budget pin: viewport [w, h] is required');
  const baseline = pin.baseline;
  if (!baseline || !Number.isFinite(baseline.classicCalls) || !Number.isFinite(baseline.pinkCalls)) throw new Error('budget pin: baseline.classicCalls and baseline.pinkCalls (measured on main) are required');
  if (pin.budgetCalls !== drawCallBudget(baseline.classicCalls, pin.headroom ?? BUDGET_HEADROOM)) throw new Error('budget pin: budgetCalls must equal the headroom over baseline.classicCalls');
  return pin;
}
/** `{ within, delta, budgetCalls }` for a measured spawn frame against the pin. */
export const judgeBudget = (pin, measuredCalls) => ({ within: measuredCalls <= pin.budgetCalls, delta: measuredCalls - pin.baseline.classicCalls, budgetCalls: pin.budgetCalls, measuredCalls });

// The pink rule (#825, Val 2026-10-31): at night, pink light only on usable things (seats, doors
// that open, display frames, lift controls) and three landmarks (IPIC marquee, clock face, Overlook
// lantern). A lit pink pixel at night is one whose hue is pink and whose value is well above the
// night ambient; the picked object under each cluster decides which rule it meets.
export const PINK = Object.freeze({ hueMin: 290, hueMax: 352, minSaturation: 0.3, minValue: 0.42, minClusterPixels: 6 });
export const PINK_RULE = Object.freeze({
  usable: /seat|bench|door|frame|display|vitrine|lift|control|button|handle|rail/i,
  landmark: /marquee|clock|overlook[^]*lantern|lantern[^]*overlook/i,
});
export function hsv([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d > 0) h = max === R ? 60 * (((G - B) / d) % 6) : max === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
  if (h < 0) h += 360;
  return { h, s: max ? d / max : 0, v: max };
}
export const isPinkLit = rgb => { const { h, s, v } = hsv(rgb); return h >= PINK.hueMin && h <= PINK.hueMax && s >= PINK.minSaturation && v >= PINK.minValue; };
/** Connected clusters (4-neighbour) of lit pink pixels in an RGBA buffer, largest first. */
export function pinkClusters(pixels, width, height, { minPixels = PINK.minClusterPixels } = {}) {
  const mask = new Uint8Array(width * height), seen = new Uint8Array(width * height), clusters = [];
  for (let i = 0; i < width * height; i++) mask[i] = isPinkLit([pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]) ? 1 : 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start], members = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % width, y = (i - x) / width;
      members.push(i);
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) if (j >= 0 && mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    if (members.length < minPixels) continue;
    let x0 = width, y0 = height, x1 = 0, y1 = 0, sx = 0, sy = 0;
    for (const i of members) { const x = i % width, y = (i - x) / width; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); sx += x; sy += y; }
    clusters.push({ pixels: members.length, bbox: [x0, y0, x1, y1], centroid: [Math.round(sx / members.length), Math.round(sy / members.length)] });
  }
  return clusters.sort((a, b) => b.pixels - a.pixels);
}
/** What the pink rule says about the object a pick found under a lit pink cluster. */
export function classifyPinkHit(hit) {
  if (!hit) return { verdict: 'unresolved', reason: 'the pick met no surface (sky, or a sprite the audit cannot raycast)' };
  const text = `${hit.object ?? ''} ${hit.path ?? ''} ${hit.material ?? ''}`;
  if (PINK_RULE.landmark.test(text)) return { verdict: 'landmark', reason: text.trim() };
  if (PINK_RULE.usable.test(text)) return { verdict: 'usable', reason: text.trim() };
  return { verdict: 'violation', reason: `pink light on ${text.trim() || 'an unnamed surface'}, which is neither usable nor one of the three landmarks` };
}

// A capture whose luma barely varies is a camera inside a wall or a black frame, not a view.
export const BLANK_LUMA_SPREAD = 6;
export const imageVerdict = ({ mean, spread }) => (spread < BLANK_LUMA_SPREAD ? 'blank' : mean < 12 ? 'dark' : 'ok');

/** --finishes=classic,pink-jet-age --hours=noon,night --cameras=id,id --graphics=sharp|smooth --revision=<district revision> --out=dir --pin=baseline|integrated */
export function cameraOptions(args, now = new Date()) {
  const options = { finishes: [...FINISHES], hours: Object.keys(HOURS), cameras: null, graphics: 'sharp', revision: null, out: null, pin: null }, seen = new Set();
  for (const arg of args) {
    const [, key, value] = /^--(finishes|hours|cameras|graphics|revision|out|pin)=(.+)$/.exec(arg) ?? [];
    if (!key || seen.has(key)) throw new Error(`Invalid or duplicate option: ${arg}`);
    seen.add(key);
    if (key === 'finishes') { options.finishes = value.split(','); if (!options.finishes.every(finish => LIVE_FINISHES.includes(finish))) throw new Error(`Finishes must be catalog finishes (${LIVE_FINISHES.join(', ')}): ${arg}`); }
    if (key === 'hours') { options.hours = value.split(','); if (!options.hours.every(label => Object.hasOwn(HOURS, label))) throw new Error(`Hours must be ${Object.keys(HOURS).join(', ')}: ${arg}`); }
    if (key === 'cameras') options.cameras = value.split(',');
    if (key === 'graphics') { if (!GRAPHICS.includes(value)) throw new Error(`Graphics must be ${GRAPHICS.join(' or ')}: ${arg}`); options.graphics = value; }
    if (key === 'revision') options.revision = value;
    if (key === 'out') options.out = value;
    if (key === 'pin') { if (!['baseline', 'integrated'].includes(value)) throw new Error(`--pin takes baseline or integrated: ${arg}`); options.pin = value; }
  }
  options.out ??= `.runtime/five-rooms/${now.toISOString().replace(/[:.]/g, '-')}`;
  return options;
}

/** Throws unless the report holds one measured, non-blank view per camera, hour and finish, and a pink review of every night view. */
export function validateCameraReport(report) {
  if (report?.status !== 'passed') throw new Error('report status must be passed');
  for (const key of ['head', 'graphics', 'contractVersion']) if (report[key] === undefined || report[key] === null || report[key] === '') throw new Error(`report.${key} is required`);
  validateCameras(report.cameras);
  const views = new Map(report.views.map(view => [view.name, view]));
  for (const item of report.cameras) for (const [label, hour] of Object.entries(report.hours)) for (const finish of report.finishes) {
    const view = views.get(viewName(item, label, finish));
    if (!view) throw new Error(`missing view ${viewName(item, label, finish)}`);
    if (view.hour !== hour || view.camera !== item.id || view.finish !== finish) throw new Error(`${view.name}: camera, hour or finish mismatch`);
    for (const key of ['calls', 'triangles', 'frameP50', 'frameP95']) if (!Number.isFinite(view[key])) throw new Error(`${view.name}: ${key} must be a number`);
    if (view.image?.verdict !== 'ok') throw new Error(`${view.name}: image ${view.image?.verdict ?? 'unmeasured'}`);
    if (label === 'night' && !Array.isArray(view.pink?.clusters)) throw new Error(`${view.name}: night views carry a pink review`);
    if (typeof view.png !== 'string' || !view.png.endsWith('.png')) throw new Error(`${view.name}: png path required`);
  }
  if (report.views.length !== report.cameras.length * Object.keys(report.hours).length * report.finishes.length) throw new Error('views must be exactly cameras x hours x finishes');
  return report;
}

// Receipts stay compact: no raw sha256 maps (they read as generic API keys to gitleaks, and the
// journey's evidence is counts and positions, not file digests).
export function assertCompact(value, path = 'receipt') {
  if (typeof value === 'string') { if (/^[0-9a-f]{40,64}$/i.test(value)) throw new Error(`${path} holds a raw digest; receipts record counts, positions and names only`); return value; }
  if (Array.isArray(value)) { value.forEach((item, i) => assertCompact(item, `${path}[${i}]`)); return value; }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 64 && keys.every(key => /^[^\s]+\.(?:js|json|css|html|glsl)$/.test(key))) throw new Error(`${path} is a per-file map; receipts stay compact`);
    for (const key of keys) assertCompact(value[key], `${path}.${key}`);
  }
  return value;
}
