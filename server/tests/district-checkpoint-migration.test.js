import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { recoverDistrictHeightCheckpoint } from '../district-checkpoint-migration.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
data.vegetation = JSON.parse(readFileSync(new URL('../../preview/public/data/district-vegetation.json', import.meta.url)));
// Historical values from 297d9bb^ and 9dd65d2^; fixtures use mapped IDs,
// independently of the migration's implementation. Only heights changed.
const heights = {
  'osm-way-625330785': 8, 'osm-way-625333006': 6.5, 'osm-way-625333008': 6.5,
  'osm-way-878472795': 6.5, 'osm-way-878472797': 20,
};
const olderHeights = { ...heights, 'osm-way-625330792': 6.5, 'osm-way-625330798': 12, 'osm-way-625333009': 6.5 };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const resign = checkpoint => {
  const { checksum: _checksum, ...envelope } = checkpoint;
  return { ...envelope, checksum: hash(envelope) };
};
function historical(values) {
  const old = structuredClone(data);
  for (const building of old.buildings) if (Object.hasOwn(values, building.id)) {
    building.size[2] = values[building.id];
    building.height_source = 'estimated from tagged/default levels';
  }
  return old;
}

for (const [revision, values, fingerprint] of [
  ['before_six_facade_heights', heights, '7061b5bd4e6631641cfa592dcc2779547d158527ce4ba50f5cdb02838f338fb4'],
  ['before_photo_facade_heights', olderHeights, '3204c2d04a66d424621a5c0ab5c57fae8ede77512e07f43a3f55e9d91e5fcfc4'],
]) test(`height migration preserves the complete town from ${revision}`, () => {
  const fromData = historical(values);
  assert.equal(hash(fromData), fingerprint, 'fixture matches the recorded public district');
  let fixtureTime = 100000;
  const options = { now: () => fixtureTime, isAdmin: () => true };
  const original = createSharedWorld(fromData, options);
  assert.equal(original.join({ userId: 'fixture-owner', name: 'Fixture' }).ok, true);
  // Valid level ground west of Westcreek, clear of roads and player occupancy.
  const position = [-2918.280118916899, -1455.6085898216527];
  assert.equal(original.command('fixture-owner', { type: 'travel', position: [position[0], position[1] + 2.5] }).ok, true);
  fixtureTime += 2000;
  const placed = original.command('fixture-owner', { type: 'build', action: 'place', kind: 'seat', finish: 'rose', position, yaw: 0 });
  assert.equal(placed.ok, true, 'fixture includes an account-owned creation');
  fixtureTime += 2000;
  assert.equal(original.command('fixture-owner', { type: 'chat', text: 'Keep this town.' }).ok, true);
  const local = original.snapshot().locals[0];
  assert.equal(original.command('fixture-owner', { type: 'travel', localId: local.id }).ok, true);
  assert.equal(original.command('fixture-owner', { type: 'wish', localId: local.id, kind: 'dog' }).ok, true);
  const checkpoint = original.checkpoint(), before = structuredClone(checkpoint);
  assert.equal(createSharedWorld(data, options).restore(checkpoint).ok, false, 'reproduces the hosted fingerprint rejection');
  const result = recoverDistrictHeightCheckpoint({ worldData: data, checkpoint, ...options });
  assert.equal(result.ok, true);
  assert.equal(result.revision, revision);
  assert.deepEqual(result.checkpoint.payload, checkpoint.payload, 'players, wishes, routes and every account-owned field survive');
  assert.deepEqual(checkpoint, before, 'migration does not mutate its input');
  const restored = createSharedWorld(data, options);
  assert.equal(restored.restore(result.checkpoint).ok, true);
  assert.deepEqual(restored.snapshot(), original.snapshot());
  assert.equal(result.checkpoint.worldFingerprint, hash(data));
});

test('height migration rejects a formerly valid flight position inside a taller roof', () => {
  const old = historical(heights), options = { now: () => 100000 };
  const world = createSharedWorld(old, options), owner = JEVICA_ADMIN_USER_IDS[0];
  assert.equal(world.join({ userId: owner, name: 'Fixture' }).ok, true);
  const checkpoint = world.checkpoint(), building = old.buildings.find(item => item.id === 'osm-way-625330785');
  const [east, north] = building.center;
  const ground = createWalkingEnvironment(old).groundAt(east, -north);
  checkpoint.payload.players[0].position = [east, north, ground];
  checkpoint.payload.players[0].altitude = 20;
  const saved = resign(checkpoint);
  assert.equal(createSharedWorld(old, options).restore(saved).ok, true, 'the old roof allowed this position');
  assert.equal(recoverDistrictHeightCheckpoint({ worldData: data, checkpoint: saved, ...options }).ok, false,
    'target collision validation is mandatory even for a recognized revision');
});

test('height migration rejects unknown geography, wrong rooms, corruption and invalid payloads', () => {
  const options = { now: () => 100000, isAdmin: () => true };
  const checkpoint = createSharedWorld(historical(heights), options).checkpoint();
  const attempt = (value, worldData = data, worldId = 'river-oaks') => recoverDistrictHeightCheckpoint({ worldData, checkpoint: value, worldId, ...options });
  assert.equal(attempt(checkpoint, { ...data, bounds_m: [-1, -1, 1, 1] }).ok, false);
  assert.equal(attempt(checkpoint, data, 'fixture-garden').ok, false);
  assert.equal(attempt({ ...checkpoint, checksum: 'broken' }).ok, false);
  assert.equal(attempt(resign({ ...checkpoint, worldFingerprint: 'unknown' })).ok, false);
  const bad = structuredClone(checkpoint);
  bad.payload.chat = [{ text: 'private fixture data' }];
  assert.equal(attempt(resign(bad)).ok, false, 'recognized fingerprints do not launder invalid state');
  for (const bad of [null, {}, [], { worldFingerprint: checkpoint.worldFingerprint }]) assert.equal(attempt(bad).ok, false);
});
