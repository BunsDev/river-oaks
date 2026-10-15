// The code-only axe-and-darts venue: where it sits, what it may not touch, and that it
// joins the shared rooms without becoming a store or a resident's workplace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { facadeEdges, referencePlan } from '../src/reference-facades.js';
import { planStoreRooms, storeRoomsFor } from '../src/store-rooms.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { officeLobbyFor } from '../src/office-contract.js';
import { VENUES, isVenueRoom, planVenueRooms, venueEdge } from '../src/venue-rooms.js';
import { AXE_LANES, AXE_ROOM_INTERIOR, atAxeLane } from '../src/axe-room-plan.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const [venue] = VENUES, [room] = planVenueRooms(world);
const building = world.buildings.find(b => b.id === venue.buildingId);
const inside = ([x, y], ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

test('the venue uses the renderer\'s own numbering for its facade edge', () => {
  const rendered = facadeEdges(building).find(edge => edge.index === venue.edge), mine = venueEdge(building, venue.edge);
  assert.deepEqual(mine.o, rendered.o);
  assert.deepEqual(mine.u, rendered.u);
  assert.equal(mine.length, rendered.length);
});

test('the venue sits inside its block, off every tenant room, door, the office lobby and photographed frontage', () => {
  assert.equal(room.storeId, 'venue:axe-and-darts');
  for (let a = room.aMin; a <= room.aMax; a += .5) for (let d = .2; d <= room.depth; d += .5) assert.ok(inside(room.toWorld(a, d), building.ring), `outside the block at ${a},${d}`);
  const tenants = planStoreRooms(world), cell = point => tenants.find(other => other.contains(...point));
  for (let a = room.aMin; a <= room.aMax; a += .25) for (let d = 0; d <= room.depth; d += .25) assert.equal(cell(room.toWorld(a, d))?.name, undefined, `overlaps a tenant at ${a},${d}`);
  for (const store of world.stores) assert.ok(Math.hypot(store.facade[0] - room.facade[0], store.facade[1] - room.facade[1]) > room.width / 2 + 2, `too close to ${store.name}'s door`);
  const lobby = officeLobbyFor(world);
  assert.ok(Math.hypot(lobby.facade[0] - room.facade[0], lobby.facade[1] - room.facade[1]) > room.width / 2 + lobby.width / 2 + 1, 'clear of the office lobby');
  const edge = facadeEdges(building).find(item => item.index === venue.edge);
  for (const front of referencePlan(world).frontages.filter(f => f.building.id === building.id)) {
    assert.notEqual(front.side?.index, edge.index, 'not a photographed side');
    if (front.edge.index === edge.index) assert.ok(front.hi < venue.along - venue.width / 2 || front.lo > venue.along + venue.width / 2, 'not across photographed frontage');
  }
});

test('the venue opens onto walkable street and joins the shared rooms as itself', () => {
  const environment = createWalkingEnvironment(world), [x, n] = room.toWorld(0, -1);
  assert.equal(environment.isFree(x, -n), true, 'the pavement outside the door is walkable');
  const shared = storeRoomsFor(world).filter(isVenueRoom);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].interior, AXE_ROOM_INTERIOR);
  assert.deepEqual(shared[0].people, [], 'no staff: no new residents');
  assert.equal(planStoreRooms(world).some(isVenueRoom), false, 'tenant planning is unchanged');
  assert.equal(world.stores.some(store => store.id === room.storeId), false, 'not a store in the world data');
  // Into the room through its door, and into each lane's throwing box.
  for (const [a, d] of [[0, 1], [0, 3], ...AXE_LANES.map(lane => [lane.a, lane.box.d[0] + .2])]) {
    const [px, pn] = shared[0].toWorld(a, d);
    assert.equal(environment.roomAt(px, -pn)?.storeId, room.storeId, `${a},${d} is in the venue`);
    assert.equal(environment.isFree(px, -pn), true, `${a},${d} is walkable`);
  }
  assert.equal(atAxeLane([AXE_LANES[0].a, AXE_LANES[0].box.d[0] + .2]), AXE_LANES[0].id);
});

test('outside River Oaks there is no venue', () => {
  assert.deepEqual(planVenueRooms({ stores: [], buildings: [] }), []);
  assert.deepEqual(planVenueRooms({ ...world, buildings: world.buildings.filter(b => b.id !== venue.buildingId) }), []);
});
