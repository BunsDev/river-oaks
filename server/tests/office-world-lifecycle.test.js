import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { createRedisRoom } from '../redis-room.js';
import { officeRedis } from './helpers/office-redis.js';
import { OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE, officeLayout } from '../../preview/src/office-layouts.js';

const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const ipic = createWalkingEnvironment(data).rooms.find(room => room.interior === 'ipic-photo-v1');
const available = spawnSync('redis-server', ['--version']).status === 0;
const options = { skip: !available && !process.env.REDIS_URL, timeout: 60_000 };
const penthouse = officeLayout(OFFICE_LAYOUT_PENTHOUSE);
const stairs = penthouse.anchors.find(item => item.id === 'stairs-bottom').position;
const up = penthouse.levels[0].portals.find(item => item.kind === 'stairs').id;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const task = { id: 'retained-task', title: 'Synthetic work', notes: 'Private notes', result: '', links: [], status: 'open' };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function setup(t) {
  assert.ok(available, 'Install redis-server for the full lifecycle gate');
  const fixture = await officeRedis(), redis = await fixture.start(), rooms = [];
  t.after(async () => { for (const room of rooms) await room.close(); await fixture.close(); });
  const prefix = '{office-lifecycle}', worldId = 'office-fixture', revoked = new Set();
  let time = 100_000;
  const now = () => time;
  // Synthetic catalog records let the room's real fenced publication transaction
  // exercise the authored district office/IPIC geometry. The creator region editor
  // cannot author these district-only venues; its HTTP path has separate coverage.
  const keys = Object.fromEntries(['catalog', 'region', 'draft', 'history'].map(key => [key, `${prefix}:${key}`]));
  const initial = { id: worldId, regionSha256: hash(data), revision: 1 };
  await redis.hset(keys.catalog, worldId, JSON.stringify(initial));
  await redis.hset(keys.region, worldId, JSON.stringify(data));
  const catalog = {
    get: async () => JSON.parse(await redis.hget(keys.catalog, worldId)),
    getRegion: async () => JSON.parse(await redis.hget(keys.region, worldId)),
    async revisionCandidate(id, expectedDraftVersion) {
      assert.equal(id, worldId);
      const raw = await redis.hget(keys.draft, id), draft = raw && JSON.parse(raw);
      if (!draft || draft.version !== expectedDraftVersion) return { ok: false, reason: 'draft_conflict' };
      const previous = await catalog.get();
      return { ok: true, keys, worldData: draft.data, encoded: JSON.stringify(draft.data),
        world: { ...previous, revision: previous.revision + 1, regionSha256: hash(draft.data) },
        expectedRegionSha256: previous.regionSha256, expectedDraftVersion };
    },
  };
  const create = (overrides = {}) => {
    const room = createRedisRoom({ redis, prefix, worldId, worldData: data, regionSha256: initial.regionSha256,
      regionCatalog: catalog, now, authorize: async identity => !revoked.has(identity.sessionId),
      isAdmin: id => id === 'owner', officeLayout: OFFICE_LAYOUT_PENTHOUSE,
      screeningHosts: [{ venueId: 'ipic', userId: 'host' }], ...overrides });
    rooms.push(room); return room;
  };
  const identities = new Map();
  const identity = (userId, more = {}) => ({ userId, name: userId, sessionId: `${userId}-session`, expiresAt: time + 120_000, ...more });
  const join = async (room, userId, more = {}) => {
    const value = identity(userId, more); identities.set(userId, value);
    return room.request({ type: 'join', identity: value, connectionId: `${userId}-socket` });
  };
  const command = async (room, userId, message) => {
    time += 600;
    return room.request({ type: 'command', userId, connectionId: `${userId}-socket`, message });
  };
  const office = (room, user, action, more = {}) => command(room, user, { type: 'office', officeId: 'jevica-office', action, ...more });
  const visit = async (room, user) => (await room.read()).snapshot.players.find(p => p.id === user)?.office ?? null;
  const enter = async (room, user, officeId = 'jevica-office') => {
    const listed = await office(room, user, 'list');
    if (!await visit(room, user)) {
      const traveled = await command(room, user, { type: 'travel', position: listed.offices[0].entrance });
      assert.equal(traveled.ok, true, traveled.error);
    }
    const result = await office(room, user, 'enter', { officeId });
    assert.equal(result.ok, true, result.error); return result.office;
  };
  const climb = async (room, user) => {
    let at = (await visit(room, user)).position;
    while (Math.hypot(stairs[0] - at[0], stairs[1] - at[1]) > 1e-9) {
      time += 500;
      const length = Math.hypot(stairs[0] - at[0], stairs[1] - at[1]), ratio = Math.min(1, 2.4 / length);
      at = at.map((value, i) => value + (stairs[i] - value) * ratio);
      const moved = await office(room, user, 'move', { position: at, yaw: 0, layout: OFFICE_LAYOUT_PENTHOUSE });
      assert.equal(moved.ok, true, moved.error);
    }
    assert.equal((await office(room, user, 'transition', { portalId: up, layout: OFFICE_LAYOUT_PENTHOUSE })).ok, true);
  };
  return { redis, prefix, keys, catalog, create, join, identity, identities, command, office, visit, enter, climb, revoked,
    advance(ms) { time += ms; },
    async draft() { await redis.hset(keys.draft, worldId, JSON.stringify({ version: 1, data: { ...data, title: 'Published office revision' } })); },
    publish: room => room.request({ type: 'revise', actorId: 'owner', expectedDraftVersion: 1 }),
    async restored(room) { await delay(220); return room.tick(); },
  };
}

test('publication and coordinator replacement retain layout and screening permissions; uninvited residents cannot enter', options, async t => {
  const f = await setup(t); let room = f.create();
  const verifyConfiguration = async () => {
    for (const user of ['owner', 'resident', 'host', 'viewer']) assert.equal((await f.join(room, user)).ok, true);
    assert.equal((await f.enter(room, 'owner')).layout, OFFICE_LAYOUT_PENTHOUSE);
    assert.equal((await f.office(room, 'resident', 'enter')).error,'office_permission_required');
    assert.equal((await f.command(room, 'host', { type: 'travel', storeId: ipic.storeId, mode: 'enter' })).ok, true);
    assert.equal((await f.command(room, 'host', { type: 'screening', action: 'sync', venueId: 'ipic' })).canHost, true);
    assert.equal((await f.command(room, 'viewer', { type: 'travel', storeId: ipic.storeId, mode: 'enter' })).ok, true);
    assert.equal((await f.command(room, 'viewer', { type: 'screening', action: 'sync', venueId: 'ipic' })).canHost, false, 'presence in the venue is not a host grant');
  };
  await verifyConfiguration();
  await f.draft();
  const published = await f.publish(room);
  assert.equal(published.ok, true, published.error);
  assert.equal(published.disconnectedPlayers, 4);
  assert.deepEqual((await room.read()).snapshot.players, [], 'publication intentionally disconnects visits');
  assert.equal((await f.catalog.get()).revision, 2);
  await verifyConfiguration();
  await room.close(); room = f.create();
  await verifyConfiguration();
});

test('compatible coordinator checkpoints preserve floors, invited visits; retired layout configuration cannot revive the one-room office', options, async t => {
  const f = await setup(t); let room = f.create();
  for (const user of ['owner', 'guest', 'host']) assert.equal((await f.join(room, user)).ok, true);
  assert.equal((await f.command(room, 'host', { type: 'travel', storeId: ipic.storeId, mode: 'enter' })).ok, true);
  await f.enter(room, 'owner'); await f.climb(room, 'owner'); assert.equal((await f.office(room,'owner','invite',{peerId:'guest'})).ok,true);await f.enter(room, 'guest');
  const before = await f.visit(room, 'owner'), personal = await f.visit(room, 'guest');
  assert.equal(before.levelId, 'jevica-office/l1');
  await room.close(); room = f.create(); await f.restored(room);
  assert.deepEqual(await f.visit(room, 'owner'), before);
  assert.deepEqual(await f.visit(room, 'guest'), personal);
  assert.equal((await f.command(room, 'host', { type: 'screening', action: 'sync', venueId: 'ipic' })).canHost, true);
  await room.close(); room = f.create({ officeLayout: OFFICE_LAYOUT_LEGACY, screeningHosts: [] }); await f.restored(room);
  assert.deepEqual(await f.visit(room, 'owner'), before);
  assert.deepEqual(await f.visit(room, 'guest'), personal);
  assert.equal((await f.command(room, 'host', { type: 'screening', action: 'sync', venueId: 'ipic' })).canHost, false, 'checkpoint cannot restore a removed host grant');
});



test('a publication losing its atomic draft comparison retains the previous authoritative world and retries safely', options, async t => {
  const f = await setup(t), room = f.create();
  assert.equal((await f.join(room, 'owner')).ok, true); await f.enter(room, 'owner'); await f.climb(room, 'owner');
  await f.draft();
  const previousState = await f.redis.getBuffer(`${f.prefix}:state`), previousView = await room.read(), previousMeta = await f.catalog.get();
  const evalRedis = f.redis.eval.bind(f.redis); let intercepted = false;
  f.redis.eval = async (...args) => {
    if (!intercepted && args[0].startsWith('-- COMMIT_ROOM')) {
      intercepted = true;
      const draft = JSON.parse(await f.redis.hget(f.keys.draft, 'office-fixture'));
      await f.redis.hset(f.keys.draft, 'office-fixture', JSON.stringify({ ...draft, version: 2 }));
      assert.equal(await evalRedis(...args), 0, 'real Redis CAS rejects the competing draft');
      assert.deepEqual(await f.redis.getBuffer(`${f.prefix}:state`), previousState);
      assert.deepEqual(await room.read(), previousView);
      assert.deepEqual(await f.catalog.get(), previousMeta);
      assert.equal(await f.redis.llen(f.keys.history), 0);
      return 0;
    }
    return evalRedis(...args);
  };
  const result = await f.publish(room);
  assert.equal(intercepted, true);
  assert.equal(result.error, 'draft_conflict');
  assert.deepEqual(await f.visit(room, 'owner'), previousView.snapshot.players[0].office);
  const durable = JSON.parse(inflateSync(await f.redis.getBuffer(`${f.prefix}:state`)));
  assert.equal(durable.checkpoint.payload.offices.visits[0][1].levelId, 'jevica-office/l1');
  assert.deepEqual(await f.catalog.get(), previousMeta);
  assert.equal((await f.catalog.getRegion()).title, data.title);
});

test('supported district checkpoint recovery keeps configured office floors and screening authority', options, async t => {
  const { loadDistrictData } = await import('../district-data.js');
  const current = await loadDistrictData();
  // The exact supported pre-gallery revision exercises the chained recovery path.
  const { beforeTowerRaise } = await import('./district-history.js');
  const previous = beforeTowerRaise(current); delete previous.buildingInteriors;
  const f = await setup(t), config = { worldId: 'river-oaks', regionCatalog: null, regionSha256: null };
  let room = f.create({ ...config, worldData: previous });
  for (const user of ['owner', 'host']) assert.equal((await f.join(room, user)).ok, true);
  await f.enter(room, 'owner'); await f.climb(room, 'owner');
  assert.equal((await f.command(room, 'host', { type: 'travel', storeId: ipic.storeId, mode: 'enter' })).ok, true);
  const before = await f.visit(room, 'owner');
  const screening = (await room.read()).snapshot.screenings[0];
  assert.equal((await f.command(room, 'host', { type: 'screening', action: 'start', venueId: 'ipic',
    mediaId: 'ipic-fixture-v1', epoch: screening.epoch, expectedRevision: screening.revision, operationId: 'before-migration' })).ok, true);
  await room.close(); room = f.create({ ...config, worldData: current });
  const restored = await f.restored(room);
  assert.deepEqual(await f.visit(room, 'owner'), before);
  assert.equal(restored.snapshot.screenings[0].status, 'playing');
  assert.equal((await f.command(room, 'host', { type: 'screening', action: 'sync', venueId: 'ipic' })).canHost, true);
});

test('a pre-playback screening checkpoint cannot block office floor, invited visit recovery', options, async t => {
  const f = await setup(t); let room = f.create();
  for (const user of ['owner', 'guest', 'host']) assert.equal((await f.join(room, user)).ok, true);
  await f.enter(room, 'owner'); await f.climb(room, 'owner'); assert.equal((await f.office(room,'owner','invite',{peerId:'guest'})).ok,true);await f.enter(room, 'guest');
  assert.equal((await f.command(room, 'host', { type: 'travel', storeId: ipic.storeId, mode: 'enter' })).ok, true);
  const screening = (await room.read()).snapshot.screenings[0];
  const start = { type: 'screening', action: 'start', venueId: 'ipic', mediaId: 'ipic-fixture-v1',
    epoch: screening.epoch, expectedRevision: screening.revision, operationId: 'old-fixture-start' };
  assert.equal((await f.command(room, 'host', start)).ok, true);
  const upper = await f.visit(room, 'owner'), personal = await f.visit(room, 'guest');
  await room.close();
  // Synthetic historical v10 fixture: only the pre-#398 duration differs. All
  // existing checksum, membership, floor and session validation remains active.
  const durable = JSON.parse(inflateSync(await f.redis.getBuffer(`${f.prefix}:state`)));
  const saved = durable.checkpoint.payload.screenings;
  saved.venues[0].durationMs = 12_000;
  for (const receipt of saved.receipts) receipt.reply.screening.durationMs = 12_000;
  const { checksum, ...envelope } = durable.checkpoint;
  durable.checkpoint = { ...envelope, checksum: hash(envelope) };
  await f.redis.set(`${f.prefix}:state`, deflateSync(JSON.stringify(durable)));
  room = f.create();
  const restored = await f.restored(room);
  assert.deepEqual(await f.visit(room, 'owner'), upper);
  assert.deepEqual(await f.visit(room, 'guest'), personal);
  assert.equal(restored.snapshot.screenings[0].status, 'stopped');
  assert.notEqual(restored.snapshot.screenings[0].epoch, screening.epoch);
  assert.equal((await f.command(room, 'host', start)).error, 'screening_stale');
  assert.equal((await f.command(room, 'host', { type: 'screening', action: 'sync', venueId: 'ipic' })).canHost, true);
});
