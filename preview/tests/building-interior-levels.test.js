import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createWalkingEnvironment } from '../src/walking.js';
import { storeRoomsFor } from '../src/store-rooms.js';

const data = name => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url)));

test('upper gallery collision selects its approved level without opening the upper street', () => {
  const plan = data('building-interiors/river-oaks-gallery-v2.json');
  const world = { ...data('district.json'), buildingInteriors: [plan] };
  const [ground, upper] = plan.levels;
  const center = polygon => polygon.reduce(([east, north], point) =>
    [east + point[0] / polygon.length, north + point[1] / polygon.length], [0, 0]);
  const [east, north] = center(upper.rooms[0].footprint);
  const street = createWalkingEnvironment(world);
  const upstairs = createWalkingEnvironment(world, [], upper.id);
  assert.equal(storeRoomsFor(world).find(room => room.planId)?.planId, ground.id);
  assert.equal(street.roomAt(east, -north)?.planId, ground.id);
  assert.equal(upstairs.roomAt(east, -north)?.planId, upper.id);
  assert.equal(upstairs.groundAt(east, -north), upper.floorElevation);
  assert.equal(upstairs.isFree(east, -north), true);
  const [fixtureEast, fixtureNorth] = center(upper.layers.fixtures[0].footprint);
  assert.equal(upstairs.isFree(fixtureEast, -fixtureNorth), false);
  const store = world.stores.find(item => item.id === 'osm-node-8172494977');
  const outside = [store.facade[0] + store.outward[0] * 2, store.facade[1] + store.outward[1] * 2];
  assert.equal(street.isFree(outside[0], -outside[1]), true);
  assert.equal(upstairs.isFree(outside[0], -outside[1]), false);
});
