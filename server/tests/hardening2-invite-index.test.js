// Hardening follow-up: listing or revoking one owner's invites reads only that
// owner's index, not the whole (up to 50,000-row) table, and a full table
// forgets long-expired invites before it refuses a new one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createRedisWaitlist } from '../waitlist.js';
import { newInvite, INVITE_LIFETIME, INVITE_RETENTION } from '../invitations.js';

const redisTest = (name, fn) => test(name, { skip: !process.env.REDIS_URL }, fn);
async function fixture(t, options = {}) {
  const redis = new Redis(process.env.REDIS_URL); redis.on('error', () => {});
  const prefix = `{river-oaks:invite-index:${randomUUID()}}`;
  t.after(async () => { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  let time = 1_800_000_000_000;
  const waitlist = createRedisWaitlist({ redis, prefix, admins: ['admin'], now: () => time, ...options });
  const table = `${prefix}:waitlist:invites`;
  const approve = async userId => { await waitlist.request({ userId, name: userId }); await waitlist.decide({ userId, approved: true, actorId: 'admin' }); };
  const plant = (ownerId, at = time) => { const invite = newInvite(ownerId, 'admin', at); return redis.hset(table, invite.id, JSON.stringify(invite)).then(() => invite); };
  return { redis, waitlist, table, approve, plant, advance: ms => { time += ms; } };
}
const ids = list => list.map(invite => invite.id).sort();

redisTest('an owner from before the index is indexed once, then listing reads only the index', async t => {
  const f = await fixture(t);
  await f.approve('owner-a'); await f.approve('owner-b');
  const starters = await f.waitlist.listInvites({ userId: 'owner-a' });
  assert.equal(starters.length, 2, 'starter invites are listed');
  // Rows written before the index existed (a direct write, as on old servers).
  await f.redis.del(...(await f.redis.keys('*:waitlist:invites:owner:*')));
  const legacy = [await f.plant('owner-a'), await f.plant('owner-a')];
  const others = await f.waitlist.listInvites({ userId: 'owner-b' });
  const first = await f.waitlist.listInvites({ userId: 'owner-a' });
  assert.deepEqual(ids(first), ids([...starters, ...legacy]), 'the one-time scan finds every legacy invite');
  assert.equal(first.every(invite => invite.ownerId === 'owner-a'), true);
  assert.equal(others.every(invite => invite.ownerId === 'owner-b'), true);
  // An unindexed row is invisible to later listings: they no longer read the table.
  await f.plant('owner-a');
  assert.deepEqual(ids(await f.waitlist.listInvites({ userId: 'owner-a' })), ids(first));
  // Invites issued from now on are indexed as they are written.
  const issued = await f.waitlist.issueInvite({ actorId: 'admin', ownerId: 'owner-a' });
  assert.equal((await f.waitlist.listInvites({ userId: 'owner-a' })).some(invite => invite.id === issued.id), true);
  assert.equal((await f.waitlist.listInvites({ userId: 'admin' })).length >= 7, true, 'administrators still see the whole table');
});

redisTest('revoking an owner reaches every one of their invites, legacy included, and nobody else\'s', async t => {
  const f = await fixture(t);
  await f.approve('owner-a'); await f.approve('owner-b');
  await f.redis.del(...(await f.redis.keys('*:waitlist:invites:owner:*')));
  await f.plant('owner-a');
  await f.waitlist.revokeInvites({ userId: 'owner-a', actorId: 'admin' });
  const statuses = owner => f.redis.hvals(f.table).then(rows => rows.map(raw => JSON.parse(raw)).filter(i => i.ownerId === owner).map(i => i.status));
  assert.deepEqual([...new Set(await statuses('owner-a'))], ['revoked']);
  assert.deepEqual([...new Set(await statuses('owner-b'))], ['active']);
});

redisTest('a full table forgets long-expired invites before refusing a new one', async t => {
  const f = await fixture(t, { inviteCapacity: 4 });
  await f.approve('owner-a');
  const stale = await f.plant('owner-a', 1_800_000_000_000 - INVITE_LIFETIME - INVITE_RETENTION - 1000);
  await f.plant('owner-a');
  assert.equal(await f.redis.hlen(f.table), 4, 'full: two starters, one stale, one current');
  await f.waitlist.issueInvite({ actorId: 'admin', ownerId: 'owner-a' });
  assert.equal(await f.redis.hexists(f.table, stale.id), 0, 'the long-expired invite made room');
  await assert.rejects(f.waitlist.issueInvite({ actorId: 'admin', ownerId: 'owner-a' }), /Invitation capacity reached/, 'current invites are never forgotten');
});
