// What the Five Rooms add to walking and flight (#825 M1, #841): the Ribbon posts and the parts
// of the venue shells that stand outside the mapped footprints. Renderer-free, read by
// walking.js, so the client and the authoritative server block the same discs whatever finish
// a player draws (the kit rule: a finish never changes collision; Val, 2026-11-01).
//
// Val's call for M1 (2026-11-01): the bays stay visual until retirement (decision 5) lands. The
// old tenant door keeps a gap in each frontage strip and every store room stays as it is; only
// what stands in front of the mapped wall is solid. Discs are [east, north, radius, height]
// above the ground under them, the shape plazaSalonFootprints and cityBikeRackFootprints use.
//
// The positions mirror the builders in this directory (counter.js ... studios-overlook.js) in
// each venue's frontage frame; preview/tests/five-rooms-integration.test.js checks every disc
// against the drawn geometry, so a builder that moves a part fails until this follows.
import contract from '../../../config/ribbon/five-rooms.json' with { type: 'json' };
import { districtRibbonPlan, DISTRICT_RIBBON_LANE } from '../ribbon-district.js';

export const FIVE_ROOMS_SOLIDS = Object.freeze({
  post: 0.21, // a 0.3 m post's half diagonal (the drawn column's head is 0.19)
  strip: Object.freeze({ z: 0.45, radius: 0.2, spacing: 0.3, height: 0.7 }), // covers 0.25-0.65 m out
  oldDoorHalf: 0.85 + 0.2, // store-rooms DOOR_HALF_WIDTH plus a strip disc
  leg: 0.1,
});
// Builder positions (local frame) for the legs that stand beyond the strip.
const LEGS = Object.freeze({
  'venue:starlight-screen': frame => [-frame.door, frame.door].map(x => [x, 0.65]),
  'venue:shade-garden': frame => [-(frame.door + 1.5) / 2, (frame.door + 1.5) / 2].map(x => [x, 0.67]),
});
const STUDIOS = Object.freeze({ legHeight: 3.2, crownRise: 0.9 });

const unit = v => { const length = Math.hypot(v[0], v[1]) || 1; return [v[0] / length, v[1] / length]; };

// The frontage frame of shells.js venueFrame, without three: local x along the frontage, z out.
export function frontageFrame(venue) {
  const entrance = venue.entrances[0], origin = entrance.centre, n = unit(entrance.outward), t = [-n[1], n[0]];
  const toLocal = ([east, north]) => { const d = [east - origin[0], north - origin[1]]; return [d[0] * t[0] + d[1] * t[1], d[0] * n[0] + d[1] * n[1]]; };
  const toSource = (x, z) => [origin[0] + t[0] * x + n[0] * z, origin[1] + t[1] * x + n[1] * z];
  const local = venue.footprint.map(toLocal), xs = local.map(p => p[0]), zs = local.map(p => p[1]);
  return { venue, toLocal, toSource, x0: Math.min(...xs), x1: Math.max(...xs), depth: -Math.min(...zs), front: Math.max(...zs), door: entrance.width, clear: venue.interior?.clearHeight ?? 3.6 };
}

// One venue's solids: discs in source metres.
export function venueSolids(venue, world) {
  const frame = frontageFrame(venue), S = FIVE_ROOMS_SOLIDS, out = [];
  const disc = (x, z, radius, height) => { const [east, north] = frame.toSource(x, z); out.push([round(east), round(north), radius, height]); };
  if (venue.kind === 'threshold') {
    const width = frame.x1 - frame.x0 - 0.2, mid = (frame.x0 + frame.x1) / 2, top = STUDIOS.legHeight + STUDIOS.crownRise;
    for (const z of [frame.front - 0.3, frame.front - frame.depth + 0.3]) for (const x of [mid - width / 2, mid + width / 2]) disc(x, z, S.leg, top);
    return out;
  }
  // Old doors of the tenants the venue would retire stay open until decision 5 (the store rooms
  // still open there).
  const doors = (venue.retire?.tenants ?? []).map(id => world?.stores?.find(store => store.id === id)).filter(Boolean).map(store => frame.toLocal(store.facade)[0]);
  const height = frame.clear + S.strip.height, open = x => Math.abs(x) < frame.door / 2 || doors.some(door => Math.abs(x - door) < S.oldDoorHalf);
  const from = frame.x0 + S.strip.radius, to = frame.x1 - S.strip.radius, steps = Math.max(1, Math.ceil((to - from) / S.strip.spacing));
  for (let i = 0; i <= steps; i++) { const x = from + (to - from) * i / steps; if (!open(x)) disc(x, S.strip.z, S.strip.radius, height); }
  for (const [x, z] of LEGS[venue.id]?.(frame) ?? []) disc(x, z, S.leg, frame.clear);
  return out;
}

const round = value => Math.round(value * 1000) / 1000;
const cache = new WeakMap();

/**
 * Groups of discs for walking.js: the Ribbon posts in runs of ten (so each group's box stays
 * small) and one group per venue. A world without the District's central lane (a creator world)
 * gets none; a world whose fixtures refuse the spine gets no posts.
 */
export function fiveRoomsFootprints(world, source = contract) {
  if (!world || !(world.roads ?? []).some(road => road.id === DISTRICT_RIBBON_LANE)) return [];
  if (source === contract && cache.has(world)) return cache.get(world);
  const groups = [];
  let posts = [];
  try { posts = districtRibbonPlan(world).posts.map(post => [round(post.position[0]), round(post.position[1]), FIVE_ROOMS_SOLIDS.post, round(post.height + 0.4)]); } catch { posts = []; }
  for (let i = 0; i < posts.length; i += 10) groups.push(posts.slice(i, i + 10));
  for (const venue of source.venues) groups.push(venueSolids(venue, world));
  const result = groups.filter(group => group.length);
  if (source === contract) cache.set(world, result);
  return result;
}
