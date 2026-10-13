import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryVoiceLeases, createRedisVoiceLeases, VOICE_LEASE_TTL_MS } from '../voice.js';

const live = { skip: !process.env.REDIS_URL, timeout: 30_000 };
const lease = (userId, connectionId, space = 'outdoor', time = 0) => ({
  userId, worldId: 'river-oaks', space, room: `river-oaks.test.v1.river-oaks.${space}`, participantIdentity: `p-${userId.replace(/[^A-Za-z0-9_-]/g, '')}-${connectionId}`,
  connectionId, issuedAt: time, expiresAt: time + VOICE_LEASE_TTL_MS, revision: 0,
});
const plain = value => JSON.parse(JSON.stringify(value));

async function memoryStore(t, clock) { return { leases: createMemoryVoiceLeases({ now: clock }) }; }
async function redisStore(t, clock) {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on('error', () => {});
  const prefix = `{river-oaks:test:${randomUUID()}}`;
  t.after(async () => {
    const keys = await redis.keys(prefix + ':*');
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });
  return { leases: createRedisVoiceLeases({ redis, prefix, now: clock }), redis, prefix };
}

for (const [name, make, options] of [['memory', memoryStore, {}], ['redis', redisStore, live]]) {
  test(`${name}: issue, touch and release are fenced by connectionId, so a stale browser cannot remove its successor`, options, async t => {
    let time = 1_000_000;
    const { leases } = await make(t, () => time);
    assert.deepEqual(plain(await leases.issue(lease('alice', 'c1', 'outdoor', time))), { status: 'ok', replaced: null });
    assert.equal(await leases.touch('alice', 'c2', time + VOICE_LEASE_TTL_MS), null, 'another connection cannot renew');
    time += 10_000;
    const touched = await leases.touch('alice', 'c1', time + VOICE_LEASE_TTL_MS);
    assert.equal(touched.connectionId, 'c1');
    assert.equal(touched.expiresAt, time + VOICE_LEASE_TTL_MS);
    assert.equal(touched.revision, 1);
    assert.equal(await leases.release('alice', 'c2'), null, 'another connection cannot release');
    assert.equal((await leases.getMany(['alice'])).get('alice').connectionId, 'c1');
    assert.equal((await leases.release('alice', 'c1')).participantIdentity, 'p-alice-c1');
    assert.equal((await leases.getMany(['alice'])).size, 0);
    assert.equal(await leases.release('alice', 'c1'), null);
    assert.equal(await leases.revoke('alice'), null);
  });

  test(`${name}: a lease expires without renewal and reads omit it`, options, async t => {
    let time = 1_000_000;
    const { leases } = await make(t, () => time);
    await leases.issue(lease('alice', 'c1', 'outdoor', time));
    time += VOICE_LEASE_TTL_MS - 1;
    assert.equal((await leases.getMany(['alice'])).size, 1);
    time += 2;
    assert.equal((await leases.getMany(['alice'])).size, 0);
    assert.deepEqual(await leases.members('river-oaks.test.v1.river-oaks.outdoor'), []);
    assert.deepEqual(await leases.rooms(), []);
    assert.equal(await leases.touch('alice', 'c1', time + VOICE_LEASE_TTL_MS), null);
    assert.deepEqual(plain(await leases.issue(lease('alice', 'c1', 'outdoor', time))), { status: 'ok', replaced: null }, 'an expired lease is not reported as replaced');
  });

  test(`${name}: re-issuing for the same user replaces the lease and reports the replaced participant`, options, async t => {
    let time = 1_000_000;
    const { leases } = await make(t, () => time);
    await leases.issue(lease('alice', 'c1', 'outdoor', time));
    const result = await leases.issue(lease('alice', 'c2', 'osm-node-1', time));
    assert.equal(result.status, 'ok');
    assert.equal(result.replaced.connectionId, 'c1');
    assert.equal(result.replaced.participantIdentity, 'p-alice-c1');
    assert.equal((await leases.getMany(['alice'])).get('alice').connectionId, 'c2');
    assert.deepEqual(await leases.members('river-oaks.test.v1.river-oaks.outdoor'), []);
    assert.deepEqual(plain(await leases.members('river-oaks.test.v1.river-oaks.osm-node-1')), [{ userId: 'alice', participantIdentity: 'p-alice-c2', connectionId: 'c2', expiresAt: time + VOICE_LEASE_TTL_MS }]);
  });

  test(`${name}: the namespace holds at most maxLeases concurrent leases`, options, async t => {
    let time = 1_000_000;
    const { leases } = await make(t, () => time);
    assert.equal((await leases.issue(lease('alice', 'c1', 'outdoor', time), { maxLeases: 2 })).status, 'ok');
    assert.equal((await leases.issue(lease('bob', 'c1', 'outdoor', time), { maxLeases: 2 })).status, 'ok');
    assert.equal((await leases.issue(lease('carol', 'c1', 'outdoor', time), { maxLeases: 2 })).status, 'capacity');
    assert.equal((await leases.issue(lease('alice', 'c2', 'outdoor', time), { maxLeases: 2 })).status, 'ok', 'replacing an own lease needs no new slot');
    assert.equal((await leases.getMany(['carol'])).size, 0);
    await leases.release('bob', 'c1');
    assert.equal((await leases.issue(lease('carol', 'c1', 'outdoor', time), { maxLeases: 2 })).status, 'ok');
    time += VOICE_LEASE_TTL_MS + 1;
    assert.equal((await leases.issue(lease('dave', 'c1', 'outdoor', time), { maxLeases: 2 })).status, 'ok', 'expired leases free their slots');
  });

  test(`${name}: members and rooms list live leases per room`, options, async t => {
    let time = 1_000_000;
    const { leases } = await make(t, () => time);
    await leases.issue(lease('alice', 'c1', 'outdoor', time));
    await leases.issue(lease('bob', 'c1', 'osm-node-1', time));
    await leases.issue(lease('carol', 'c1', 'osm-node-1', time));
    assert.deepEqual([...await leases.rooms()].sort(), ['river-oaks.test.v1.river-oaks.osm-node-1', 'river-oaks.test.v1.river-oaks.outdoor']);
    assert.deepEqual((await leases.members('river-oaks.test.v1.river-oaks.osm-node-1')).map(member => member.userId).sort(), ['bob', 'carol']);
    assert.deepEqual(await leases.members('river-oaks.test.v1.river-oaks.nowhere'), []);
    const many = await leases.getMany(['alice', 'bob', 'carol', 'nobody']);
    assert.deepEqual([...many.keys()].sort(), ['alice', 'bob', 'carol']);
    await assert.rejects(() => leases.getMany(Array(65).fill('alice')));
  });
}

test('redis: keys never contain the account id and share the namespace hash tag', live, async t => {
  let time = 1_000_000;
  const { leases, redis, prefix } = await redisStore(t, () => time);
  await leases.issue(lease('alice@example.com', 'c1', 'outdoor', time));
  const keys = await redis.keys(prefix + ':*');
  assert.ok(keys.length >= 1);
  for (const key of keys) {
    assert.ok(key.startsWith(prefix + ':voice:v1:'), key);
    assert.doesNotMatch(key, /alice/);
  }
  assert.throws(() => createRedisVoiceLeases({ redis, prefix: 'no-hash-tag' }));
});

test('memory and redis stores answer the same scripted sequence identically', live, async t => {
  const script = async (leases, clock) => {
    const out = [];
    const push = value => out.push(plain(value instanceof Map ? [...value] : value));
    push(await leases.issue(lease('alice', 'c1', 'outdoor', clock())));
    push(await leases.issue(lease('bob', 'c1', 'osm-node-1', clock()), { maxLeases: 2 }));
    push(await leases.issue(lease('carol', 'c1', 'osm-node-1', clock()), { maxLeases: 2 }));
    push(await leases.touch('alice', 'c1', clock() + VOICE_LEASE_TTL_MS));
    push(await leases.touch('alice', 'c9', clock() + VOICE_LEASE_TTL_MS));
    push(await leases.issue(lease('alice', 'c2', 'osm-node-1', clock())));
    push(await leases.release('bob', 'c2'));
    push(await leases.release('bob', 'c1'));
    push(await leases.revoke('nobody'));
    push(await leases.getMany(['alice', 'bob', 'carol']));
    push((await leases.members('river-oaks.test.v1.river-oaks.osm-node-1')).sort((a, b) => a.userId.localeCompare(b.userId)));
    push([...await leases.rooms()].sort());
    push(await leases.revoke('alice'));
    push(await leases.getMany(['alice']));
    return out;
  };
  let memoryTime = 5_000_000, redisTime = 5_000_000;
  const memory = await script((await memoryStore(t, () => memoryTime)).leases, () => memoryTime);
  const redis = await script((await redisStore(t, () => redisTime)).leases, () => redisTime);
  assert.deepEqual(redis, memory);
});
