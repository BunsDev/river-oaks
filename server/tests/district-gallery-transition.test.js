import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { attachDistrictGalleryPlan } from '../../preview/src/district-interior-contract.js';
import { createSharedWorld } from '../world.js';

const data = name => JSON.parse(readFileSync(new URL(`../../preview/public/data/${name}`, import.meta.url)));

test('only a reached paired stair portal can change the authoritative gallery level', () => {
  const worldData = attachDistrictGalleryPlan(data('district.json'), data('building-interiors/river-oaks-gallery-v2.json'));
  const [ground, upper] = worldData.buildingInteriors[0].levels;
  const up = ground.portals.find(portal => portal.toLevelId === upper.id);
  const down = upper.portals.find(portal => portal.toLevelId === ground.id);
  let time = 100000;
  const options = { now: () => time };
  const world = createSharedWorld(worldData, options);
  assert.equal(world.join({ userId: 'gallery-stairs', name: 'Gallery Visitor' }).ok, true);
  const player = world.players.get('gallery-stairs');
  assert.equal(world.command(player.id, { type: 'interiorLevel', portalId: up.id }).ok, false, 'street distance cannot enter upstairs');
  const entered = world.command(player.id, { type: 'travel', storeId: 'osm-node-8172494977', mode: 'enter' });
  assert.equal(entered.ok, true);
  assert.equal(entered.player.levelId, ground.id, 'entry assigns explicit level-0 occupancy');
  const entry = [...player.position];
  for (let step = 1; step <= 30; step++) {
    time += 250;
    const fraction = step / 30;
    const result = world.command(player.id, { type: 'pose',
      position: [entry[0] + (up.position[0] - entry[0]) * fraction,
        entry[1] + (up.position[1] - entry[1]) * fraction, ground.floorElevation],
      yaw: 0, altitude: 0, levelId: ground.id });
    assert.equal(result.ok, true, `step ${step} of the ground-floor route reaches the stair`);
  }
  assert.equal(world.command(player.id, { type: 'interiorLevel', portalId: down.id }).ok, false, 'destination portal is not a source portal');
  const ascend = world.command(player.id, { type: 'interiorLevel', portalId: up.id });
  assert.equal(ascend.ok, true);
  assert.equal(ascend.player.buildingId, worldData.buildingInteriors[0].buildingId);
  assert.equal(ascend.player.levelId, upper.id);
  assert.deepEqual(ascend.player.position, [...down.position, upper.floorElevation]);
  assert.equal(ascend.player.altitude, 0, 'upper floor is occupancy, not flight');
  assert.equal(ascend.player.voice.space, `level:${upper.id}`, 'upper-floor voice is separate from ground-floor voice');
  assert.equal(world.command(player.id, { type: 'travel', storeId: 'osm-node-8172494977', mode: 'leave' }).ok, false,
    'directory travel cannot bypass the return portal');
  assert.equal(world.command(player.id, { type: 'interiorLevel', portalId: up.id }).ok, false, 'stale ascent is fenced');
  time += 1000;
  const upperPose = { type: 'pose', position: [down.position[0] - 0.1, down.position[1], upper.floorElevation],
    yaw: 0, altitude: 0, levelId: upper.id };
  assert.equal(world.command(player.id, upperPose).ok, true, 'upper walking uses the assigned floor');
  assert.equal(world.command(player.id, { ...upperPose, levelId: ground.id }).ok, false, 'a pose cannot invent a different floor');
  const saved = world.checkpoint();
  const recovered = createSharedWorld(worldData, options);
  assert.equal(recovered.restore(saved).ok, true, 'reconnect preserves level occupancy');
  assert.equal(recovered.snapshot().players[0].levelId, upper.id);
  time += 1000;
  const descend = recovered.command(player.id, { type: 'interiorLevel', portalId: down.id });
  assert.equal(descend.ok, true);
  assert.equal(descend.player.levelId, ground.id);
  assert.equal(descend.player.position[2], ground.floorElevation);
});

test('two visitors can meet on the upper level without falling to the ground floor', () => {
  const worldData = attachDistrictGalleryPlan(data('district.json'), data('building-interiors/river-oaks-gallery-v2.json'));
  const [ground, upper] = worldData.buildingInteriors[0].levels;
  const up = ground.portals.find(portal => portal.toLevelId === upper.id);
  let time = 100000;
  const world = createSharedWorld(worldData, { now: () => time });
  const moveToStair = id => {
    const start = [...world.players.get(id).position];
    for (let step = 1; step <= 30; step++) {
      time += 250;
      const fraction = step / 30;
      assert.equal(world.command(id, { type: 'pose',
        position: [start[0] + (up.position[0] - start[0]) * fraction,
          start[1] + (up.position[1] - start[1]) * fraction, ground.floorElevation],
        yaw: 0, altitude: 0, levelId: ground.id }).ok, true);
    }
  };
  for (const id of ['alice', 'bob']) {
    assert.equal(world.join({ userId: id, name: id }).ok, true);
    assert.equal(world.command(id, { type: 'travel', storeId: 'osm-node-8172494977', mode: 'enter' }).ok, true);
    moveToStair(id);
  }
  assert.equal(world.command('alice', { type: 'interiorLevel', portalId: up.id }).ok, true);
  // Alice stands on the landing; Bob is not kept downstairs (no barricades). He arrives beside her.
  const climbed = world.command('bob', { type: 'interiorLevel', portalId: up.id });
  assert.equal(climbed.ok, true, climbed.error);
  const aliceAt = world.snapshot().players.find(player => player.id === 'alice').position;
  assert.equal(climbed.player.levelId, upper.id);
  assert.ok(Math.hypot(climbed.player.position[0] - aliceAt[0], climbed.player.position[1] - aliceAt[1]) >= 0.7, `beside alice: ${climbed.player.position}`);
  time += 1000;
  const invitation = world.command('alice', { type: 'interaction', action: 'invite', kind: 'handshake', peerId: 'bob' });
  assert.equal(invitation.ok, true);
  assert.equal(world.command('bob', { type: 'interaction', action: 'accept', id: invitation.interaction.id }).ok, true);
  assert.equal(world.players.get('alice').position[2], upper.floorElevation);
  assert.equal(world.players.get('bob').position[2], upper.floorElevation);
  assert.equal(world.snapshot().players.filter(player => player.levelId === upper.id).length, 2);
});
