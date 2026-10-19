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
import { DISTRICT_REVISION_GARDENS, attachGardenCampus, campusSuiteSeatSites } from '../../preview/src/garden-campus-district.js';
import { campusToSource, campusUnitInventory, sourceToCampus } from '../../shared/garden-campus-layout.js';
import { CAMPUS_LEASE_CONTRACT } from '../../shared/garden-campus-lease-contract.js';
import { beforeTowerRaise } from './district-history.js';
import { createCampusCommands } from '../../preview/src/garden-campus-model.js';

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
  // Jevica's office invitation is unrelated durable state: it must ride the switch untouched.
  const invited = world.command(OWNER, { type: 'office', officeId: 'jevica-office', action: 'invite', peerId: 'resident' });
  assert.equal(invited.ok, true, invited.error);
  const checkpoint = world.checkpoint();
  assert.ok(checkpoint.payload.offices.grants.length > 0, 'control: the invitation is in the checkpoint');
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
  assert.deepEqual(without(migrated.checkpoint.payload, 'players', 'offices'), without(saved.payload, 'players', 'offices'), 'everything but the moved resident is carried');
  // Offices compare by meaning: a restored world writes an office with no requests as no entry.
  const nonEmpty = list => list.filter(([, items]) => items.length);
  assert.deepEqual(migrated.checkpoint.payload.offices.grants, saved.payload.offices.grants, 'office invitations are carried exactly');
  assert.deepEqual(nonEmpty(migrated.checkpoint.payload.offices.requests), nonEmpty(saved.payload.offices.requests));
  const moved = migrated.checkpoint.payload.players.find(player => player.id === OWNER), stayed = migrated.checkpoint.payload.players.find(player => player.id === 'resident');
  assert.deepEqual(stayed, saved.payload.players.find(player => player.id === 'resident'));
  assert.equal(moved.altitude, 0);assert.equal(onCampus(moved.position), false, 'landed outside the parcel');
  const after = createSharedWorld(gardens, options);
  assert.equal(after.restore(migrated.checkpoint).ok, true);
  assert.deepEqual(after.snapshot().chat, world.snapshot().chat);
  assert.deepEqual(after.checkpoint().payload.offices.grants, saved.payload.offices.grants, 'office invitations survive the switch');
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

// The rollback with #508's floors in use: residents who rode T1's lift to Floor 4, one
// midway along B12, one on Floor 2's spine and a tenant seated at their suite desk all reach
// the street on foot, and the garage restores the town they leave behind.
test('the configuration rollback clears every campus floor, seated tenants included, and the garage restores', () => {
  const clock = { time: Date.UTC(2026, 9, 19, 6) };
  const world = createSharedWorld(gardens, { now: () => clock.time, campusOperators: ['op'] });
  const command = (id, message) => { clock.time += 150;return world.command(id, message); };
  const player = id => world.snapshot().players.find(item => item.id === id);
  const environments = new Map(), environmentFor = levelId => { if (!environments.has(levelId ?? '')) environments.set(levelId ?? '', createWalkingEnvironment(gardens, [], levelId ?? null));return environments.get(levelId ?? ''); };
  function walk(id, points) {
    let at = player(id).position;
    for (const point of points) {
      const [x, n] = source(point), count = Math.max(1, Math.ceil(Math.hypot(x - at[0], n - at[1]) / 0.12));
      for (let i = 1; i <= count; i++) {
        const self = player(id), e = at[0] + (x - at[0]) * i / count, m = at[1] + (n - at[1]) * i / count;
        const moved = command(id, { type: 'pose', position: [e, m, environmentFor(self.levelId).groundAt(e, -m)], yaw: 0, altitude: 0, ...(self.levelId ? { levelId: self.levelId } : {}) });
        assert.equal(moved.ok, true, `${id} at ${point}: ${moved.error}`);
      }
      at = [x, n];
    }
  }
  // T1's hall, its lift to the given floor (1 = Floor 2), and out onto the spine.
  function upTo(id, floor) {
    assert.equal(command(id, { type: 'travel', storeId: 'campus:T1-F1-hall', mode: 'enter' }).ok, true);
    clock.time += 1500;walk(id, [[11.6, 56.3]]);
    for (let level = 1; level <= floor; level++) {
      const moved = command(id, { type: 'interiorLevel', portalId: `T1-F${level}/lift-up` });
      assert.equal(moved.ok, true, moved.error);clock.time += 400;
    }
    walk(id, [[12, 57.5], [16, 57.5]]);
  }
  for (const id of ['op', 'floor4', 'skywalk', 'floor2', 'tenant', 'street']) assert.equal(world.join({ userId: id, name: id }).ok, true);
  upTo('floor4', 3);
  upTo('skywalk', 3);walk('skywalk', [[16, 81]]);
  upTo('floor2', 1);
  // The tenant leases T1-201, walks through its door and sits at its workstation desk.
  const unit = 'T1-F2-W-S', door = campusUnitInventory().find(item => item.id === unit).door;
  const desk = campusSuiteSeatSites(gardens).find(seat => seat.unitId === unit && seat.kind === 'desk' && seat.workstation);
  const campus = (id, message) => { clock.time += 500;return world.command(id, { type: 'campus', ...message, worldId: 'river-oaks', contract: { ...CAMPUS_LEASE_CONTRACT } }); };
  const offered = campus('op', { action: 'issue', operationId: 'op-rollback-1', unitId: unit, tenantId: 'tenant', startsAt: clock.time + 1000, endsAt: clock.time + 30 * 86_400_000 });
  assert.equal(offered.ok, true, JSON.stringify(offered));clock.time += 2000;
  assert.equal(campus('tenant', { action: 'accept', operationId: 'op-rollback-2', leaseId: offered.lease.id, expectedVersion: offered.lease.version }).ok, true);
  upTo('tenant', 1);walk('tenant', [[16, door[1]], [13.4, door[1]], sourceToCampus(desk.stand)]);
  const sat = command('tenant', { type: 'sit', buildId: desk.buildId, slot: 0 });
  assert.equal(sat.ok, true, sat.error);
  const checkpoint = world.checkpoint(), saved = id => checkpoint.payload.players.find(item => item.id === id);
  // Controls: everyone is where the case says, by the server's own record.
  assert.deepEqual(['floor4', 'skywalk', 'floor2', 'tenant'].map(id => [saved(id).levelId, saved(id).buildingId]),
    [['garden-campus/l3', 'garden-campus'], ['garden-campus/l3', 'garden-campus'], ['garden-campus/l1', 'garden-campus'], ['garden-campus/l1', 'garden-campus']]);
  assert.equal(saved('tenant').sitting?.buildId, desk.buildId, 'the tenant is seated in the checkpoint');
  assert.ok(sourceToCampus(saved('skywalk').position)[1] > 76 && sourceToCampus(saved('skywalk').position)[1] < 86, 'midway along B12');
  assert.equal(createSharedWorld(garage, options).restore(checkpoint).ok, false, 'the garage cannot take the campus checkpoint as it is');
  const rolled = recoverDistrictGardensCheckpoint({ worldData: garage, checkpoint, now: () => clock.time });
  assert.equal(rolled.ok, true, rolled.error);
  assert.deepEqual([rolled.from, rolled.to, [...rolled.moved].sort()], ['gardens', 'garage', ['floor2', 'floor4', 'skywalk', 'tenant']]);
  const after = id => rolled.checkpoint.payload.players.find(item => item.id === id);
  for (const id of rolled.moved) {
    const moved = after(id);
    assert.deepEqual([moved.levelId, moved.buildingId, moved.sitting, moved.vehicle, moved.altitude], [null, null, null, null, 0], `${id} is on foot at street level`);
    assert.equal(onCampus(moved.position), false, `${id} is off the parcel`);
  }
  for (const [a, b] of rolled.moved.flatMap((id, i) => rolled.moved.slice(i + 1).map(other => [after(id).position, after(other).position]))) assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 0.9, 'the moved residents stand apart');
  assert.deepEqual(after('street'), saved('street'), 'the street walker is carried unchanged');
  assert.deepEqual(rolled.checkpoint.payload.campus, checkpoint.payload.campus, 'the lease rides along inert');
  // The garage restores the town, and a moved resident walks on from where they stand.
  const garageTown = createSharedWorld(garage, { now: () => clock.time });
  assert.deepEqual(garageTown.restore(rolled.checkpoint), { ok: true });
  const [e, n] = after('floor4').position, ground = createWalkingEnvironment(garage);
  clock.time += 1000;
  assert.equal(garageTown.command('floor4', { type: 'pose', position: [e + 0.1, n, ground.groundAt(e + 0.1, -n)], yaw: 0, altitude: 0 }).ok, true, 'the moved resident can walk');
  // Forward again from the rolled-back town: nobody is enclosed, so nobody moves.
  const again = recoverDistrictGardensCheckpoint({ worldData: gardens, checkpoint: garageTown.checkpoint(), now: () => clock.time });
  assert.equal(again.ok, true, again.error);assert.deepEqual(again.moved, []);
  assert.deepEqual(createSharedWorld(gardens, { now: () => clock.time, campusOperators: ['op'] }).restore(again.checkpoint), { ok: true });
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

test('a configuration rollback keeps every lease inert, byte for byte, and switching back honours it', async () => {
  let time = Date.UTC(2026, 9, 18, 12);
  const options = { now: () => time, campusOperators: ['operator'] };
  const campus = createSharedWorld(gardens, options);
  for (const id of ['operator', 'alice']) assert.equal(campus.join({ userId: id, name: id }).ok, true);
  const client = id => createCampusCommands({ worldId: 'river-oaks', send: async message => { time += 500;return campus.command(id, message); } });
  const offered = await client('operator').issue({ unitId: 'T1-F2-W-S', tenantId: 'alice', startsAt: time, endsAt: time + 7 * 86_400_000 });
  assert.equal(offered.ok, true, offered.message);
  assert.equal((await client('alice').accept(offered.lease)).ok, true);
  assert.equal(campus.campusSuiteAccess('alice', 'T1-F2-W-S').role, 'tenant');
  const saved = campus.checkpoint();
  // Roll back to the garage: the lease section rides along untouched and grants nothing.
  const rolled = recoverDistrictGardensCheckpoint({ worldData: garage, checkpoint: saved, ...options });
  assert.equal(rolled.ok, true, rolled.error);
  assert.deepEqual(rolled.checkpoint.payload.campus, saved.payload.campus);
  const inert = createSharedWorld(garage, options);
  assert.deepEqual(inert.restore(rolled.checkpoint), { ok: true });
  assert.equal(inert.campusSuiteAccess('alice', 'T1-F2-W-S').reason, 'campus_unavailable');
  assert.equal(inert.command('alice', { type: 'campus', action: 'list' }).error, 'campus_unavailable');
  time += 86_400_000;inert.step?.(0.1);
  assert.deepEqual(inert.checkpoint().payload.campus, saved.payload.campus, 'nothing expires or changes while the campus is absent');
  // Switching the campus back on honours the lease.
  const back = recoverDistrictGardensCheckpoint({ worldData: gardens, checkpoint: inert.checkpoint(), ...options });
  assert.equal(back.ok, true, back.error);
  const again = createSharedWorld(gardens, options);
  assert.deepEqual(again.restore(back.checkpoint), { ok: true });
  assert.equal(again.campusSuiteAccess('alice', 'T1-F2-W-S').role, 'tenant');
  // A lease that ended while the campus was away admits nobody once it returns.
  time += 30 * 86_400_000;
  const late = createSharedWorld(gardens, options);late.restore(back.checkpoint);late.step?.(0.1);
  assert.equal(late.campusSuiteAccess('alice', 'T1-F2-W-S').ok, false);
});

const testRedis = (name, fn) => test(name, { skip: !process.env.REDIS_URL }, fn);
testRedis('a Redis coordinator switches district only to a newer epoch; an older deployment never switches it back', async t => {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: null });
  redis.on('error', () => {});await redis.connect();
  const prefix = `{river-oaks:test:${randomUUID()}}`, rooms = [];let time = 100000;
  const create = (worldData, districtEpoch = 0) => { const room = createRedisRoom({ redis, prefix, worldData, districtEpoch, authorize: async () => true, now: () => time, isAdmin: () => false });rooms.push(room);return room; };
  t.after(async () => { await Promise.all(rooms.map(room => room.close()));const keys = await redis.keys(`${prefix}:*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const identity = userId => ({ userId, name: userId, sessionId: `${userId}-session`, expiresAt: time + 120000 });
  const join = (room, userId, connectionId) => room.request({ type: 'join', identity: identity(userId), connectionId });
  const command = (room, userId, connectionId, message) => { time += 2000;return room.request({ type: 'command', userId, connectionId, message }); };
  const committed = async () => JSON.parse(inflateSync(await redis.getBuffer(`${prefix}:state`)));
  const logs = [];t.mock.method(console, 'info', message => logs.push(JSON.parse(message)));
  // Today's town: the garage at epoch 0 commits no district record at all.
  const first = create(garage);
  assert.equal((await join(first, 'alice', 'one')).ok, true);
  assert.equal((await command(first, 'alice', 'one', { type: 'chat', text: 'Before the campus.' })).ok, true);
  await first.close();
  assert.equal(Object.hasOwn(await committed(), 'district'), false, 'the default garage leaves the durable record as it was');
  // A switch that forgets to raise the epoch fails closed.
  await assert.rejects(join(create(gardens, 0), 'alice', 'stale'), /Invalid durable town district/);
  // Epoch 1 serves the campus: one migration, the town kept.
  const campus = create(gardens, 1);
  assert.equal((await join(campus, 'alice', 'two')).ok, true);
  assert.deepEqual(logs, [{ event: 'district_gardens_checkpoint_migrated', from: 'garage', to: 'gardens', moved: 0 }]);
  assert.equal((await campus.read()).snapshot.chat.at(-1).text, 'Before the campus.');
  assert.deepEqual((await committed()).district, { revision: DISTRICT_REVISION_GARDENS, epoch: 1 });
  assert.equal((await committed()).checkpoint.worldFingerprint, hash(gardens));
  assert.equal((await command(campus, 'alice', 'two', { type: 'travel', storeId: 'campus:T2-F1-hall', mode: 'enter' })).ok, true);
  await campus.close();
  // An old deployment (garage, epoch 0) still serving sockets refuses the newer town instead of switching it back.
  const before = await redis.getBuffer(`${prefix}:state`);
  await assert.rejects(join(create(garage, 0), 'alice', 'old'), /Invalid durable town district/);
  assert.ok((await redis.getBuffer(`${prefix}:state`)).equals(before), 'the refused coordinator changed nothing');
  // The campus at epoch 1 carries on without a second migration.
  const again = create(gardens, 1);
  assert.equal((await join(again, 'alice', 'three')).ok, true);
  assert.equal(logs.length, 1, 'the switch is committed once');
  await again.close();
  // The configuration rollback: the garage at epoch 2 moves the hall visitor to the street.
  const rollback = create(garage, 2);
  assert.equal((await join(rollback, 'alice', 'four')).ok, true);
  assert.deepEqual(logs.at(-1), { event: 'district_gardens_checkpoint_migrated', from: 'gardens', to: 'garage', moved: 1 });
  const alice = (await rollback.read()).snapshot.players.find(player => player.id === 'alice');
  assert.equal(onCampus(alice.position), false, 'the hall visitor stands on the street after the rollback');
  assert.equal((await rollback.read()).snapshot.chat.at(-1).text, 'Before the campus.');
  assert.deepEqual((await committed()).district, { revision: null, epoch: 2 });
  await rollback.close();
  // And the campus deployment at epoch 1, if still alive, cannot take the town back.
  await assert.rejects(join(create(gardens, 1), 'alice', 'late'), /Invalid durable town district/);
});
