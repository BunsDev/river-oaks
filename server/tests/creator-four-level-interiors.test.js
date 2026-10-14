import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compileRegionPackage, editableRegionFromWorld } from '../region-package.js';
import { createSharedWorld } from '../world.js';

const sample = JSON.parse(readFileSync(new URL('../../preview/public/data/sample-region.json', import.meta.url)));

test('a published four-level building traverses every paired landing and restores upper occupancy', () => {
  const interior = { name: 'Moon Gallery', category: 'art', entrance: 'south',
    generation: { version: 1, seed: 'moon-gallery-four', levels: 4 } };
  const region = { ...sample, buildings: sample.buildings.map((building, index) => index ? building
    : { ...building, size: [...building.size.slice(0, 2), 20], interior }) };
  const data = compileRegionPackage(region, 'Moon Garden', { worldId: 'moon-garden-four' });
  const levels = data.buildingInteriors[0].levels;
  assert.deepEqual(levels.map(level => level.id), Array.from({ length: 4 }, (_, index) => `moon-pavilion/l${index}`));
  assert.deepEqual(editableRegionFromWorld(data).buildings[0].interior, interior);
  assert.equal(new Set(levels.flatMap(level => [level.id, ...level.layers.fixtures.map(item => item.id)])).size, 8);

  let time = 100000;
  const options = { now: () => time };
  const world = createSharedWorld(data, options);
  const userId = 'four-level-visitor';
  assert.equal(world.join({ userId, name: 'Visitor' }).ok, true);
  const remoteUp = levels[2].portals.find(portal => portal.toLevelId === levels[3].id);
  assert.equal(world.command(userId, { type: 'interiorLevel', portalId: remoteUp.id }).ok, false,
    'a guessed upper-floor portal cannot be used from the street');
  const entered = world.command(userId, { type: 'travel', storeId: data.stores[0].id, mode: 'enter' });
  assert.equal(entered.ok, true);
  assert.equal(entered.player.levelId, levels[0].id);
  const start = [...world.players.get(userId).position];
  const firstUp = levels[0].portals.find(portal => portal.toLevelId === levels[1].id);
  for (let step = 1; step <= 30; step++) {
    time += 250;
    const fraction = step / 30;
    const pose = world.command(userId, { type: 'pose', position: [
      start[0] + (firstUp.position[0] - start[0]) * fraction,
      start[1] + (firstUp.position[1] - start[1]) * fraction,
      levels[0].floorElevation,
    ], yaw: 0, altitude: 0, levelId: levels[0].id });
    assert.equal(pose.ok, true, `ground route step ${step}: ${pose.error}`);
  }
  for (let index = 0; index < 3; index++) {
    time += 1000;
    const portal = levels[index].portals.find(item => item.toLevelId === levels[index + 1].id);
    const changed = world.command(userId, { type: 'interiorLevel', portalId: portal.id });
    assert.equal(changed.ok, true, `ascent from level ${index}: ${changed.error}`);
    assert.equal(changed.player.levelId, levels[index + 1].id);
    assert.equal(changed.player.position[2], levels[index + 1].floorElevation);
    assert.equal(changed.player.altitude, 0);
    assert.equal(world.command(userId, { type: 'pose', position: changed.player.position,
      yaw: 0, altitude: 0, levelId: levels[0].id }).ok, false,
    'a client cannot relabel an upper-floor pose as ground');
    assert.equal(world.command(userId, { type: 'interiorLevel', portalId: portal.id }).ok, false,
      'a source portal cannot be reused from its destination floor');
  }
  const checkpoint = world.checkpoint();
  const restored = createSharedWorld(data, options);
  assert.equal(restored.restore(checkpoint).ok, true);
  assert.equal(restored.snapshot().players[0].levelId, levels[3].id);
  for (let index = 3; index > 0; index--) {
    time += 1000;
    const portal = levels[index].portals.find(item => item.toLevelId === levels[index - 1].id);
    const changed = restored.command(userId, { type: 'interiorLevel', portalId: portal.id });
    assert.equal(changed.ok, true, `descent from level ${index}: ${changed.error}`);
    assert.equal(changed.player.levelId, levels[index - 1].id);
  }
  assert.equal(restored.players.get(userId).levelId, levels[0].id);
});
