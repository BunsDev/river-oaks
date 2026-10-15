import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadDistrictData } from '../district-data.js';
import { recoverDistrictTowerCheckpoint } from '../district-tower-checkpoint-migration.js';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { TOWER_ID, beforeTowerRaise } from './district-history.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const resign = checkpoint => { const { checksum: _checksum, ...envelope } = checkpoint; return { ...envelope, checksum: hash(envelope) }; };
const plan = name => JSON.parse(readFileSync(new URL(`../../preview/public/data/building-interiors/${name}`, import.meta.url)));

test('a town saved before the penthouse tower was raised keeps its players, chat and wishes', async () => {
  const nextData = await loadDistrictData(), previousData = beforeTowerRaise(nextData);
  assert.equal(hash(previousData), 'b1cf4b8c73ef29a2c27a615ebb8f1f89f944b7778bf42a0a1b0717fc449f71da', 'fixture matches the district at f72a173e');
  const options = { now: () => 100000, isAdmin: () => true };
  const before = createSharedWorld(previousData, options);
  assert.equal(before.join({ userId: 'resident', name: 'Resident' }).ok, true);
  assert.equal(before.command('resident', { type: 'chat', text: 'Keep this town.' }).ok, true);
  const local = before.snapshot().locals[0];
  assert.equal(before.command('resident', { type: 'travel', localId: local.id }).ok, true);
  assert.equal(before.command('resident', { type: 'wish', localId: local.id, kind: 'dog' }).ok, true);
  const checkpoint = before.checkpoint(), source = structuredClone(checkpoint);
  assert.equal(createSharedWorld(nextData, options).restore(checkpoint).ok, false, 'the raise changes the world fingerprint');
  const migrated = recoverDistrictTowerCheckpoint({ worldData: nextData, checkpoint, ...options });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.from, 'before_office_tower_raise');
  assert.deepEqual(migrated.checkpoint.payload, checkpoint.payload, 'only the fingerprint and checksum change');
  assert.equal(migrated.checkpoint.worldFingerprint, hash(nextData));
  assert.deepEqual(checkpoint, source, 'the migration does not mutate its input');
  const after = createSharedWorld(nextData, options);
  assert.equal(after.restore(migrated.checkpoint).ok, true);
  assert.deepEqual(after.snapshot().chat, before.snapshot().chat);
  assert.deepEqual(after.snapshot().players.map(player => player.id), ['resident']);
});

test('an older one-level gallery town chains through the existing migrations into the raised district', async () => {
  const nextData = await loadDistrictData(), options = { now: () => 100000 };
  const oneLevel = { ...beforeTowerRaise(nextData), buildingInteriors: [plan('river-oaks-gallery-v1.json')] };
  const older = createSharedWorld(oneLevel, options);
  assert.equal(older.join({ userId: 'gallery-visitor', name: 'Visitor' }).ok, true);
  assert.equal(older.command('gallery-visitor', { type: 'travel', storeId: 'osm-node-8172494977', mode: 'enter' }).ok, true);
  const migrated = recoverDistrictTowerCheckpoint({ worldData: nextData, checkpoint: older.checkpoint(), ...options });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.from, 'gallery_plan_v1');
  const after = createSharedWorld(nextData, options);
  assert.equal(after.restore(migrated.checkpoint).ok, true);
  assert.equal(after.snapshot().players[0].levelId, plan('river-oaks-gallery-v2.json').levels[0].id);
});

test('a flight the raised tower now encloses still fails closed instead of moving the flyer', async () => {
  const nextData = await loadDistrictData(), previousData = beforeTowerRaise(nextData), options = { now: () => 100000 };
  const owner = JEVICA_ADMIN_USER_IDS[0], world = createSharedWorld(previousData, options);
  assert.equal(world.join({ userId: owner, name: 'Fixture' }).ok, true);
  const checkpoint = world.checkpoint(), tower = previousData.buildings.find(building => building.id === TOWER_ID);
  const [east, north] = tower.center, ground = createWalkingEnvironment(previousData).groundAt(east, -north);
  checkpoint.payload.players[0].position = [east, north, ground];
  checkpoint.payload.players[0].altitude = 32;
  const saved = resign(checkpoint);
  assert.equal(createSharedWorld(previousData, options).restore(saved).ok, true, 'the 28 m roof allowed this flight');
  assert.equal(recoverDistrictTowerCheckpoint({ worldData: nextData, checkpoint: saved, ...options }).ok, false);
});

test('the tower migration refuses other worlds, other geography, corruption and laundering', async () => {
  const nextData = await loadDistrictData(), options = { now: () => 100000 };
  const checkpoint = createSharedWorld(beforeTowerRaise(nextData), options).checkpoint();
  const attempt = (value, worldData = nextData, worldId = 'river-oaks') => recoverDistrictTowerCheckpoint({ worldData, checkpoint: value, worldId, ...options });
  assert.equal(attempt(checkpoint).ok, true, 'control');
  assert.equal(attempt(checkpoint, nextData, 'fixture-garden').ok, false);
  const otherGeography = structuredClone(nextData);
  otherGeography.buildings.find(building => building.id !== TOWER_ID).size[2] += 1;
  assert.equal(attempt(checkpoint, otherGeography).ok, false, 'any change besides the tower is not this migration');
  assert.equal(attempt(checkpoint, beforeTowerRaise(nextData)).ok, false, 'the unraised district is not a target, so later links keep their own name');
  const taller = structuredClone(nextData);
  taller.buildings.find(building => building.id === TOWER_ID).size[2] = 40;
  assert.equal(attempt(checkpoint, taller).ok, false, 'only the reviewed 33 m raise is a target');
  assert.equal(attempt({ ...checkpoint, checksum: 'broken' }).ok, false);
  const bad = structuredClone(checkpoint);
  bad.payload.chat = [{ text: 'unvalidated' }];
  assert.equal(attempt(resign(bad)).ok, false, 'a re-signed invalid payload is not laundered');
  for (const value of [null, {}, [], { worldFingerprint: checkpoint.worldFingerprint }]) assert.equal(attempt(value).ok, false);
});
