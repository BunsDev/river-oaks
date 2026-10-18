// The Gardens in the real district (#507). A server-selected district revision
// replaces the parking garage osm-way-625330790 with #506's measured campus
// (shared/garden-campus-layout.js). The garage stays the default revision and the
// rollback: unset or unknown RIVER_OAKS_DISTRICT_REVISION keeps it, so merging this
// code changes nothing until an operator selects the campus.
//
// attachGardenCampus derives everything from the contract and refuses a district
// the contract does not accept. The garage's building and collision ring leave
// together. Ground-standing campus volumes (three towers, café, pergola) become
// `campus` buildings for flight clearance and rendering. Their solid ground
// plates, the café, the pool and the contract's pergola posts become collision. The skywalks
// are never ground or ground collision: they stay above a street walker
// (campusFlightVolumes keeps flights clear of them). The F1 halls and the café
// are walk-in rooms on the street (planCampusRooms). Upper floors belong to
// #508's campus levels.
//
// Pure: the browser and the Node service both apply it, so the world fingerprint
// (digest of the world data) differs only by this overlay and the previous
// district remains a verifiable migration input.
import {
  GARDEN_CAMPUS_ID, GARDEN_CAMPUS_LAYOUT as CAMPUS, GARDEN_CAMPUS_VERSIONS, campusLevels, campusToSource, sourceToCampus, validateGardenCampus,
} from '../../shared/garden-campus-layout.js';
import { campusFitout } from '../../shared/garden-campus-fitout.js';

export const DISTRICT_REVISION_GARAGE = 'river-oaks-garage-1';
export const DISTRICT_REVISION_GARDENS = 'river-oaks-gardens-3';
export const DISTRICT_REVISIONS = Object.freeze([DISTRICT_REVISION_GARAGE, DISTRICT_REVISION_GARDENS]);
export const CAMPUS_ROOM_PREFIX = 'campus:';
export const CAMPUS_BUILDING_KIND = 'campus';
// Clear height of a ground hall under the F2 slab (5 m storey, 0.35 m slab).
const HALL_CLEAR = 4.65, CAFE_CLEAR = 4.2;

/** RIVER_OAKS_DISTRICT_REVISION: unset or unknown keeps the garage. */
export function configuredDistrictRevision(value, { onInvalid = () => {} } = {}) {
  if (value === undefined || value === null || value === '') return DISTRICT_REVISION_GARAGE;
  if (DISTRICT_REVISIONS.includes(value)) return value;
  onInvalid(value);return DISTRICT_REVISION_GARAGE;
}
export const isCampusRoom = room => typeof room?.storeId === 'string' && room.storeId.startsWith(CAMPUS_ROOM_PREFIX);
// The revision a district reports to clients: only the campus names one; null is the garage default.
export const districtRevisionOf = world => world?.gardenCampus?.revision ?? null;

const toSource = ([u, v]) => campusToSource([u, v]).slice(0, 2);
const ringOf = ([u0, v0, u1, v1]) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0, v0]].map(toSource);
const sameRing = (a, b) => a?.length === b?.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
const centreOf = ([u0, v0, u1, v1]) => toSource([(u0 + u1) / 2, (v0 + v1) / 2]);
// #506's authoritative ground obstacles (l0: the pergola posts, and any planted pit or
// object the contract adds), except those inside a tower plate, which is solid already.
const plateOf = rect => CAMPUS.towers.some(tower => { const [u0, v0, u1, v1] = tower.tiers[0].rect;return rect[0] >= u0 && rect[1] >= v0 && rect[2] <= u1 && rect[3] <= v1; });
const groundObstacles = () => campusLevels(CAMPUS)[0].obstacles.filter(item => !plateOf(item.rect)).map(item => ({ id: item.id, rect: [...item.rect] }));

/** The ground-standing campus volumes, in source coordinates, as district buildings. */
function campusBuildings() {
  const base = CAMPUS.frame.baseAltitude, rect = r => ({ ring: ringOf(r), center: [...centreOf(r), base], size: [r[2] - r[0], r[3] - r[1]] });
  return [
    ...CAMPUS.towers.map(tower => {
      const plate = tower.tiers[0].rect, shape = rect(plate);
      return { id: `${GARDEN_CAMPUS_ID}/${tower.id}`, center: shape.center, ring: shape.ring, size: [...shape.size, tower.silhouette.capZ], yaw_deg: 0,
        kind: CAMPUS_BUILDING_KIND, campus: { part: tower.id, name: tower.name, kind: 'tower' }, height_source: `authored, ${GARDEN_CAMPUS_ID} layout ${GARDEN_CAMPUS_VERSIONS.layout} (#506)` };
    }),
    ...CAMPUS.groundBuildings.filter(item => item.height > 0).map(item => {
      const shape = rect(item.rect);
      return { id: `${GARDEN_CAMPUS_ID}/${item.id}`, center: shape.center, ring: shape.ring, size: [...shape.size, item.height], yaw_deg: 0,
        kind: CAMPUS_BUILDING_KIND, campus: { part: item.id, name: item.name, kind: item.kind }, height_source: `authored, ${GARDEN_CAMPUS_ID} layout ${GARDEN_CAMPUS_VERSIONS.layout} (#506)` };
    }),
  ];
}

/** Collision on the street: solid ground plates, the café, the pool and the contract's l0 obstacles. */
export function campusCollisionRects() {
  return [
    ...CAMPUS.towers.map(tower => ({ id: `${tower.id}/plate`, rect: [...tower.tiers[0].rect] })),
    ...CAMPUS.groundBuildings.filter(item => !item.walkableBelow).map(item => ({ id: `${item.id}/plate`, rect: [...item.rect] })),
    ...groundObstacles(),
  ];
}

/** Volumes a flight keeps clear of: towers and ground buildings (from world.buildings) and both skywalks. */
export function campusFlightVolumes(world) {
  if (!world?.gardenCampus) return [];
  const base = CAMPUS.frame.baseAltitude;
  return CAMPUS.bridges.map(bridge => ({ id: `${GARDEN_CAMPUS_ID}/${bridge.id}`, ring: ringOf(bridge.rect), bottom: base + bridge.underside, top: base + bridge.deckZ + bridge.guard }));
}

/** Replace the garage with the campus. Throws unless the contract accepts this district. */
export function attachGardenCampus(world) {
  if (!world || typeof world !== 'object' || world.gardenCampus) throw new Error('Garden campus cannot attach to this world');
  const check = validateGardenCampus(CAMPUS, { district: world });
  if (!check.ok) throw new Error(`Garden campus contract refused this district: ${check.findings.map(item => `${item.rule} ${item.id}`).join('; ')}`);
  const garage = world.buildings.find(item => item.id === CAMPUS.source.buildingId);
  const collision = (world.collisionPolygons ?? []).findIndex(ring => sameRing(ring, garage.ring));
  if (collision < 0) throw new Error('Garage collision ring is not in this district');
  const added = campusBuildings(), rings = campusCollisionRects().map(item => ringOf(item.rect));
  const buildings = world.buildings.flatMap(item => item === garage ? added : [item]);
  const collisionPolygons = world.collisionPolygons.flatMap((ring, index) => index === collision ? rings : [ring]);
  return {
    ...world, buildings, collisionPolygons,
    gardenCampus: {
      id: GARDEN_CAMPUS_ID, revision: DISTRICT_REVISION_GARDENS, versions: { ...GARDEN_CAMPUS_VERSIONS },
      // Exactly what was replaced and where, so detachGardenCampus restores the garage district byte for byte.
      replaced: { building: structuredClone(garage), buildingIndex: world.buildings.indexOf(garage), buildings: added.length,
        collisionRing: structuredClone(world.collisionPolygons[collision]), collisionIndex: collision, collisionRings: rings.length },
    },
  };
}

/** The garage district a campus world was built from (migration and rollback input). */
export function detachGardenCampus(world) {
  const replaced = world?.gardenCampus?.replaced;
  if (!replaced) throw new Error('No garden campus to detach');
  const { gardenCampus: _campus, ...rest } = world;
  const buildings = [...world.buildings], collisionPolygons = [...world.collisionPolygons];
  buildings.splice(replaced.buildingIndex, replaced.buildings, structuredClone(replaced.building));
  collisionPolygons.splice(replaced.collisionIndex, replaced.collisionRings, structuredClone(replaced.collisionRing));
  return { ...rest, buildings, collisionPolygons };
}

// ---- Ground ------------------------------------------------------------------
// The campus ground is one built platform at the garage base. Every entry's
// threshold is under 0.1 m (#506 validates it), well inside a walking step, so
// the seams are level paving rather than ramps. Client and server read the same
// height here, ahead of terrain or registered meshes.
const parcel = CAMPUS.parcel.polygon;
function inParcel(u, v) {
  let inside = false;
  for (let i = 0, j = parcel.length - 2; i < parcel.length - 1; j = i++) {
    const [ui, vi] = parcel[i], [uj, vj] = parcel[j];
    if ((vi > v) !== (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}
/** Campus ground height at a source position, or null outside the parcel or without the campus. */
export function campusGroundAt(world, east, north) {
  if (!world?.gardenCampus) return null;
  const [u, v] = sourceToCampus([east, north]);
  return u > -0.01 && u < 37.77 && v > -0.01 && v < 181.23 && inParcel(u, v) ? CAMPUS.frame.baseAltitude : null;
}
export const campusParcelRing = () => parcel.map(toSource);
// Render-only terrain mask over the platform (room-ground-clip.js frame): the parcel's
// inscribed rectangle, east edge as facade, a north along it and d west into it. The
// rising terrain under the old garage must not show through the campus platform.
export function campusGroundCutout(world) {
  if (!world?.gardenCampus) return null;
  const width = Math.min(...parcel.filter(([u]) => u > 30).map(([u]) => u)), length = Math.min(...parcel.filter(([, v]) => v > 170).map(([, v]) => v));
  const facade = toSource([width, 0]), outward = [...CAMPUS.frame.east], right = [...CAMPUS.frame.north];
  const toWorld = (a, d) => toSource([width - d, a]);
  const toLocal = (e, n) => { const [u, v] = sourceToCampus([e, n]);return [v, width - u]; };
  return { facade, outward, right, aMin: 0, aMax: length, depth: width, floor: CAMPUS.frame.baseAltitude, toWorld, toLocal,
    footprint: [[0, 0], [length, 0], [length, width], [0, width]].map(([a, d]) => toWorld(a, d)) };
}

// ---- Walk-in ground rooms ----------------------------------------------------
// The three F1 halls and the café, in the store-room shape the street walking
// environment reads (store-rooms.js roomAt): a mapped door on the east facade,
// `a` along it (north), `d` inward (west). The core's lift and stair shafts are
// obstacles; the core lobby in front of them stays walkable. No staff.
function groundRoom(world, index, { id, name, use, rect, door, clear, obstacles, part }) {
  const [u0, v0, u1, v1] = rect, [du, dv] = door, base = CAMPUS.frame.baseAltitude;
  const facade = toSource([du, dv]), east = CAMPUS.frame.east, north = CAMPUS.frame.north;
  const outward = [...east], inward = [-east[0], -east[1]], right = [...north];
  const toWorld = (a, d) => toSource([du - d, dv + a]);
  const toLocal = (e, n) => { const [u, v] = sourceToCampus([e, n]);return [v - dv, du - u]; };
  const aMin = v0 - dv, aMax = v1 - dv, depth = du - u0;
  if (Math.abs(du - u1) > 1e-9) throw new Error(`${id} door is not on its east facade`);
  const room = {
    id: `${CAMPUS_ROOM_PREFIX}${id}`, storeId: `${CAMPUS_ROOM_PREFIX}${id}`, buildingId: `${GARDEN_CAMPUS_ID}/${part}`, name, category: 'campus', theme: 'campus',
    campus: { surfaceId: id, part, use }, index, facade, outward, inward, right, aMin, aMax, center: (aMin + aMax) / 2, width: aMax - aMin, depth,
    height: clear, bay: null, floor: base, toWorld, toLocal,
    contains(e, n, shrink = 0) { const [a, d] = toLocal(e, n);return a > aMin + shrink && a < aMax - shrink && d > shrink && d < depth - shrink; },
    footprint: [[aMin, 0], [aMax, 0], [aMax, depth], [aMin, depth]].map(([a, d]) => toWorld(a, d)),
    obstacles: obstacles.map(item => ({ id: item.id, kind: item.kind, a0: item.rect[1] - dv, a1: item.rect[3] - dv, d0: du - item.rect[2], d1: du - item.rect[0] })),
    fixtures: [], people: [], lights: [],
  };
  const bounds = [...room.footprint, toWorld(-0.85, -1.4), toWorld(0.85, -1.4)];
  room.lookupBounds = [Math.min(...bounds.map(p => p[0])), Math.min(...bounds.map(p => p[1])), Math.max(...bounds.map(p => p[0])), Math.max(...bounds.map(p => p[1]))];
  return room;
}
const roomCache = new WeakMap();
/** Street walk-in rooms of the campus, after every store and venue; none without the campus. */
export function planCampusRooms(world, firstIndex = 0) {
  if (!world?.gardenCampus) return [];
  if (!roomCache.has(world)) {
    // Each room's furniture (#510 fit-out) is collision; its chairs are seat sites (campusSeatSites).
    const furniture = id => campusFitout().ground.find(room => room.roomId === id)?.obstacles ?? [];
    const halls = CAMPUS.towers.map(tower => {
      const floor = tower.levels[0], hall = floor.hall;
      return { id: hall.id, name: `${tower.name} · ${hall.use}`, use: hall.use, rect: hall.rect, door: hall.door.position, clear: HALL_CLEAR, part: tower.id,
        obstacles: [{ ...tower.core.lift, kind: 'lift' }, { ...tower.core.stair, kind: 'stair' }, ...furniture(hall.id)] };
    });
    const cafe = CAMPUS.groundBuildings.find(item => item.id === 'C');
    const rooms = [...halls, { id: 'C-hall', name: cafe.name, use: 'Public social and work café', rect: cafe.rect, door: cafe.door, clear: CAFE_CLEAR, part: 'C', obstacles: furniture('C-hall') }]
      .map((spec, offset) => groundRoom(world, firstIndex + offset, spec));
    roomCache.set(world, rooms);
  }
  return roomCache.get(world);
}

// The halls' and café's chairs as street seat sites (world-interactions benchSeats), in the
// bench-place shape: `bench:campus-<seat>` slot 0. Workstation seats open the sitter's own
// private desk (#510); residents may rest on any of them, as on any bench.
export const CAMPUS_SEAT_PREFIX = 'bench:campus-';
const seatBuildId = id => `${CAMPUS_SEAT_PREFIX}${id.replaceAll('/', '.')}`;
export function campusSeatSites(world) {
  if (!world?.gardenCampus) return [];
  const rooms = new Map(planCampusRooms(world).map(room => [room.campus.surfaceId, room]));
  return campusFitout().ground.flatMap(entry => entry.seats.map(seat => {
    const room = rooms.get(entry.roomId), [x, north] = toSource(seat.position), facing = [seat.facing[0] * CAMPUS.frame.east[0] + seat.facing[1] * CAMPUS.frame.north[0],
      seat.facing[0] * CAMPUS.frame.east[1] + seat.facing[1] * CAMPUS.frame.north[1]], buildId = seatBuildId(seat.id);
    return { id: `${buildId}:0`, buildId, slot: 0, kind: seat.kind, storeId: room.storeId, title: seat.title, x, north, heading: Math.atan2(facing[0], -facing[1]),
      height: seat.height, approach: toSource(seat.approach), workstation: seat.workstation ? seat.id : null };
  }));
}
export const isCampusSeat = buildId => typeof buildId === 'string' && buildId.startsWith(CAMPUS_SEAT_PREFIX);

// The halls and café as storefront sites, in the shape world.stores and venue door sites
// have, so the directory lists them and travel enters or leaves them like any door.
export function campusDoorSites(world) {
  return planCampusRooms(world).map(room => ({ id: room.storeId, name: room.name, category: room.category, venue: true, building_id: room.buildingId,
    facade: [...room.facade, room.floor], outward: room.outward }));
}
