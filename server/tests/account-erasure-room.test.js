import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { deflateSync, inflateSync } from 'node:zlib';
import Redis from 'ioredis';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createWorldGateway } from '../world-gateway.js';
import { accountPrefixFor } from '../world-keys.js';
import { createSharedWorld } from '../world.js';
import { createMemoryCyclingMiles } from '../cycling-miles.js';
import { createAccountErasure } from '../account-erasure.js';
import { createWorkOSDeletionHandler } from '../workos-deletion.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonRack } from '../../preview/src/plaza-salon-plan.js';
import { approvedWaitlist } from './waitlist-fixture.js';

// Account erasure (#292) through a hosted world: the room's one writer forgets the account,
// its rides included, and a room that cannot do so fails the erasure for a retry.
const origin = 'https://sim.jev.works', secret = 'local-erasure-webhook-fixture';
const district = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url), 'utf8'));
const environment = createWalkingEnvironment(district), slot = plazaSalonRack(district)[1];
const west = metres => [slot.x - metres, slot.north, environment.groundAt(slot.x - metres, -slot.north)];

test('a room that cannot forget the account fails its erasure, and the webhook asks WorkOS to retry', async t => {
  t.mock.method(console, 'warn', () => {});
  const security = { allow: async () => true, isBanned: async () => false, consumeTicket: async () => false, issueTicket: async () => null };
  const asked = [];
  const room = { worldId: 'river-oaks', read: async () => null, tick: async () => null,
    request: async operation => { asked.push(operation.type);return operation.type === 'forget' ? { ok: false, error: 'world_busy' } : { ok: true }; } };
  const app = createDistributedServer({ auth: { authenticate: async () => null, handle: async () => false }, security, room, waitlist: approvedWaitlist, origin });
  t.after(() => app.close());
  await assert.rejects(app.forgetAccount('user_erin'), /World erasure did not complete/);
  assert.deepEqual(asked, ['forget']);
  const eraseAccount = createAccountErasure({ tombstone: async () => {}, revoke: async () => {}, steps: { world: id => app.forgetAccount(id) } });
  const webhook = createWorkOSDeletionHandler({ secret, onDelete: (id, eventId) => eraseAccount(id, { eventId }) });
  const body = JSON.stringify({ id: 'event_roomrefused', event: 'user.deleted', data: { object: 'user', id: 'user_erin' } }), timestamp = Date.now();
  const server = createServer(async (req, res) => { if (!await webhook(req, res)) { res.writeHead(404);res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/workos/events`, { method: 'POST', body, headers: {
    'Content-Type': 'application/json', 'workos-signature': `t=${timestamp}, v1=${createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex')}` } });
  assert.equal(response.status, 503);
});

// Erin rides a bicycle in a hosted room; the ride store holds each add until released.
async function ridingRoom(t) {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const prefix = `{river-oaks:erasure-room:${randomUUID()}}`, clock = { time: Date.UTC(2026, 9, 26, 16) }, rooms = [], held = [], adds = [];
  let closing = false;
  const release = () => { for (const open of held.splice(0)) open(); };
  t.after(async () => {
    // A failed check can leave an add held; the rooms close only once it is answered.
    closing = true;release();await Promise.all(rooms.map(room => room.close()));
    const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit();
  });
  const identity = { userId: 'user_erin', name: 'Erin', sessionId: 'erin-session', expiresAt: clock.time + 600_000 };
  const first = createRedisRoom({ redis, prefix, worldData: district, authorize: async () => true, now: () => clock.time });
  assert.equal((await first.request({ type: 'join', identity, connectionId: 'erin-socket' })).ok, true);
  await first.close();
  // The stored checkpoint, with Erin five metres into a ride.
  const envelope = JSON.parse(inflateSync(await redis.getBuffer(`${prefix}:state`)).toString('utf8'));
  const world = createSharedWorld(district, { now: () => clock.time });
  assert.equal(world.restore(envelope.checkpoint).ok, true);
  const [x, north] = slot.approach;
  Object.assign(world.players.get('user_erin'), { position: [x, north, environment.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 });
  assert.equal(world.command('user_erin', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 }).ok, true);
  clock.time += 1000;
  assert.equal(world.command('user_erin', { type: 'pose', position: west(5), yaw: 0, altitude: 0, vehicle: 'bicycle' }).ok, true);
  await redis.set(`${prefix}:state`, deflateSync(JSON.stringify({ ...envelope, checkpoint: world.checkpoint() })));
  const totals = createMemoryCyclingMiles();
  const cyclingMiles = { ...totals, add(...args) {
    const added = closing ? totals.add(...args) : new Promise(resolve => held.push(() => resolve(totals.add(...args))));adds.push(added);return added;
  } };
  const room = createRedisRoom({ redis, prefix, worldData: district, authorize: async () => true, now: () => clock.time, cyclingMiles });rooms.push(room);
  // Every add the room has made, answered: what a released add would bank is banked.
  const answered = async () => { release();await Promise.allSettled(adds); };
  return { room, totals, held, release, answered };
}

test('a ride drained in the tick that forgets the account is never banked', { skip: !process.env.REDIS_URL, timeout: 30_000 }, async t => {
  const f = await ridingRoom(t);
  // The forget is the first operation of the first tick, which also drains Erin's ride.
  assert.equal((await f.room.request({ type: 'forget', userId: 'user_erin' })).ok, true);
  await f.totals.eraseUser('user_erin');
  await new Promise(resolve => setTimeout(resolve, 50));
  await f.answered();
  assert.equal(await f.totals.rank('user_erin'), null);
});

test('a ride already on its way to the store is banked before the forget answers, so the erasure after it finds it', { skip: !process.env.REDIS_URL, timeout: 30_000 }, async t => {
  const f = await ridingRoom(t);
  await f.room.tick();
  for (let i = 0;i < 50 && !f.held.length;i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.held.length, 1, 'the tick sent the ride');
  let answered = false;
  const forgetting = f.room.request({ type: 'forget', userId: 'user_erin' }).then(result => { answered = true;return result; });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(answered, false, 'the forget waits for the ride in flight');
  f.release();
  assert.equal((await forgetting).ok, true);
  await f.totals.eraseUser('user_erin');
  await new Promise(resolve => setTimeout(resolve, 50));await f.answered();
  assert.equal(await f.totals.rank('user_erin'), null);
});

test('a hosted world that cannot forget the account fails the step only after every other world has forgotten it', { skip: !process.env.REDIS_URL, timeout: 30_000 }, async t => {
  t.mock.method(console, 'warn', () => {});
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const namespace = `river-oaks:erasure-worlds:${randomUUID()}`, security = createRedisSecurity({ redis, prefix: `{${namespace}}` });
  const auth = { handle: async () => false, isSessionActive: async () => true, close() {}, authenticate: async () => null };
  const gateway = createWorldGateway({ redis, namespace, worldData: district, auth, security, waitlist: approvedWaitlist, origin });
  t.after(async () => { await gateway.close();security.close();const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const region = JSON.parse(await readFile(new URL('../../preview/public/data/sample-region.json', import.meta.url), 'utf8'));
  assert.equal((await gateway.catalog.publish({ id: 'moon-garden', title: 'Moon Garden', region }, 'owner')).ok, true);
  // The configured world is reached first and cannot forget anyone; the account is in the second.
  const broken = await gateway.worldFor('river-oaks'), other = await gateway.worldFor('moon-garden');
  broken.game.forgetAccount = async () => { throw new Error('world unavailable'); };
  const identity = { userId: 'user_erin', name: 'Erin', sessionId: 'erin-session', expiresAt: Date.now() + 600_000 };
  assert.equal((await other.room.request({ type: 'join', identity, connectionId: 'erin-socket' })).ok, true);
  await assert.rejects(gateway.accountSteps.worlds('user_erin'), /world unavailable/);
  assert.equal((await other.room.read()).snapshot.players.some(player => player.id === 'user_erin'), false, 'the other world forgot the account');
});

test('a hosted world whose landmarks cannot be erased fails the step only after every other world\'s landmarks are', { skip: !process.env.REDIS_URL, timeout: 30_000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const namespace = `river-oaks:erasure-landmarks:${randomUUID()}`, security = createRedisSecurity({ redis, prefix: `{${namespace}}` });
  const landmarksOf = worldId => `${accountPrefixFor(namespace, worldId)}:landmarks:${createHash('sha256').update('user_erin').digest('hex')}`;
  // The configured world's landmark store is unreachable; every other key works.
  const broken = landmarksOf('river-oaks');
  const flaky = new Proxy(redis, { get(target, name) {
    if (name === 'del') return (...keys) => keys.includes(broken) ? Promise.reject(new Error('landmarks unavailable')) : target.del(...keys);
    const value = target[name];return typeof value === 'function' ? value.bind(target) : value;
  } });
  const auth = { handle: async () => false, isSessionActive: async () => true, close() {}, authenticate: async () => null };
  const gateway = createWorldGateway({ redis: flaky, namespace, worldData: district, auth, security, waitlist: approvedWaitlist, origin });
  t.after(async () => { await gateway.close();security.close();const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const region = JSON.parse(await readFile(new URL('../../preview/public/data/sample-region.json', import.meta.url), 'utf8'));
  assert.equal((await gateway.catalog.publish({ id: 'moon-garden', title: 'Moon Garden', region }, 'owner')).ok, true);
  await redis.set(landmarksOf('moon-garden'), 'erin-landmarks');
  await assert.rejects(gateway.accountSteps.landmarks('user_erin'), /landmarks unavailable/);
  assert.equal(await redis.exists(landmarksOf('moon-garden')), 0, 'the other world\'s landmarks are erased');
});
