import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateBuildingInteriorPlan } from '../../preview/src/building-interiors-plan.js';
import { attachDistrictGalleryPlan } from '../../preview/src/district-interior-contract.js';
import { planStoreRooms } from '../../preview/src/store-rooms.js';
import { loadDistrictData } from '../district-data.js';
import { recoverDistrictLevelsCheckpoint } from '../district-level-checkpoint-migration.js';
import { createSharedWorld } from '../world.js';

const data = name => JSON.parse(readFileSync(new URL(`../../preview/public/data/${name}`, import.meta.url)));

test('the proposed second gallery level preserves ground identity and fits below the roof', () => {
  const district = data('district.json');
  const previous = data('building-interiors/river-oaks-gallery-v1.json');
  const approved = data('building-interiors/river-oaks-gallery-v2.json');
  const building = district.buildings.find(item => item.id === approved.buildingId);
  const store = district.stores.find(item => item.id === 'osm-node-8172494977');
  const rooms = planStoreRooms(district).filter(room => room.buildingId === building.id);
  const ground = rooms.find(room => room.storeId === store.id);
  const { approvedSha256, ...plan } = approved;
  assert.equal(approvedSha256, createHash('sha256').update(JSON.stringify(plan)).digest('hex'));
  assert.deepEqual(plan, JSON.parse(JSON.stringify(generateBuildingInteriorPlan({
    worldId: 'river-oaks', building,
    entrance: { id: store.id, position: store.facade, outward: store.outward },
    seed: building.id, levels: 2, baseElevation: ground.floor,
    reservedFootprints: rooms.filter(room => room !== ground).map(room => room.footprint),
  }))));
  assert.deepEqual(attachDistrictGalleryPlan(district, approved).buildingInteriors, [approved]);
  assert.throws(() => attachDistrictGalleryPlan(district, { ...approved, approvedSha256: previous.approvedSha256 }), /Unapproved/);
  assert.equal(plan.levels.length, 2);
  assert.equal(plan.levels[0].id, previous.levels[0].id);
  assert.equal(plan.levels[0].floorElevation, previous.levels[0].floorElevation);
  assert.deepEqual(plan.levels[0].rooms, previous.levels[0].rooms);
  assert.deepEqual(plan.levels[0].layers.fixtures, previous.levels[0].layers.fixtures);
  assert.equal(plan.levels[1].floorElevation + plan.levels[1].clearHeight + 0.4 <= building.center[2] + building.size[2], true);
  const up = plan.levels[0].portals.find(portal => portal.id.endsWith('/stairs-up'));
  const down = plan.levels[1].portals.find(portal => portal.id.endsWith('/stairs-down'));
  assert.deepEqual(up.position, down.position);
  assert.equal(up.toLevelId, plan.levels[1].id);
  assert.equal(down.toLevelId, plan.levels[0].id);
  assert.deepEqual(plan.levels[0].layers.shell[0].stairOpening, plan.levels[1].layers.shell[0].stairOpening);
});

test('a validated occupied one-level town migrates to the two-level plan without losing its player', async () => {
  const nextData = await loadDistrictData();
  const approved = data('building-interiors/river-oaks-gallery-v2.json');
  const previousData = { ...nextData, buildingInteriors: [data('building-interiors/river-oaks-gallery-v1.json')] };
  const options = { now: () => 100000 };
  const before = createSharedWorld(previousData, options);
  assert.equal(before.join({ userId: 'gallery-visitor', name: 'Visitor' }).ok, true);
  assert.equal(before.command('gallery-visitor', { type: 'travel', storeId: 'osm-node-8172494977', mode: 'enter' }).ok, true);
  assert.equal(before.command('gallery-visitor', { type: 'chat', text: 'Keep this town.' }).ok, true);
  const checkpoint = before.checkpoint();
  assert.equal(createSharedWorld(nextData, options).restore(checkpoint).ok, false);
  const migrated = recoverDistrictLevelsCheckpoint({ worldData: nextData, checkpoint, ...options });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.from, 'gallery_plan_v1');
  const after = createSharedWorld(nextData, options);
  assert.equal(after.restore(migrated.checkpoint).ok, true);
  assert.equal(after.snapshot().players[0].levelId, approved.levels[0].id);
  assert.deepEqual(after.snapshot().chat, before.snapshot().chat);
  assert.deepEqual(before.checkpoint(), checkpoint, 'migration did not change its source');
  assert.equal(recoverDistrictLevelsCheckpoint({ worldData: nextData, checkpoint: { ...checkpoint, checksum: 'bad' }, ...options }).ok, false);
  const legacy = structuredClone(checkpoint);
  legacy.version = 6;
  delete legacy.payload.screenings;
  for (const player of legacy.payload.players) {
    delete player.buildingId;
    delete player.levelId;
  }
  const { checksum: _checksum, ...legacyEnvelope } = legacy;
  legacy.checksum = createHash('sha256').update(JSON.stringify(legacyEnvelope)).digest('hex');
  const upgraded = recoverDistrictLevelsCheckpoint({ worldData: nextData, checkpoint: legacy, ...options });
  assert.equal(upgraded.ok, true, 'a version-6 gallery checkpoint upgrades with explicit level occupancy');
  assert.equal(createSharedWorld(nextData, options).restore(upgraded.checkpoint).ok, true);
  assert.equal(upgraded.checkpoint.payload.players[0].levelId, approved.levels[0].id);
  const originalData = structuredClone(nextData);
  delete originalData.buildingInteriors;
  const original = createSharedWorld(originalData, options);
  assert.equal(original.join({ userId: 'older-visitor', name: 'Visitor' }).ok, true);
  const chained = recoverDistrictLevelsCheckpoint({ worldData: nextData, checkpoint: original.checkpoint(), ...options });
  assert.equal(chained.ok, true, 'the pre-gallery checkpoint chains through the one-level migration');
  assert.equal(chained.from, 'previous_district');
  assert.equal(createSharedWorld(nextData, options).restore(chained.checkpoint).ok, true);
});
