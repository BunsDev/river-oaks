// The Gardens district revision (#507) through the authoritative world and both transports:
// the garage stays the default with its fingerprint unchanged; the campus revision replaces
// its collision, admits walkers through the hall doors, keeps a street walker on the ground
// under both skywalks, and tells clients which district it serves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { createGameServer } from '../app.js';
import { createDistributedServer } from '../distributed-app.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { DISTRICT_REVISION_GARDENS, campusDoorSites, isCampusRoom } from '../../preview/src/garden-campus-district.js';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusToSource } from '../../shared/garden-campus-layout.js';

// The district every current checkpoint names (main 153471bc and this branch's default).
const GARAGE_FINGERPRINT = '5fc38cbe54099258f54a199f314eb0f6910a0488dff6efe6d692037b73e38b80';
const garage = await loadDistrictData(), campus = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS });
const BASE = CAMPUS.frame.baseAltitude, env = createWalkingEnvironment(campus);
const source = ([u, v]) => campusToSource([u, v]).slice(0, 2);

function town(data = campus) {
  let time = 1000;
  const world = createSharedWorld(data, { now: () => time });
  const command = (userId, message) => { time += 150; return world.command(userId, message); };
  const player = userId => world.snapshot().players.find(p => p.id === userId);
  // Short straight poses in campus metres, each checked by the server's own sweep.
  function walk(userId, points) {
    let at = player(userId).position;
    for (const point of points) {
      const [x, n] = source(point), count = Math.max(1, Math.ceil(Math.hypot(x - at[0], n - at[1]) / 0.12));
      for (let i = 1; i <= count; i++) {
        const e = at[0] + (x - at[0]) * i / count, m = at[1] + (n - at[1]) * i / count;
        const moved = command(userId, { type: 'pose', position: [e, m, env.groundAt(e, -m)], yaw: 0, altitude: 0 });
        if (!moved.ok) return { ok: false, error: moved.error, at: [e, m] };
      }
      at = [x, n];
    }
    return { ok: true };
  }
  return { world, command, player, walk, advance(ms) { time += ms; } };
}

test('the garage stays the default district, fingerprint unchanged; the campus is a distinct revision', () => {
  assert.equal(garage.gardenCampus, undefined);
  assert.equal(createSharedWorld(garage).checkpoint().worldFingerprint, GARAGE_FINGERPRINT);
  const fingerprint = createSharedWorld(campus).checkpoint().worldFingerprint;
  assert.notEqual(fingerprint, GARAGE_FINGERPRINT);
  assert.equal(createSharedWorld(garage).districtRevision, null);
  assert.equal(createSharedWorld(campus).districtRevision, DISTRICT_REVISION_GARDENS);
});

test('a garage checkpoint never restores silently into the campus, nor the reverse', () => {
  const old = town(garage);old.world.join({ userId: 'alice', name: 'alice' });
  assert.equal(createSharedWorld(campus).restore(old.world.checkpoint()).ok, false, 'migration is explicit (#512), never a silent restore');
  const fresh = town();fresh.world.join({ userId: 'alice', name: 'alice' });
  assert.equal(createSharedWorld(garage).restore(fresh.world.checkpoint()).ok, false);
  const again = createSharedWorld(campus);
  assert.deepEqual(again.restore(fresh.world.checkpoint()), { ok: true }, 'the campus round-trips its own checkpoint');
});

test('a resident walks from the promenade through the T1 door into its hall and back out', () => {
  const t = town();
  t.world.join({ userId: 'alice', name: 'alice' });
  const arrived = t.command('alice', { type: 'travel', storeId: 'campus:T1-F1-hall', mode: 'arrive' });
  assert.equal(arrived.ok, true, arrived.error);
  assert.equal(env.roomAt(arrived.player.position[0], -arrived.player.position[1]), null, 'arrive stands outside the door');
  t.advance(1000);
  assert.deepEqual(t.walk('alice', [[26.5, 58], [24, 58], [20, 58], [12, 58]]), { ok: true });
  const inside = t.player('alice');
  assert.equal(env.roomAt(inside.position[0], -inside.position[1])?.storeId, 'campus:T1-F1-hall');
  assert.equal(inside.position[2], BASE);
  assert.deepEqual([inside.buildingId, inside.levelId], [null, null], 'the hall is street level, not a campus level');
  assert.deepEqual(t.walk('alice', [[20, 58], [26.5, 58], [30, 58]]), { ok: true });
});

test('walls, shafts and the pool refuse poses; a wrong ground height is corrected', () => {
  const t = town();
  t.world.join({ userId: 'bob', name: 'bob' });
  t.advance(1000);
  assert.equal(t.command('bob', { type: 'travel', storeId: 'campus:T1-F1-hall', mode: 'arrive' }).ok, true);
  t.advance(1000);
  // Along the facade, away from the door, the plate is solid.
  assert.equal(t.walk('bob', [[26.5, 50], [24.5, 50]]).error, 'blocked');
  t.advance(1000);
  assert.deepEqual(t.walk('bob', [[26.5, 58], [12, 58]]), { ok: true });
  assert.equal(t.walk('bob', [[11.5, 56.5], [10, 56.5]]).error, 'blocked', 'the lift shaft');
  const [x, n] = source([12, 58]);
  assert.equal(t.command('bob', { type: 'pose', position: [x, n, BASE + 0.5], yaw: 0, altitude: 0 }).error, 'invalid_ground');
});

test('under both skywalks a street walker stays on the platform and on no level', () => {
  const t = town();
  t.world.join({ userId: 'carol', name: 'carol' });
  t.advance(1000);
  assert.equal(t.command('carol', { type: 'travel', position: source([31, 76.8]) }).ok, true);
  t.advance(1000);
  for (const [path, label] of [[[[20, 76.8], [16, 76.8], [3, 76.8]], 'P2 below B12'], [[[16, 76.8], [16, 85], [26.5, 85], [26.5, 121], [16, 123]], 'below B23']]) {
    assert.deepEqual(t.walk('carol', path), { ok: true }, label);
    const at = t.player('carol');
    assert.equal(at.position[2], BASE, label);
    assert.deepEqual([at.buildingId, at.levelId, at.altitude], [null, null, 0], label);
  }
});

test('the halls and café travel like doors: enter lands inside, leave lands outside', () => {
  const t = town();
  t.world.join({ userId: 'dana', name: 'dana' });
  for (const site of campusDoorSites(campus)) {
    t.advance(2000);
    const entered = t.command('dana', { type: 'travel', storeId: site.id, mode: 'enter' });
    assert.equal(entered.ok, true, `${site.id}: ${entered.error}`);
    assert.equal(env.roomAt(entered.player.position[0], -entered.player.position[1])?.storeId, site.id);
    t.advance(2000);
    const left = t.command('dana', { type: 'travel', storeId: site.id, mode: 'leave' });
    assert.equal(left.ok, true, `${site.id}: ${left.error}`);
    assert.equal(env.roomAt(left.player.position[0], -left.player.position[1]), null);
  }
  assert.equal(env.rooms.filter(isCampusRoom).length, 4);
  // Without the campus there is no such door.
  const old = town(garage);old.world.join({ userId: 'dana', name: 'dana' });
  assert.equal(old.command('dana', { type: 'travel', storeId: 'campus:T1-F1-hall', mode: 'enter' }).error, 'invalid_destination');
});

test('a ground walker crosses all three former garage entry seams in both directions', () => {
  const paths = [
    ['E1 south', [[31, 58], [31, 4], [33.5, 0], [33.5, -2]]],
    ['E2 west', [[31, 58], [31, 76.8], [16, 76.8], [0, 76.8], [-2, 76.8]]],
    ['E3 north', [[31, 58], [31, 175], [29, 180], [29, 183]]],
  ];
  for (const [label, path] of paths) {
    const t = town();
    t.world.join({ userId: 'entry-walker', name: 'Entry walker' });
    assert.equal(t.command('entry-walker', { type: 'travel', storeId: 'campus:T1-F1-hall', mode: 'arrive' }).ok, true);
    t.advance(1000);
    assert.deepEqual(t.walk('entry-walker', path), { ok: true }, `${label}: outward sweep`);
    assert.deepEqual(t.walk('entry-walker', [...path].reverse()), { ok: true }, `${label}: inward sweep`);
    const player = t.player('entry-walker');
    assert.deepEqual([player.buildingId, player.levelId, player.altitude], [null, null, 0]);
    assert.equal(player.position[2], BASE);
  }
});

for (const distributed of [false, true]) {
  const backend = distributed ? 'distributed' : 'standalone';
  test(`${backend} world data names the served district revision for the default world only`, async t => {
    const auth = { handle: async () => false, authenticate: async req => req.headers.cookie === 'session=viewer' ? { userId: 'viewer', sessionId: 'session', expiresAt: Date.now() + 60_000 } : null };
    const worldCatalog = { get: async id => id === 'creator-region' ? { id, template: 'region-v1', regionSha256: 'a'.repeat(64) } : null, getRegion: async () => ({ title: 'Creator region' }) };
    const read = async (revision, catalog = worldCatalog) => {
      const options = { auth, waitlist: { isApproved: async () => true }, ...(catalog ? { worldCatalog: catalog } : {}), origin: 'https://town.example' };
      const app = distributed
        ? createDistributedServer({ ...options, room: { worldId: 'river-oaks', districtRevision: revision }, security: { allow: async () => true, isBanned: async () => false } })
        : createGameServer({ ...options, world: { worldId: 'river-oaks', districtRevision: revision }, moderation: { isBanned: () => false } });
      await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
      t.after(() => app.close());
      const get = async world => {
        const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/world-data?world=${world}`, { headers: { Cookie: 'session=viewer' } });
        const body = await response.json().catch(() => ({}));
        return response.ok ? body : { status: response.status, ...body };
      };
      return { home: await get('river-oaks'), creator: await get('creator-region') };
    };
    const served = await read(DISTRICT_REVISION_GARDENS);
    assert.deepEqual(served.home, { template: 'river-oaks', districtRevision: DISTRICT_REVISION_GARDENS });
    assert.equal(served.creator.districtRevision, undefined);
    assert.deepEqual((await read(null)).home, { template: 'river-oaks' });
    // A town without a world catalog (the loopback fixture) still names its campus.
    assert.deepEqual((await read(DISTRICT_REVISION_GARDENS, null)).home, { template: 'river-oaks', districtRevision: DISTRICT_REVISION_GARDENS });
    // The garage loopback fixture has neither: the served world still answers, so every
    // page load does not log a 404 for the world it is standing in; others stay unknown.
    const garage = await read(null, null);
    assert.deepEqual(garage.home, { template: 'river-oaks' });
    assert.deepEqual(garage.creator, { status: 404, error: 'World not found.' });
  });
}

for (const mode of ['memory', 'redis']) test(`${mode}: the first town snapshot names the campus revision through real ticket/WebSocket gates`, { skip: mode === 'redis' && !process.env.REDIS_URL }, async t => {
  const origin = 'http://127.0.0.1';
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true,
    authenticate: async req => req.headers.cookie === 'fixture=viewer' ? { userId: 'viewer', name: 'viewer', sessionId: 'viewer', csrfToken: 'test-csrf', expiresAt: Date.now() + 60000 } : null };
  const first = async data => {
    let redis = null, security = null;const namespace = `river-oaks:campus-test:${randomUUID()}`;
    if (mode === 'redis') { redis = new Redis(process.env.REDIS_URL);security = createRedisSecurity({ redis, prefix: `{${namespace}}` }); }
    const app = mode === 'redis' ? createWorldGateway({ redis, namespace, worldData: data, auth, security, waitlist: approvedWaitlist, origin })
      : createGameServer({ world: createSharedWorld(data), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent' });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    t.after(async () => { await app.close();security?.close();if (redis) { const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); } });
    const response = await fetch(`${base}/api/multiplayer/ticket`, { method: 'POST', headers: { Origin: origin, Cookie: 'fixture=viewer', 'X-CSRF-Token': 'test-csrf' } });
    assert.equal(response.status, 200);
    const { ticket } = await response.json();
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers: { Origin: origin, Cookie: 'fixture=viewer' } });
    const snapshot = await new Promise((resolve, reject) => { ws.once('error', reject);ws.on('message', raw => { const value = JSON.parse(raw);if (value.type === 'snapshot') resolve(value); }); });
    ws.terminate();
    return snapshot;
  };
  assert.equal((await first(campus)).districtRevision, DISTRICT_REVISION_GARDENS);
  assert.equal(Object.hasOwn(await first(garage), 'districtRevision'), false, 'the garage default adds nothing to snapshots');
});
