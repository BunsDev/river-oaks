import * as THREE from 'three';
import { buildPlanterPlanting } from '../landscape-models.js';
import { PLANTER_HALF, PLANTER_OVERHANG, PLANT_SPECIES } from '../planting-palette.js';
import { RIBBON_RULES } from '../../../shared/city-kit/ribbon-layout.js';
import { buildFiveRoomsGround } from './ground.js';

// Five Rooms landscape (#840): the paved entrance aprons, the Shade Garden court, planting beds
// and the Ribbon's planted edge, placed only from the expanded Five Rooms contract
// (shared/city-kit/five-rooms-layout.js expandFiveRooms over config/ribbon/five-rooms.json), so a
// contract change moves them and nothing here is a hand-placed coordinate. Built only under the
// `pink-jet-age` finish; classic builds nothing. Integration (#841) adds the group to the scene
// and registers ground.js's paving with registerGroundSurfaces.
//
// Every bed is a lane-planter unit (planting-palette.js: 1.5 x 0.62 m, foliage spilling at most
// 0.1 m past it) planted with the existing composition. Edge beds are raised planters (the 0.62 m
// shell); a court bed is planted in the court floor, so its plants stand on the ground (landscape-models.js
// buildPlanterPlanting): no new asset. A bed whose envelope would enter a doorway, a link reach,
// a seat's access zone, a step-free route, a no-go zone (fixtures, tree pits, buildings, roads),
// a walk, a post or a camera corridor is not placed; the plan lists it with what displaced it.

// Pending decisions stay behind named data flags; neither is decided here.
export const FIVE_ROOMS_LANDSCAPE_FLAGS = Object.freeze({
  // Val's decision 6 (#838 layout.md): may the Shade Garden open the Hermès bay as a court inside
  // its mapped building? Until it is decided the court floor and its bed are not built.
  shadeGardenOpenCourt: false,
  // #838 marks every Ribbon segment `blocked` (street trees, the side-lane mouth, a bench body, the
  // REF-HW-01 bed): a blocked segment's placements are raw geometry, so its planted edge is drawn
  // only behind this flag until its blockers move.
  blockedSegmentPlanting: false,
});

const shellHeight = 0.62, tallest = Math.max(...Object.values(PLANT_SPECIES).map(species => species.height[1]));
export const FIVE_ROOMS_LANDSCAPE_RULES = Object.freeze({
  // Paving sits this far above the ground it follows, so it never z-fights the terrain.
  pavingLift: 0.008,
  // Paving follows the ground on a grid no coarser than this (metres).
  pavingStep: 0.5,
  // A bed: the planter plus its overhang; its height is the shell (none in a court) plus its
  // tallest plant.
  bed: Object.freeze({ length: PLANTER_HALF[0] * 2 + PLANTER_OVERHANG * 2, depth: PLANTER_HALF[1] * 2 + PLANTER_OVERHANG * 2, shell: shellHeight, plants: tallest }),
  // The planted edge: one bed every `every` modules, `gap` beyond the edge posts' faces.
  plantedEdge: Object.freeze({ every: 2, gap: 0.1 }),
});

const mm = value => Math.round(value * 1000) / 1000;
const corners = r => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
const box = (centre, dir, length, depth) => {
  const n = [-dir[1], dir[0]];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [centre[0] + i * dir[0] * length / 2 + j * n[0] * depth / 2, centre[1] + i * dir[1] * length / 2 + j * n[1] * depth / 2]);
};
const moduleShape = m => box([(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2], [Math.cos(m.yaw), Math.sin(m.yaw)], m.length, m.width);
const postShape = p => corners([p.position[0] - RIBBON_RULES.post / 2, p.position[1] - RIBBON_RULES.post / 2, p.position[0] + RIBBON_RULES.post / 2, p.position[1] + RIBBON_RULES.post / 2]);
// Separating axes: do two convex polygons share interior area? Touching does not count.
export function overlaps(a, b) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], axis = [q[1] - p[1], p[0] - q[0]], size = Math.hypot(axis[0], axis[1]) || 1;
    const pa = a.map(v => v[0] * axis[0] + v[1] * axis[1]), pb = b.map(v => v[0] * axis[0] + v[1] * axis[1]);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= 1e-6 * size) return false;
  }
  return true;
}
function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of sorted) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of sorted.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
// A camera corridor as a box: its sight line widened by its half width across and up and down.
export function corridorBox(corridor) {
  const [fx, fy, fz] = corridor.from, [tx, ty, tz] = corridor.to, length = Math.hypot(tx - fx, ty - fy);
  return { shape: box([(fx + tx) / 2, (fy + ty) / 2], [(tx - fx) / length, (ty - fy) / length], length, corridor.halfWidth * 2), bottom: Math.min(fz, tz) - corridor.halfWidth, top: Math.max(fz, tz) + corridor.halfWidth };
}

// What a planting envelope (a footprint and a height band) runs into. Zones are 2D and stand
// floor to sky; camera corridors are boxes.
// `inside` is a ring the envelope stands within (a court): a building zone holding all of it is
// the court's own host, not an obstacle.
export function plantingConflicts(envelope, expanded, { others = [], inside = null } = {}) {
  const out = [];
  const holds = rect => inside && inside.every(([x, y]) => x >= rect[0] - 1e-6 && x <= rect[2] + 1e-6 && y >= rect[1] - 1e-6 && y <= rect[3] + 1e-6);
  for (const zone of expanded.exclusions) {
    if (zone.kind === 'no-go' && zone.id.startsWith('building-') && holds(zone.rect)) continue;
    if (overlaps(envelope.shape, corners(zone.rect))) out.push(`${zone.kind} ${zone.id}`);
  }
  for (const module of expanded.modules) if (overlaps(envelope.shape, moduleShape(module))) out.push(`walk ${module.id}`);
  for (const post of expanded.posts) if (overlaps(envelope.shape, postShape(post))) out.push(`post ${post.id}`);
  for (const corridor of expanded.cameras) {
    const { shape, bottom, top } = corridorBox(corridor);
    if (overlaps(envelope.shape, shape) && envelope.bottom < top && envelope.top > bottom) out.push(`camera ${corridor.id}`);
  }
  for (const other of others) if (overlaps(envelope.shape, other.shape)) out.push(`bed ${other.id}`);
  return out;
}

// The landscape plan: plain data in source metres (x east, y north) with heights from `groundAt`.
export function fiveRoomsLandscapePlan(expanded, { groundAt, flags = FIVE_ROOMS_LANDSCAPE_FLAGS } = {}) {
  if (typeof groundAt !== 'function') throw new Error('fiveRoomsLandscapePlan needs groundAt(x, north)');
  const rules = FIVE_ROOMS_LANDSCAPE_RULES, bed = rules.bed;
  const paving = [], courts = [], beds = [], dropped = [], pending = [];
  // Entrance aprons: the doorway zone of each linked entrance and the reach that joins it to its
  // walk. Public ground in front of a door, paved so it reads as such.
  for (const link of expanded.links) {
    const venue = expanded.venues.find(item => item.id === link.venue), entrance = venue.entrances.find(item => item.id === link.entrance);
    paving.push({ id: `paving:${link.id.replace(/^link:/, '')}`, venue: venue.id, entrance: entrance.id, link: link.id, ring: hull([...corners(entrance.doorway), ...link.reach]).map(p => p.map(mm)) });
  }
  // Venue courts: a bay opened to the sky. Only the Shade Garden is proposed as one (decision 6).
  const shade = expanded.venues.find(venue => venue.id === 'venue:shade-garden');
  const courtBeds = [];
  if (shade) {
    const court = { id: 'court:shade-garden', venue: shade.id, ring: shade.interior.floor.map(p => p.map(mm)), floor: shade.floor.height, decision: 'Val decision 6: open the Hermès bay as a court inside its mapped building' };
    if (flags.shadeGardenOpenCourt) courts.push(court); else pending.push({ ...court, flag: 'shadeGardenOpenCourt' });
    for (const item of shade.attachments.filter(a => a.role === 'bed')) courtBeds.push({ id: `bed:${item.id.replace(/^attach:/, '')}`, kind: 'court', source: item.id, centre: [item.position[0], item.position[1]], yaw: item.yaw, court: court.id, inside: court.ring, built: Boolean(flags.shadeGardenOpenCourt) });
  }
  // Ribbon planted edge: beds beyond the edge posts on the side no link uses (both sides of a
  // segment with only an end link), one every `every` modules.
  const edgeBeds = [];
  for (const segment of expanded.segments) {
    const linked = new Set(expanded.links.filter(link => link.segment === segment.id && link.side).map(link => link.side));
    const sides = ['left', 'right'].filter(side => !linked.has(side));
    const built = segment.status === 'clear' || Boolean(flags.blockedSegmentPlanting);
    for (const module of expanded.modules.filter(item => item.segment === segment.id && item.index % rules.plantedEdge.every === 0)) {
      const dir = [Math.cos(module.yaw), Math.sin(module.yaw)];
      for (const side of sides) {
        const sign = side === 'left' ? 1 : -1, n = [-dir[1] * sign, dir[0] * sign], offset = module.width / 2 + RIBBON_RULES.post / 2 + rules.plantedEdge.gap + bed.depth / 2;
        const centre = [(module.from[0] + module.to[0]) / 2 + n[0] * offset, (module.from[1] + module.to[1]) / 2 + n[1] * offset];
        edgeBeds.push({ id: `bed:${module.id.replace(/^ribbon:/, '').replace(':module:', ':edge:')}:${side[0]}`, kind: 'edge', source: module.id, segment: segment.id, side, centre, yaw: module.yaw, built, ...(built ? {} : { flag: 'blockedSegmentPlanting', status: segment.status }) });
      }
    }
  }
  for (const { inside, ...candidate } of [...courtBeds, ...edgeBeds]) {
    const ground = groundAt(candidate.centre[0], candidate.centre[1]), shell = candidate.kind === 'edge' ? bed.shell : 0;
    const envelope = { shape: box(candidate.centre, [Math.cos(candidate.yaw), Math.sin(candidate.yaw)], bed.length, bed.depth), bottom: ground, top: ground + shell + bed.plants };
    const conflicts = plantingConflicts(envelope, expanded, { others: beds, inside });
    const record = { ...candidate, centre: candidate.centre.map(mm), ground: mm(ground), shell, shape: envelope.shape.map(p => p.map(mm)), bottom: mm(envelope.bottom), top: mm(envelope.top) };
    if (conflicts.length) dropped.push({ id: record.id, source: record.source, conflicts });
    else if (!record.built) pending.push(record);
    else beds.push(record);
  }
  return { id: 'five-rooms-landscape', contract: expanded.version, hash: expanded.hash, flags: { ...flags }, paving, courts, beds, dropped, pending, stats: { paving: paving.length, courts: courts.length, beds: beds.length, dropped: dropped.length, pending: pending.length } };
}

// Under `pink-jet-age` only, and only in the District the contract was drawn on.
export const fiveRoomsLandscapeAppliesTo = (world, finish, expanded) => finish === 'pink-jet-age' && world?.scene === 'district'
  && Boolean(expanded?.venues?.every(venue => (world.buildings ?? []).some(building => building.id === venue.host.buildingId)));

// Scene frame: [east, height, -north] (geometry.js localToScene).
export function buildFiveRoomsLandscape(plan, { groundAt, planting = buildPlanterPlanting } = {}) {
  const group = new THREE.Group(); group.name = 'Five Rooms landscape';
  const ground = buildFiveRoomsGround(plan, { groundAt });
  group.add(ground);
  if (plan.beds.length) {
    // buildPlanterPlanting stands plants on a 0.62 m shell; an in-ground court bed is lowered by it.
    const rules = FIVE_ROOMS_LANDSCAPE_RULES, planters = plan.beds.map(bed => [bed.centre[0], bed.ground + bed.shell - rules.bed.shell, -bed.centre[1], bed.yaw]);
    const raised = plan.beds.filter(bed => bed.shell > 0).map(bed => [bed.centre[0], bed.ground, -bed.centre[1], bed.yaw]);
    const shell = new THREE.MeshStandardMaterial({ color: '#d8d0c2', roughness: 0.85 }), mulch = new THREE.MeshStandardMaterial({ color: '#2e241b', roughness: 1 });
    const unit = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D();
    for (const [name, material, lift, scale] of [['Five Rooms bed shells', shell, rules.bed.shell / 2, [PLANTER_HALF[0] * 2, rules.bed.shell, PLANTER_HALF[1] * 2]], ['Five Rooms bed mulch', mulch, rules.bed.shell + 0.006, [PLANTER_HALF[0] * 2 - 0.1, 0.012, PLANTER_HALF[1] * 2 - 0.1]]]) {
      if (!raised.length) continue;
      const mesh = new THREE.InstancedMesh(unit, material, raised.length); mesh.name = name;
      raised.forEach(([x, y, z, yaw], i) => { dummy.position.set(x, y + lift, z); dummy.rotation.set(0, yaw, 0); dummy.scale.fromArray(scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
      mesh.castShadow = material === shell; mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
    }
    group.add(planting(planters));
  }
  group.userData.fiveRoomsLandscape = { hash: plan.hash, stats: { ...plan.stats }, pending: plan.pending.map(item => item.id) };
  return group;
}
