// The garage <-> Gardens district revision switch (#512): a durable town checkpoint is
// re-signed for the district a coordinator serves, both ways, on the same code. Only the
// residents the new geography would enclose are moved, to street ground outside the
// parcel; every other part of the town is carried unchanged, and anything the target
// world refuses fails closed.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import test from 'node:test';
import Redis from 'ioredis';
import { loadDistrictData } from '../district-data.js';
import { recoverDistrictGardensCheckpoint } from '../district-gardens-checkpoint-migration.js';
import { createRedisRoom } from '../redis-room.js';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { DISTRICT_REVISION_GARDENS, attachGardenCampus } from '../../preview/src/garden-campus-district.js';
import { campusToSource, sourceToCampus } from '../../shared/garden-campus-layout.js';
import { beforeTowerRaise } from './district-history.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const resign = checkpoint => { const { checksum: _checksum, ...envelope } = checkpoint;return { ...envelope, checksum: hash(envelope) }; };
const garage = await loadDistrictData(), gardens = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS });
const OWNER = JEVICA_ADMIN_USER_IDS[0], options = { now: () => 100000 };
const source = ([u, v]) => campusToSource([u, v]).slice(0, 2);
// Inside the parcel, with the same margin the migration uses.
const onCampus = ([east, north]) => { const [u, v] = sourceToCampus([east, north]);return u > -4.5 && u < 42.3 && v > -4.5 && v < 185.8; };
const without = (payload, ...keys) => Object.fromEntries(Object.entries(payload).filter(([key]) => !keys.includes(key)));

test('garage to Gardens keeps the town and moves only a flight over the new towers', () => {
  const world = createSharedWorld(garage, options);
  assert.equal(world.join({ userId: 'resident', name: 'Resident' }).ok, true);
  assert.equal(world.command('resident', { type: 'chat', text: 'Keep this town through the new campus.' }).ok, true);
  assert.equal(world.join({ userId: OWNER, name: 'Owner' }).ok, true);
  const checkpoint = world.checkpoint();
  // A flight 26 m up over T1, legal above the 20 m garage roof, inside T1's 28.1 m cap clearance.
  const [east, north] = source([16, 58]), flyer = checkpoint.payload.players.find(player => player.id === OWNER);
  flyer.position = [east, north, createWalkingEnvironment(garage).groundAt(east, -north)];flyer.altitude = 26.5;
  const saved = resign(checkpoint), original = structuredClone(saved);
  assert.equal(createSharedWorld(garage, options).restore(saved).ok, true, 'the garage allowed this flight');
  assert.equal(createSharedWorld(gardens, options).restore(saved).ok, false, 'the fingerprint differs');
  const migrated = recoverDistrictGardensCheckpoint({ worldData: gardens, checkpoint: saved, ...options });
  assert.equal(migrated.ok, true, migrated.error);
  assert.deepEqual([migrated.from, migrated.to, migrated.moved], ['garage', 'gardens', [OWNER]]);
  assert.deepEqual(saved, original, 'the input is not mutated');
  assert.equal(migrated.checkpoint.worldFingerprint, hash(gardens));
  assert.deepEqual(without(migrated.checkpoint.payload, 'players'), without(saved.payload, 'players'), 'everything but the moved resident is carried');
  const moved = migrated.checkpoint.payload.players.find(player => player.id === OWNER), stayed = migrated.checkpoint.payload.players.find(player => player.id === 'resident');
  assert.deepEqual(stayed, saved.payload.players.find(player => player.id === 'resident'));
  assert.equal(moved.altitude, 0);assert.equal(onCampus(moved.position), false, 'landed outside the parcel');
  const after = createSharedWorld(gardens, options);
  assert.equal(after.restore(migrated.checkpoint).ok, true);
  assert.deepEqual(after.snapshot().chat, world.snapshot().chat);
});

test('Gardens to garage, the configuration rollback, moves everyone on the campus to the street', () => {
  let time = 100000;
  const world = createSharedWorld(gardens, { now: () => time }), command = (id, message) => { time += 2000;return world.command(id, message); };
  for (const id of ['hall', 'platform', 'street']) assert.equal(world.join({ userId: id, name: id }).ok, true);
  assert.equal(command('hall', { type: 'travel', storeId: 'campus:T1-F1-hall', mode: 'enter' }).ok, true);
  assert.equal(command('platform', { type: 'travel', position: source([16, 76.8]) }).ok, true);
  const checkpoint = world.checkpoint(), street = structuredClone(checkpoint.payload.players.find(player => player.id === 'street'));
  assert.equal(onCampus(street.position), false, 'control: the spawn is off campus');
  assert.equal(createSharedWorld(garage, options).restore(checkpoint).ok, false);
  const rolled = recoverDistrictGardensCheckpoint({ worldData: garage, checkpoint, ...options });
  assert.equal(rolled.ok, true, rolled.error);
  assert.deepEqual([rolled.from, rolled.to, rolled.moved.sort()], ['gardens', 'garage', ['hall', 'platform']]);
  assert.equal(rolled.checkpoint.worldFingerprint, hash(garage));
  for (const player of rolled.checkpoint.payload.players) assert.equal(onCampus(player.position), false, `${player.id} is off campus`);
  assert.deepEqual(rolled.checkpoint.payload.players.find(player => player.id === 'street'), street);
  const after = createSharedWorld(garage, options);
  assert.equal(after.restore(rolled.checkpoint).ok, true);
  // The two moved residents stand apart on the street, not on each other.
  const [a, b] = rolled.moved.map(id => rolled.checkpoint.payload.players.find(player => player.id === id).position);
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 0.9);
  // And forward again: the round trip is a supported pair.
  const again = recoverDistrictGardensCheckpoint({ worldData: gardens, checkpoint: rolled.checkpoint, ...options });
  assert.equal(again.ok, true);assert.deepEqual(again.moved, []);
});

test('a town from before the tower raise chains through the existing migrations into the Gardens', () => {
  const older = createSharedWorld(beforeTowerRaise(garage), options);
  assert.equal(older.join({ userId: 'old', name: 'Old' }).ok, true);
  const migrated = recoverDistrictGardensCheckpoint({ worldData: gardens, checkpoint: older.checkpoint(), ...options });
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.from, 'garage:before_office_tower_raise');
  assert.equal(createSharedWorld(gardens, options).restore(migrated.checkpoint).ok, true);
});

test('the switch refuses other worlds, another campus revision, corruption and laundering', () => {
  const checkpoint = createSharedWorld(garage, options).checkpoint();
  const attempt = (value, worldData = gardens, worldId = 'river-oaks') => recoverDistrictGardensCheckpoint({ worldData, checkpoint: value, worldId, ...options });
  assert.equal(attempt(checkpoint).ok, true, 'control');
  assert.equal(attempt(checkpoint, gardens, 'fixture-garden').ok, false);
  assert.equal(attempt(checkpoint, garage).ok, false, 'a garage town is not rolled back to a garage');
  assert.equal(attempt({ ...checkpoint, checksum: 'broken' }).ok, false);
  const bad = structuredClone(checkpoint);bad.payload.chat = [{ text: 'unvalidated' }];
  assert.equal(attempt(resign(bad)).ok, false, 'a re-signed invalid payload is not laundered');
  for (const value of [null, {}, [], { worldFingerprint: checkpoint.worldFingerprint }]) assert.equal(attempt(value).ok, false);
  // A campus built from a different contract revision cannot be rolled back by this code.
  const otherCampus = structuredClone(gardens);otherCampus.buildings.find(item => item.campus?.part === 'T2').size[2] += 1;
  const foreign = createSharedWorld(otherCampus, options);foreign.join({ userId: 'x', name: 'x' });
  assert.equal(attempt(foreign.checkpoint(), garage).ok, false);
  // The campus overlay itself is what makes the forward target; a stray copy is refused.
  assert.throws(() => attachGardenCampus(gardens));
});

const testRedis = (name, fn) => test(name, { skip: !process.env.REDIS_URL }, fn);
testRedis('a Redis coordinator switches garage -> Gardens -> garage once each, keeping the town', async t => {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: null });
  redis.on('error', () => {});await redis.connect();
  const prefix = `{river-oaks:test:${randomUUID()}}`, rooms = [];let time = 100000;
  const create = worldData => { const room = createRedisRoom({ redis, prefix, worldData, authorize: async () => true, now: () => time, isAdmin: () => false });rooms.push(room);return room; };
  t.after(async () => { await Promise.all(rooms.map(room => room.close()));const keys = await redis.keys(`${prefix}:*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const identity = userId => ({ userId, name: userId, sessionId: `${userId}-session`, expiresAt: time + 120000 });
  const join = (room, userId, connectionId) => room.request({ type: 'join', identity: identity(userId), connectionId });
  const command = (room, userId, connectionId, message) => { time += 2000;return room.request({ type: 'command', userId, connectionId, message }); };
  const logs = [];t.mock.method(console, 'info', message => logs.push(JSON.parse(message)));
  const first = create(garage);
  assert.equal((await join(first, 'alice', 'one')).ok, true);
  assert.equal((await command(first, 'alice', 'one', { type: 'chat', text: 'Before the campus.' })).ok, true);
  await first.close();
  const campus = create(gardens);
  assert.equal((await join(campus, 'alice', 'two')).ok, true);
  assert.deepEqual(logs, [{ event: 'district_gardens_checkpoint_migrated', from: 'garage', to: 'gardens', moved: 0 }]);
  assert.equal((await campus.read()).snapshot.chat.at(-1).text, 'Before the campus.');
  assert.equal(JSON.parse(inflateSync(await redis.getBuffer(`${prefix}:state`))).checkpoint.worldFingerprint, hash(gardens));
  assert.equal((await command(campus, 'alice', 'two', { type: 'travel', storeId: 'campus:T2-F1-hall', mode: 'enter' })).ok, true);
  await campus.close();
  const again = create(gardens);
  assert.equal((await join(again, 'alice', 'three')).ok, true);
  assert.equal(logs.length, 1, 'the switch is committed once');
  await again.close();
  const rollback = create(garage);
  assert.equal((await join(rollback, 'alice', 'four')).ok, true);
  assert.deepEqual(logs.at(-1), { event: 'district_gardens_checkpoint_migrated', from: 'gardens', to: 'garage', moved: 1 });
  const alice = (await rollback.read()).snapshot.players.find(player => player.id === 'alice');
  assert.equal(onCampus(alice.position), false, 'the hall visitor stands on the street after the rollback');
  assert.equal((await rollback.read()).snapshot.chat.at(-1).text, 'Before the campus.');
});
