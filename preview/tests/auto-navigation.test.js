import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createResidentNavigation } from '../src/navigation.js';
import { createWalkingEnvironment, createWalkingState, stepWalking, steerWalkingToward } from '../src/walking.js';
import { storeRoomsFor } from '../src/store-rooms.js';

test('auto can physically leave every published boutique without crossing a fixture or wall', () => {
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  const environment = createWalkingEnvironment(world), navigation = createResidentNavigation(world);
  for (const room of storeRoomsFor(world)) {
    const state = createWalkingState(environment, room.toWorld(0, 2.4));
    const start = [state.position[0], -state.position[2]], end = world.stores.find(s => s.id === room.storeId).visit;
    const path = navigation.route(start, end);
    assert.ok(path?.length, `${room.name}: no exit route`);
    let previous = start;
    for (const point of path) {
      assert.ok(navigation.canTravel(previous, point), `${room.name}: route crosses obstacle`);
      previous = point;
    }
    for (let frame=0; frame<7200 && path.length; frame++) {
      while (path.length && Math.hypot(state.position[0]-path[0][0],state.position[2]+path[0][1]) < 0.3) path.shift();
      if (!path.length) break;
      stepWalking(state, environment, steerWalkingToward(state,path[0],1/60),1/60);
      assert.ok(environment.isFree(state.position[0],state.position[2]), `${room.name}: walked into fixture`);
    }
    assert.equal(path.length,0,`${room.name}: physical movement failed to reach the exit`);
  }
});

for (const name of ['Zadig & Voltaire', 'de Boulle']) test(`${name}: the sales floor connects the entrance to the rear activity area and back`, () => {
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  const environment = createWalkingEnvironment(world), navigation = createResidentNavigation(world);
  const room = environment.rooms.find(room => room.name === name);
  const entrance = room.toWorld(0, 1.4), rear = room.toWorld(room.center, 6.1);
  const state = createWalkingState(environment, entrance);
  for (const destination of [rear, entrance]) {
    const path = navigation.route([state.position[0], -state.position[2]], destination);
    assert.ok(path?.length, `${name}: no route through the sales floor`);
    for (let frame = 0; frame < 1800 && path.length; frame++) {
      while (path.length && Math.hypot(state.position[0] - path[0][0], state.position[2] + path[0][1]) < 0.12) path.shift();
      if (!path.length) break;
      stepWalking(state, environment, steerWalkingToward(state, path[0], 1 / 60), 1 / 60);
      assert.ok(environment.isFree(state.position[0], state.position[2]), `${name}: crossed a fixture`);
    }
    assert.equal(path.length, 0, `${name}: walking stopped before the activity area`);
  }
  for (const obstacle of room.obstacles) {
    const [east, north] = room.toWorld((obstacle.a0 + obstacle.a1) / 2, (obstacle.d0 + obstacle.d1) / 2);
    assert.equal(environment.isFree(east, -north), false, `${name}: retained fixture must block`);
  }
});

test('narrow shop centre aisles leave body clearance past occupied wall displays', () => {
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  for (const room of storeRoomsFor(world).filter(room => ['Zadig & Voltaire', 'de Boulle'].includes(room.name))) {
    for (let d = 2.8; d <= 6.1; d += 0.1) for (const person of room.people.filter(person => person.role !== 'mannequin')) {
      assert.ok(Math.hypot(person.a - room.center, person.d - d) >= 0.35 + 0.28,
        `${room.name}: ${person.role} occupies the centre aisle at depth ${d}`);
    }
  }
});
