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
