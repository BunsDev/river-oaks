// Versioned office layouts (#361). The legacy 9 x 7 m room stays the default and the
// rollback; the penthouse is the reviewed #360 proposal (docs/design/office-ipic/
// layout-contract.json), expressed in #349's level and portal shape: levels
// `jevica-office/l<n>`, portals `<level>/portal/<name>`. Positions are the office's own
// [x, d] frame (x east across the entrance wall, d inward); a level's floorElevation is
// metres above the office floor. Collision is per level, so floors that overlap in plan
// (the mezzanine over the main floor) are told apart by the level the server admitted,
// never by a height a client reports. Stairs and lift are fixed-endpoint transitions,
// as #349's stairs are: entry within reach, a paired landing that must be free.
//
// The penthouse carries only what the reviewed contract states: shell, levels, terrace
// openings, stair, lift, anchors and the approved mezzanine programme. Of the supplied
// kit's furniture colliders, only the measured desk footprints are imported (R19, below).
//
// Seats (#363) are the desk chairs and the library reading chairs. A visitor claims one from
// its stand point and stands back up there. While a seat is taken, the measured seated body
// (AVATAR_ENVELOPE.seatedRadius) is collision for everyone else on that floor, who keep their
// turning radius clear of it, as the legacy room's plan check does (workplace-room.js), and
// keep body spacing from its stand point.
// Functions that take `occupied` expect seat records (`levelId`, `position`, `stand`) from this plan.
import { AVATAR_ENVELOPE } from './workplace-room.js';
import { OFFICE_ROOM, OFFICE_SPAWN, officeFree } from './office-contract.js';

export const OFFICE_LAYOUT_LEGACY = 'office-legacy-1';
export const OFFICE_LAYOUT_PENTHOUSE = 'office-penthouse-1';
export const DEFAULT_OFFICE_LAYOUT = OFFICE_LAYOUT_LEGACY;
export const OFFICE_BUILDING = 'jevica-office';
export const OFFICE_PORTAL_REACH = 1.3;
export const OFFICE_SEAT_REACH = 1.3;
export const OFFICE_OCCUPIED_CLEARANCE = AVATAR_ENVELOPE.turningRadius + AVATAR_ENVELOPE.seatedRadius;
// Two standing bodies' centres stay at least this far apart where one is placed: a stair or lift
// landing, or a seat's stand point. While a seat is taken its stand point keeps this clear too,
// so its occupant can always stand up.
export const OFFICE_BODY_SPACING = 0.7;
// First-person eye heights above the visitor's floor, standing and seated.
export const OFFICE_EYE_HEIGHT = 1.68, OFFICE_SEATED_EYE_HEIGHT = 1.2;
// Seat surface height for the seated pose; the graybox chairs are drawn to it (#362's art must match).
const SEAT_HEIGHT = 0.5;
const CHAIR_RADIUS = 0.4, WALL = 0.2, MAX_SEGMENT_STEPS = 150;
const L0 = `${OFFICE_BUILDING}/l0`, L1 = `${OFFICE_BUILDING}/l1`;

const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const box = (id, kind, x, d, w, l, height) => ({ id, kind, x0: x - w / 2, x1: x + w / 2, d0: d - l / 2, d1: d + l / 2, height });
const portal = (levelId, name, kind, position, toLevelId = null, pairName = null) =>
  ({ id: `${levelId}/portal/${name}`, kind, levelId, position, ...(toLevelId ? { toLevelId, pairId: `${toLevelId}/portal/${pairName}` } : {}) });

const legacy = {
  id: OFFICE_LAYOUT_LEGACY, schemaVersion: 1, buildingId: OFFICE_BUILDING,
  spawn: { levelId: L0, position: [...OFFICE_SPAWN] },
  levels: [{ id: L0, index: 0, floorElevation: 0, clearHeight: OFFICE_ROOM.height,
    rooms: [{ id: `${L0}/room/main`, kind: 'primary', x0: -OFFICE_ROOM.width / 2, x1: OFFICE_ROOM.width / 2, d0: 0, d1: OFFICE_ROOM.depth }],
    portals: [portal(L0, 'entrance', 'entrance', [0, 0])] }],
  anchors: [],
  seats: [],
};

// Kit [x, d] anchors and stations from the reviewed contract.
const desks = [
  ['desk-executive', [-3, 4.5], [-3, 6.55], 3], ['desk-a1', [3.65, 3.55], [3.65, 5.6], 2], ['desk-a2', [6.35, 3.55], [6.35, 5.6], 2],
  ['desk-b1', [3.65, 8.55], [3.65, 10.6], 2], ['desk-b2', [6.35, 8.55], [6.35, 10.6], 2],
];
// The desks themselves (R19, Val, 2026-10-15): the supplied kit's measured desk colliders, as
// numbers only (its layout.json, SHA-256 ccd7e275…; no art). Each bench serves two stations, and
// every approach stays clear for the turning body (scripts/office-kit-fit.mjs checks the rules).
const DESK_HEIGHT = 0.76;
const deskFootprints = [
  { id: 'executive-desk', x: [-5, -1], d: [7.2, 8.8] },
  { id: 'bench-a', x: [2.4, 7.6], d: [6.4, 7.6] },
  { id: 'bench-b', x: [2.4, 7.6], d: [11.4, 12.6] },
];
const stair = { x: [10.2, 13.4], d: [5.6, 14], rise: 3.8, risers: 22 };
// Library revision 3 (approved 2026-10-14): furniture bases at the mezzanine floor.
const mezzanine = {
  seats: [{ id: 'reading-chair-a', position: [-8, 18.3], size: [1, 1] }, { id: 'reading-chair-b', position: [-4.5, 18.3], size: [1, 1] }],
  furniture: [{ id: 'reading-side-table', position: [-6.25, 18.3], size: [0.5, 0.5] }, { id: 'bookcase-1', position: [0, 19.55], size: [5.4, 0.6] }, { id: 'bookcase-2', position: [6, 19.55], size: [5.4, 0.6] }],
  standingPoints: [{ id: 'reference-consultation', position: [0, 18.1] }, { id: 'archive-browse', position: [6, 18.1] }],
  retired: ['bookcase-0', 'mezz-table'],
};
// A desk chair faces its desk (+d) and stands up to the desk's approach; a reading chair faces
// the gallery (-d) and stands up onto the edge of its clear band (d 16.45, the contract's gallery-route).
const GALLERY_EDGE = 16.45;
const seats = [
  ...desks.map(([id, approach, seat]) => ({ id: `${id}-chair`, kind: 'desk', levelId: L0, position: seat, facing: 0, height: SEAT_HEIGHT, stand: approach, workstation: id })),
  ...mezzanine.seats.map(({ id, position }) => ({ id, kind: 'reading', levelId: L1, position, facing: Math.PI, height: SEAT_HEIGHT, stand: [position[0], GALLERY_EDGE], workstation: null })),
];
const penthouse = {
  id: OFFICE_LAYOUT_PENTHOUSE, schemaVersion: 1, buildingId: OFFICE_BUILDING,
  spawn: { levelId: L0, position: [0, 1.5] },
  stair, mezzanine,
  levels: [
    { id: L0, index: 0, floorElevation: 0, clearHeight: 7.6,
      bounds: { x0: -23, x1: 15, d0: 0, d1: 20 },
      rooms: [
        { id: `${L0}/room/main-floor`, kind: 'primary', x0: -15, x1: 15, d0: 0, d1: 20, clearUnderMezzanine: 3.5 },
        { id: `${L0}/room/terrace`, kind: 'terrace', x0: -23, x1: -15, d0: 0, d1: 20 },
      ],
      // The terrace wall at x -15 is open through two 4 m portals, d 3-7 and 10-14.
      obstacles: [
        box('terrace-wall-south', 'wall', -15, 1.5, WALL, 3, 7.6), box('terrace-wall-middle', 'wall', -15, 8.5, WALL, 3, 7.6), box('terrace-wall-north', 'wall', -15, 17, WALL, 6, 7.6),
        { id: 'stair', kind: 'stair', x0: stair.x[0], x1: stair.x[1], d0: stair.d[0], d1: stair.d[1], height: stair.rise },
        ...deskFootprints.map(({ id, x, d }) => ({ id, kind: 'desk', x0: x[0], x1: x[1], d0: d[0], d1: d[1], height: DESK_HEIGHT })),
      ],
      chairs: desks.map(([id, , seat]) => ({ id: `${id}-chair`, position: seat })),
      portals: [
        portal(L0, 'entrance', 'entrance', [0, 0]),
        portal(L0, 'stairs-up', 'stairs', [11.8, 4.5], L1, 'stairs-down'),
        portal(L0, 'lift-up', 'lift', [-12, 18], L1, 'lift-down'),
      ] },
    { id: L1, index: 1, floorElevation: 3.8, clearHeight: 3.8,
      bounds: { x0: -15, x1: 15, d0: 14, d1: 20 },
      rooms: [{ id: `${L1}/room/mezzanine`, kind: 'primary', x0: -15, x1: 15, d0: 14, d1: 20 }],
      // The glass guard runs the whole d 14 edge; the stair arrives by transition.
      obstacles: [...mezzanine.seats, ...mezzanine.furniture].map(({ id, position: [x, d], size: [w, l] }) => box(id, 'furniture', x, d, w, l, 1)),
      chairs: [],
      portals: [
        portal(L1, 'stairs-down', 'stairs', [11.8, 15.2], L0, 'stairs-up'),
        portal(L1, 'lift-down', 'lift', [-12, 18], L0, 'lift-up'),
      ] },
  ],
  anchors: [
    { id: 'arrival', kind: 'spawn', levelId: L0, position: [0, 1.5] },
    ...desks.map(([id, position, seat, monitors]) => ({ id, kind: 'approach', levelId: L0, position, seat, monitors })),
    { id: 'lounge', kind: 'view', levelId: L0, position: [-7, 8.8] },
    { id: 'meeting', kind: 'view', levelId: L0, position: [4.5, 16.9] },
    { id: 'terrace', kind: 'view', levelId: L0, position: [-18, 8] },
    { id: 'stairs-bottom', kind: 'route', levelId: L0, position: [11.8, 4.5] },
    { id: 'stairs-top', kind: 'route', levelId: L1, position: [11.8, 15.2] },
    { id: 'library', kind: 'view', levelId: L1, position: [0, 15.6] },
    { id: 'lift-ground', kind: 'lift', levelId: L0, position: [-12, 18] },
    { id: 'lift-upper', kind: 'lift', levelId: L1, position: [-12, 18] },
  ],
  seats,
};

export const OFFICE_LAYOUTS = deepFreeze({ [OFFICE_LAYOUT_LEGACY]: legacy, [OFFICE_LAYOUT_PENTHOUSE]: penthouse });
export const officeLayout = id => Object.hasOwn(OFFICE_LAYOUTS, id) ? OFFICE_LAYOUTS[id] : null;
const levelOf = (layout, levelId) => layout?.levels.find(level => level.id === levelId) ?? null;
export const officeLevelElevation = (layout, levelId) => levelOf(layout, levelId)?.floorElevation ?? null;
const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);

export const officeSeats = layout => layout?.seats ?? [];
export const officeSeat = (layout, id) => officeSeats(layout).find(seat => seat.id === id) ?? null;
// The seat whose stand point is within reach on this floor, nearest first.
export function officeNearbySeat(layout, levelId, position) {
  if (!point(position)) return null;
  let best = null, nearest = OFFICE_SEAT_REACH;
  for (const seat of officeSeats(layout)) {
    const away = Math.hypot(position[0] - seat.stand[0], position[1] - seat.stand[1]);
    if (seat.levelId === levelId && away <= nearest) { best = seat; nearest = away; }
  }
  return best;
}
// How an avatar sits on a visit's claimed seat: the seat height and the avatar heading. Avatar
// headings face +Z; the office's yaw 0 faces +d, which is -Z.
export function officeSeatedPose(layout, office) {
  const seat = office?.seat ? officeSeat(layout, office.seat.id) : null;
  return seat && seat.levelId === office.levelId ? { height: seat.height, yaw: Math.atan2(Math.sin(seat.facing + Math.PI), Math.cos(seat.facing + Math.PI)) } : null;
}
const clearOf = (levelId, [x, d], occupied) => occupied.every(seat => seat.levelId !== levelId
  || Math.hypot(x - seat.position[0], d - seat.position[1]) >= OFFICE_OCCUPIED_CLEARANCE && Math.hypot(x - seat.stand[0], d - seat.stand[1]) >= OFFICE_BODY_SPACING);

// Is the measured turning body free at [x, d] on this level of this layout, beside any occupied seats?
export function officeLevelFree(layout, levelId, position, occupied = []) {
  if (!point(position)) return false;
  if (layout?.id === OFFICE_LAYOUT_LEGACY) return levelId === L0 && officeFree(position);
  const level = levelOf(layout, levelId);
  if (!level) return false;
  const [x, d] = position, r = AVATAR_ENVELOPE.turningRadius, { x0, x1, d0, d1 } = level.bounds;
  if (x < x0 + r || x > x1 - r || d < d0 + r || d > d1 - r) return false;
  if (level.obstacles.some(o => Math.hypot(x - Math.max(o.x0, Math.min(x, o.x1)), d - Math.max(o.d0, Math.min(d, o.d1))) < r)) return false;
  return level.chairs.every(chair => Math.hypot(x - chair.position[0], d - chair.position[1]) >= r + CHAIR_RADIUS) && clearOf(levelId, position, occupied);
}

// Swept movement on one level, sampled every 0.1 m and bounded like the legacy office.
export function officeLevelSegmentFree(layout, levelId, from, to, occupied = []) {
  if (!officeLevelFree(layout, levelId, from, occupied) || !officeLevelFree(layout, levelId, to, occupied)) return false;
  const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.1);
  if (steps > MAX_SEGMENT_STEPS) return false;
  for (let i = 1; i < steps; i++) if (!officeLevelFree(layout, levelId, from.map((n, j) => n + (to[j] - n) * i / steps), occupied)) return false;
  return true;
}

// A level change: only from within reach of a stairs or lift portal on the current level,
// only to that portal's pair, and only onto a free landing. The caller (the server) also
// checks occupancy, movement budget and the visit itself.
export function officeTransition(layout, { levelId, position }, portalId, occupied = []) {
  const level = levelOf(layout, levelId);
  const from = level?.portals.find(item => item.id === portalId && item.kind !== 'entrance');
  if (!from) return { ok: false, error: 'invalid_office_portal' };
  if (!point(position) || Math.hypot(position[0] - from.position[0], position[1] - from.position[1]) > OFFICE_PORTAL_REACH) return { ok: false, error: 'office_portal_out_of_reach' };
  const target = levelOf(layout, from.toLevelId), to = target?.portals.find(item => item.id === from.pairId);
  if (!to || to.pairId !== from.id || to.kind !== from.kind) return { ok: false, error: 'invalid_office_portal' };
  if (!officeLevelFree(layout, target.id, to.position, occupied)) return { ok: false, error: 'office_landing_blocked' };
  return { ok: true, levelId: target.id, position: [...to.position], portalId: to.id, elevation: target.floorElevation };
}

// Client prediction with the server's rule: axis-separated sliding, one level.
export function stepOfficeLevel(layout, levelId, position, dx, dd, occupied = []) {
  let next = [...position];
  for (const delta of [[dx, 0], [0, dd]]) { const p = next.map((v, i) => v + delta[i]); if (officeLevelSegmentFree(layout, levelId, next, p, occupied)) next = p; }
  return next;
}

// The stair or lift a visitor on this floor can take from here, if any.
export function officeNearbyPortal(layout, levelId, position) {
  if (!point(position)) return null;
  return levelOf(layout, levelId)?.portals.find(item => item.kind !== 'entrance'
    && Math.hypot(position[0] - item.position[0], position[1] - item.position[1]) <= OFFICE_PORTAL_REACH) ?? null;
}

// Desk approaches on this floor: the legacy room's two stations, or the penthouse's five desks.
export function officeWorkstations(layout, levelId) {
  if (layout?.id === OFFICE_LAYOUT_LEGACY) return levelId === L0 ? OFFICE_ROOM.stations.map(({ id, approach }) => ({ id, approach })) : [];
  return (layout?.anchors ?? []).filter(item => item.levelId === levelId && item.kind === 'approach').map(({ id, position }) => ({ id, approach: position }));
}
