// Hardening follow-up: a flood of sign-ups cannot fill the waitlist and lock
// out real people. A full list gives up its oldest pending request; approved
// and refused residents are never removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createFileWaitlist, createRedisWaitlist } from '../waitlist.js';

const stores = [['file', async (t, options) => {
  const directory = await mkdtemp(join(tmpdir(), 'river-oaks-waitlist-cap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { waitlist: await createFileWaitlist(join(directory, 'waitlist.json'), options) };
}]];
if (process.env.REDIS_URL) stores.push(['redis', async (t, options) => {
  const redis = new Redis(process.env.REDIS_URL); redis.on('error', () => {});
  const prefix = `{river-oaks:waitlist-cap:${randomUUID()}}`;
  t.after(async () => { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  return { waitlist: createRedisWaitlist({ redis, prefix, ...options }), redis, prefix };
}]);

for (const [name, open] of stores) {
  test(`${name}: a full waitlist gives up its oldest pending request, never a decided resident`, async t => {
    let time = 1_800_000_000_000;
    const { waitlist } = await open(t, { admins: ['admin'], now: () => time, maxRequests: 3 });
    const ask = async userId => { time += 1000; return waitlist.request({ userId, name: userId }); };
    await ask('approved-early'); await ask('pending-1'); await ask('pending-2');
    await waitlist.decide({ userId: 'approved-early', approved: true, actorId: 'admin' });
    assert.equal((await ask('newcomer')).status, 'pending', 'a new request is admitted, not refused');
    const ids = (await waitlist.list()).map(record => record.userId).sort();
    assert.deepEqual(ids, ['approved-early', 'newcomer', 'pending-2'], 'the oldest pending request made room');
    assert.equal(await waitlist.isApproved('approved-early'), true);
    // Someone whose request gave way simply asks again.
    assert.equal((await ask('pending-1')).status, 'pending');
    assert.deepEqual((await waitlist.list()).map(record => record.userId).sort(), ['approved-early', 'newcomer', 'pending-1']);
  });

  test(`${name}: a list with no pending requests refuses instead of removing residents`, async t => {
    let time = 1_800_000_000_000;
    const { waitlist } = await open(t, { admins: ['admin'], now: () => time, maxRequests: 2 });
    for (const userId of ['resident-a', 'resident-b']) { time += 1000; await waitlist.request({ userId, name: userId }); await waitlist.decide({ userId, approved: userId === 'resident-a', actorId: 'admin' }); }
    await assert.rejects(waitlist.request({ userId: 'newcomer', name: 'newcomer' }), /Waitlist capacity reached/);
    assert.deepEqual((await waitlist.list()).map(record => record.userId).sort(), ['resident-a', 'resident-b']);
  });
}

if (process.env.REDIS_URL) test('redis: requests from before the pending index, and ones decided since, are handled', async t => {
  let time = 1_800_000_000_000;
  const [, open] = stores.find(([name]) => name === 'redis');
  const { waitlist, redis, prefix } = await open(t, { admins: ['admin'], now: () => time, maxRequests: 3 });
  // Rows written before the index existed.
  for (const userId of ['legacy-1', 'legacy-2']) await redis.hset(`${prefix}:waitlist:users`, userId, JSON.stringify({ userId, name: userId, email: '', status: 'pending', requestedAt: new Date(time).toISOString() }));
  time += 1000; await waitlist.request({ userId: 'indexed', name: 'indexed' });
  await waitlist.decide({ userId: 'indexed', approved: true, actorId: 'admin' });
  time += 1000; await waitlist.request({ userId: 'newcomer', name: 'newcomer' });
  const ids = (await waitlist.list()).map(record => record.userId).sort();
  assert.equal(ids.includes('indexed'), true, 'a request decided after it was indexed is never evicted');
  assert.equal(ids.includes('newcomer'), true);
  assert.equal(ids.filter(id => id.startsWith('legacy')).length, 1, 'a legacy pending request made room');
  assert.equal(await redis.hlen(`${prefix}:waitlist:users`), 3);
});
