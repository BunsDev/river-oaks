import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planStoreRooms, storeRoomsFor, roomAt, roomBlocked, rectanglesOverlap, DOOR_HALF_WIDTH } from '../src/store-rooms.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const inside = (point, ring) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
};

test('every destination receives a walk-in room that stays inside its mapped footprint and never overlaps another', () => {
  const rooms = planStoreRooms(world);
  assert.equal(rooms.length, world.stores.length);
  for (const room of rooms) {
    const building = world.buildings.find(item => item.id === world.stores.find(store => store.id === room.storeId).building_id);
    for (const [a, d] of [[room.aMin, 0.5], [room.aMax, 0.5], [room.aMin, room.depth], [room.aMax, room.depth]]) {
      assert.ok(inside(room.toWorld(a, d), building.ring), `${room.name} corner leaves its building`);
    }
    assert.ok(room.width >= 3 && room.depth >= 4.5, `${room.name} is too small`);
    assert.ok(room.people.some(person => person.role === 'staff'), `${room.name} has no staff`);
    assert.ok(room.lights.length >= 4 && room.fixtures.length >= 3);
    for (const other of rooms) if (other !== room) assert.ok(!rectanglesOverlap(room.footprint, other.footprint, 0.001), `${room.name} overlaps ${other.name}`);
    for (const person of room.people) {
      assert.ok(person.a > room.aMin && person.a < room.aMax && person.d > 0 && person.d < room.depth, `${room.name} places ${person.role} outside the room`);
    }
  }
  assert.equal(storeRoomsFor(world), storeRoomsFor(world));
});

test('the walking model enters through the doorway, is stopped by the glass, and keeps the floor level with the pavement', () => {
  const environment = createWalkingEnvironment(world);
  const room = environment.rooms.find(item => item.name === 'Cartier');
  const at = (a, d) => { const [east, north] = room.toWorld(a, d); return [east, -north]; };
  assert.ok(environment.isFree(...at(0, -1)), 'threshold outside the door is free');
  assert.ok(environment.isFree(...at(0, 0.5)), 'just inside the door is free');
  assert.ok(environment.isFree(...at(0, 2.2)), 'the sales floor is free');
  assert.equal(environment.isFree(...at(room.aMax - 1.5, 0.2)), false, 'glass beside the door blocks');
  assert.equal(environment.isFree(...at(0, room.depth + 0.5)), false, 'the back wall blocks');
  assert.equal(environment.isFree(...at(room.aMax + 0.5, 3)), false, 'the party wall blocks');
  assert.equal(roomAt(environment.rooms, ...room.toWorld(DOOR_HALF_WIDTH + 0.5, -0.2)), null);
  const outside = environment.groundAt(...at(0, -1)), insideFloor = environment.groundAt(...at(0, 2));
  assert.ok(Math.abs(outside - insideFloor) < 0.3, `floor step ${outside} vs ${insideFloor}`);
  const start = at(0, -2.5), yaw = Math.atan2(-(at(0, 2)[0] - start[0]), -(at(0, 2)[1] - start[1]));
  const state = createWalkingState(environment, [start[0], -start[1]], yaw);
  for (let i = 0; i < 240; i++) stepWalking(state, environment, { forward: 1 }, 1 / 60);
  const [, depth] = room.toLocal(state.position[0], -state.position[2]);
  assert.ok(depth > 1.5, `visitor walked in to depth ${depth}`);
  assert.ok(room.obstacles.length > 0);
  const blocked = room.obstacles[0];
  assert.equal(environment.isFree(...at((blocked.a0 + blocked.a1) / 2, (blocked.d0 + blocked.d1) / 2)), false, 'fixtures block walking');
});

test('worlds without stores plan no rooms and keep the original collision model', () => {
  const plain = { bounds_m: [-50, -50, 50, 50], buildings: [{ center: [0, 0, 0], size: [10, 10, 8], yaw_deg: 0 }] };
  assert.deepEqual(planStoreRooms(plain), []);
  const environment = createWalkingEnvironment(plain);
  assert.equal(environment.isFree(0, 0), false);
  assert.equal(environment.roomAt(0, 0), null);
});

test('the oriented overlap test catches crossings that corner checks miss', () => {
  const square = [[0, 0], [4, 0], [4, 4], [0, 4]];
  assert.equal(rectanglesOverlap(square, [[5, 0], [9, 0], [9, 4], [5, 4]]), false);
  assert.equal(rectanglesOverlap(square, [[4, 0], [8, 0], [8, 4], [4, 4]]), false, 'sharing an edge is not an overlap');
  assert.equal(rectanglesOverlap(square, [[-1, 1.5], [5, 1.5], [5, 2.5], [-1, 2.5]]), true, 'a bar crossing the square has no corner inside it');
  assert.equal(rectanglesOverlap(square, [[2, -2], [6, 2], [2, 6], [-2, 2]]), true, 'rotated overlap');
});


test('standing people have body clearance from fixtures, walls and other people',()=>{
  for(const room of planStoreRooms(world))for(const person of room.people){
    if(person.role==='mannequin'||person.pose==='seated')continue;
    const point=room.toWorld(person.a,person.d);
    assert.ok(room.contains(...point,0.28),`${room.name}: ${person.role} intersects a wall`);
    assert.equal(roomBlocked(room,...point,0.24),false,`${room.name}: ${person.role} intersects a fixture`);
    for(const other of room.people)if(other!==person)assert.ok(Math.hypot(other.a-person.a,other.d-person.d)>=0.55,`${room.name}: people overlap`);
    for(const bar of room.fixtures.filter(f=>f.kind==='bar')){
      const centre=bar.a-bar.side*0.5;
      const across=Math.abs(person.a-centre),along=person.d;
      assert.ok(across>=0.36+0.28||along<=bar.d0-0.02-0.28||along>=bar.d1+0.02+0.28,`${room.name}: person intersects the rendered bar counter`);
    }
  }
});


test('the rendered bar counter blocks walking as well as the back shelving',()=>{
  for(const room of planStoreRooms(world))for(const bar of room.fixtures.filter(f=>f.kind==='bar')){
    assert.equal(roomBlocked(room,...room.toWorld(bar.a-bar.side*0.75,(bar.d0+bar.d1)/2),0),true,`${room.name}: counter front is traversable`);
  }
});
