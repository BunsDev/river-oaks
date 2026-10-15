// Code-only walk-in venues: fictional rooms that are neither mapped tenants nor in
// district.json, so the server's world fingerprint (digest of the world data) and every
// durable checkpoint stay as they are. Each takes a free, unphotographed street facade
// of a River Oaks block, clear of every tenant room, door and the office lobby
// (preview/tests/venue-rooms.test.js), and is planned in the same shape as a store room
// with a synthetic `venue:` store id, so same-room checks never treat it as outdoors.
// A venue has no staff: a room's people become shared residents, and a new resident
// changes the resident count every checkpoint is restored against.
import { terrainHeight } from './geometry.js';
import { AXE_ROOM, configureAxeRoom } from './axe-room-plan.js';

export const VENUE_PREFIX = 'venue:';
export const isVenueRoom = room => typeof room?.storeId === 'string' && room.storeId.startsWith(VENUE_PREFIX);
// The Hermès block's east facade (ring edge 4) is the district's only long street face
// that no tenant, door, lobby or photographed frontage uses.
export const VENUES = Object.freeze([
  Object.freeze({ ...AXE_ROOM, storeId: `${VENUE_PREFIX}${AXE_ROOM.id}`, buildingId: 'osm-way-625330792', edge: 4, along: 33.5, category: 'game_room', theme: 'game_room' }),
]);
const CONFIGURE = { [AXE_ROOM.id]: configureAxeRoom };

// Ring edges with the numbering and outward normals of reference-facades.js facadeEdges
// (which imports Three.js, so the server cannot load it here).
export function venueEdge(building, index) {
  const ring = building?.ring ?? [];
  const winding = Math.sign(ring.slice(1).reduce((sum, b, i) => sum + ring[i][0] * b[1] - b[0] * ring[i][1], 0));
  const a = ring[index - 1], b = ring[index];
  if (!a || !b) return null;
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  return length < 1 ? null : { a, b, length, u: [dx / length, dy / length], o: [winding * dy / length, -winding * dx / length] };
}

// The venues as storefront sites, in the shape the district renderer, the walking
// controls and the destination list read from world.stores: facade [east, north, base].
export function venueDoorSites(world) {
  return planVenueRooms(world).map(room => ({ id: room.storeId, name: room.name, category: room.category, venue: true, building_id: room.buildingId,
    facade: [...room.facade, world.buildings.find(item => item.id === room.buildingId).center[2]], outward: room.outward }));
}

// Venue rooms for this world, numbered after its stores; none outside River Oaks.
export function planVenueRooms(world) {
  const rooms = [];
  VENUES.forEach((venue, offset) => {
    const building = world?.buildings?.find(item => item.id === venue.buildingId), edge = building && venueEdge(building, venue.edge);
    if (!edge || edge.length < venue.along + venue.width / 2) return;
    const facade = [edge.a[0] + edge.u[0] * venue.along, edge.a[1] + edge.u[1] * venue.along], outward = edge.o;
    const inward = [-outward[0], -outward[1]], right = [-outward[1], outward[0]];
    const toWorld = (a, d) => [facade[0] + right[0] * a + inward[0] * d, facade[1] + right[1] * a + inward[1] * d];
    const toLocal = (east, north) => [(east - facade[0]) * right[0] + (north - facade[1]) * right[1], (east - facade[0]) * inward[0] + (north - facade[1]) * inward[1]];
    const aMin = -venue.width / 2, aMax = venue.width / 2, depth = venue.depth;
    const room = {
      id: venue.storeId, storeId: venue.storeId, venueId: venue.id, buildingId: building.id, name: venue.name, category: venue.category, theme: venue.theme,
      index: (world.stores?.length ?? 0) + offset, facade, outward, inward, right, aMin, aMax, center: 0, width: venue.width, depth, height: venue.height, bay: null,
      floor: terrainHeight(world.terrain, facade[0], facade[1]) + (world.walkSurfaceOffset ?? 0.2), toWorld, toLocal,
      contains(east, north, shrink = 0) { const [a, d] = toLocal(east, north); return a > aMin + shrink && a < aMax - shrink && d > shrink && d < depth - shrink; },
      footprint: [[aMin, 0], [aMax, 0], [aMax, depth], [aMin, depth]].map(([a, d]) => toWorld(a, d)),
      fixtures: [], obstacles: [], people: [], lights: [],
    };
    const bounds = [...room.footprint, toWorld(-0.85, -1.4), toWorld(0.85, -1.4)];
    room.lookupBounds = [Math.min(...bounds.map(p => p[0])), Math.min(...bounds.map(p => p[1])), Math.max(...bounds.map(p => p[0])), Math.max(...bounds.map(p => p[1]))];
    rooms.push(CONFIGURE[venue.id](room));
  });
  return rooms;
}
