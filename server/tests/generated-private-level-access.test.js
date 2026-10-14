import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compileRegionPackage } from '../region-package.js';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';

const sample = JSON.parse(readFileSync(new URL('../../preview/public/data/sample-region.json', import.meta.url)));

test('revoking an upstairs guest of a generated private home clears occupancy and voice access', () => {
  const interior = { name: 'Moon House', category: 'home', entrance: 'south', access: 'owner',
    generation: { version: 1, seed: 'moon-private-two', levels: 2 } };
  const region = { ...sample, buildings: sample.buildings.map((building, index) => index === 2
    ? { ...building, interior } : building) };
  const data = compileRegionPackage(region, 'Moon Garden', { worldId: 'moon-private-two' });
  const storeId = data.stores[0].id;
  const [ground, upper] = data.buildingInteriors[0].levels;
  const up = ground.portals.find(portal => portal.toLevelId === upper.id);
  let time = 100000;
  const options = { worldId: 'moon-private-two', now: () => time, isAdmin: id => id === 'jevica' };
  const world = createSharedWorld(data, options);
  assert.equal(world.join({ userId: 'jevica', name: 'Jevica' }).ok, true);
  assert.equal(world.join({ userId: 'guest', name: 'Guest' }).ok, true);
  assert.equal(world.command('guest', { type: 'travel', storeId, mode: 'enter' }).error, 'private_home');
  assert.equal(world.command('jevica', { type: 'homeAccess', action: 'grant', storeId, peerId: 'guest' }).ok, true);
  const entered = world.command('guest', { type: 'travel', storeId, mode: 'enter' });
  assert.equal(entered.ok, true);
  const start = entered.player.position;
  for (let step = 1; step <= 30; step++) {
    time += 250;
    const fraction = step / 30;
    const pose = world.command('guest', { type: 'pose', position: [
      start[0] + (up.position[0] - start[0]) * fraction,
      start[1] + (up.position[1] - start[1]) * fraction,
      ground.floorElevation,
    ], yaw: 0, altitude: 0, levelId: ground.id });
    assert.equal(pose.ok, true, `approach step ${step}: ${pose.error}`);
  }
  assert.equal(world.command('guest', { type: 'interiorLevel', portalId: up.id }).ok, true);
  assert.equal(world.voiceSpaceOf('guest'), `level:${upper.id}`);

  assert.equal(world.command('jevica', { type: 'homeAccess', action: 'revoke', storeId, peerId: 'guest' }).ok, true);
  const guest = world.snapshot().players.find(player => player.id === 'guest');
  const environment = createWalkingEnvironment(data);
  assert.equal(environment.roomAt(guest.position[0], -guest.position[1]), null, 'revoked guest is outside');
  assert.equal(guest.buildingId, null);
  assert.equal(guest.levelId, null);
  assert.equal(world.voiceSpaceOf('guest'), 'outdoor');
  assert.equal(world.command('guest', { type: 'interiorLevel', portalId: up.id }).ok, false);
  assert.equal(world.command('guest', { type: 'travel', storeId, mode: 'enter' }).error, 'private_home');
  const next = [[0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]]
    .map(([dx, dy]) => [guest.position[0] + dx, guest.position[1] + dy])
    .find(([east, north]) => environment.isFree(east, -north) && !environment.roomAt(east, -north));
  assert.ok(next, 'an outdoor step remains clear beside the exit');
  time += 1000;
  assert.equal(world.command('guest', { type: 'pose', position: [...next, environment.groundAt(next[0], -next[1])],
    yaw: 0, altitude: 0 }).ok, true, 'revoked guest can resume outdoor movement');
  const restored = createSharedWorld(data, options);
  assert.equal(restored.restore(world.checkpoint()).ok, true, 'revoked state survives checkpoint restore');
  assert.equal(restored.voiceSpaceOf('guest'), 'outdoor');
});
