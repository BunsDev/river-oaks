import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import Redis from 'ioredis';
import { normalizeVercelRoute } from '../vercel-routing.js';
import { createAccountErasure, createErasureSweepRoute, createMemoryPendingErasures, createRedisPendingErasures, eraseEach } from '../account-erasure.js';

// Account erasure (#292) keeps a durable record of every request until a second pass
// after the request timeout has run, retries what failed, and names the provider's
// event in every failure it logs.
const redisUrl = process.env.REDIS_URL;
const settle = () => new Promise(resolve => setImmediate(resolve));
function gate() { let open;const shut = new Promise(resolve => { open = resolve; });return { shut, open }; }
async function redisPending(t) {
  const redis = new Redis(redisUrl), prefix = `{erasure-pending:${randomUUID()}}`;redis.on('error', () => {});
  t.after(async () => { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  return { redis, prefix, pending: createRedisPendingErasures({ redis, prefix }) };
}
// One account's erasure with steps that record when they ran.
function fixture({ pending = createMemoryPendingErasures(), steps = {}, after = {}, settleMs = 60_000 } = {}) {
  const clock = { time: 1_000_000 }, order = [];
  const eraseAccount = createAccountErasure({ tombstone: async id => order.push(`tombstone:${id}`), revoke: async id => order.push(`revoke:${id}`),
    steps: { profile: async () => order.push('profile'), ...steps }, after, pending, settleMs, now: () => clock.time });
  return { eraseAccount, pending, clock, order };
}

test('the after stage starts only once every step has settled, a failed one included', async () => {
  const slow = gate(), started = [];
  const f = fixture({ steps: { world: async () => { started.push('world');await slow.shut;throw new Error('world busy'); } },
    after: { rides: async () => started.push('rides') } });
  const running = f.eraseAccount('user_erin');
  for (let i = 0;i < 5;i++) await settle();
  assert.deepEqual(started, ['world'], 'a world still forgetting the account can bank its rides');
  slow.open();
  await assert.rejects(running, /Account erasure incomplete/);
  assert.deepEqual(started, ['world', 'rides'], 'the after stage still runs, and the run fails');
});

test('every failure names the provider event, the tombstone and the revocation included, and never the account', async t => {
  const warnings = [];t.mock.method(console, 'warn', line => warnings.push(JSON.parse(line)));
  for (const [stage, options] of [['tombstone', { tombstone: async () => { throw new Error('user_erin'); } }], ['revoke', { revoke: async () => { throw new Error('user_erin'); } }]]) {
    const ran = [];
    const eraseAccount = createAccountErasure({ tombstone: async () => {}, revoke: async () => {}, steps: { profile: async () => ran.push('profile') }, ...options });
    await assert.rejects(eraseAccount('user_erin', { eventId: `event_${stage}` }), /Account erasure incomplete/);
    assert.deepEqual(ran, [], `nothing is erased while the account can still sign in (${stage})`);
    assert.deepEqual(warnings.at(-1), { event: 'account_erasure_incomplete', eventId: `event_${stage}`, steps: [stage] });
  }
  const eraseAccount = createAccountErasure({ tombstone: async () => {}, revoke: async () => {}, steps: { profile: async () => { throw new Error('user_erin'); } } });
  await assert.rejects(eraseAccount('user_erin'), /Account erasure incomplete/);
  assert.deepEqual(warnings.at(-1), { event: 'account_erasure_incomplete', eventId: null, steps: ['profile'] }, 'a request without a provider event');
  assert.equal(JSON.stringify(warnings).includes('user_erin'), false);
});

function pendingContract(name, make) {
  const options = name === 'Redis' ? { skip: !redisUrl } : {};
  test(`${name}: a request is recorded before it runs and kept until the second pass`, options, async t => {
    const pending = await make(t), seen = [];
    const f = fixture({ pending, steps: { look: async () => seen.push(await pending.list()) } });
    await f.eraseAccount('user_erin', { eventId: 'event_first' });
    assert.deepEqual(seen[0], [['user_erin', { eventId: 'event_first', settleAt: null }]], 'recorded before any store is erased');
    assert.deepEqual(await pending.list(), [['user_erin', { eventId: 'event_first', settleAt: 1_060_000 }]], 'the second pass waits for the request timeout');
    // Not due yet: the sweep leaves it alone.
    f.order.length = 0;
    assert.deepEqual(await f.eraseAccount.sweep(), { finished: 0, failed: 0, waiting: 1 });
    assert.deepEqual(f.order, []);
    f.clock.time += 60_000;
    assert.deepEqual(await f.eraseAccount.sweep(), { finished: 1, failed: 0, waiting: 0 });
    assert.deepEqual(f.order, ['tombstone:user_erin', 'revoke:user_erin', 'profile'], 'the second pass is a whole run');
    assert.deepEqual(await pending.list(), [], 'and then nothing about the account is left');
  });
  test(`${name}: a failed or interrupted request stays recorded and the sweep finishes it`, options, async t => {
    const pending = await make(t);let broken = true;
    t.mock.method(console, 'warn', () => {});
    const f = fixture({ pending, steps: { social: async () => { if (broken) throw new Error('down'); } } });
    await assert.rejects(f.eraseAccount('user_erin', { eventId: 'event_failed' }));
    assert.deepEqual(await pending.list(), [['user_erin', { eventId: 'event_failed', settleAt: null }]]);
    assert.deepEqual(await f.eraseAccount.sweep(), { finished: 0, failed: 1, waiting: 0 }, 'still down');
    broken = false;
    assert.deepEqual(await f.eraseAccount.sweep(), { finished: 1, failed: 0, waiting: 0 });
    assert.deepEqual(await pending.list(), [['user_erin', { eventId: 'event_failed', settleAt: 1_060_000 }]], 'a finished retry still waits for its second pass');
    // Another account's record is its own.
    await f.eraseAccount('user_kim', { eventId: 'event_kim' });
    f.clock.time += 60_000;
    assert.deepEqual(await f.eraseAccount.sweep(), { finished: 2, failed: 0, waiting: 0 });
    assert.deepEqual(await pending.list(), []);
  });
  test(`${name}: a second pass keeps a newer request that another server recorded meanwhile`, options, async t => {
    const pending = await make(t);let newer = false;
    const f = fixture({ pending, steps: { another: async () => { if (newer) await pending.put('user_erin', { eventId: 'event_second', settleAt: null }); } } });
    await f.eraseAccount('user_erin', { eventId: 'event_first' });
    f.clock.time += 60_000;newer = true;
    assert.deepEqual(await f.eraseAccount.sweep(), { finished: 1, failed: 0, waiting: 0 });
    assert.deepEqual(await pending.list(), [['user_erin', { eventId: 'event_second', settleAt: null }]]);
  });
}
pendingContract('memory', async () => createMemoryPendingErasures());
pendingContract('Redis', async t => (await redisPending(t)).pending);
test('Redis: a damaged or unfamiliar record is retried as a first pass, rewritten, and dropped after its second', { skip: !redisUrl }, async t => {
  const { redis, prefix, pending } = await redisPending(t);
  // Unparseable, keys in another order, a missing field, a field this code does not write.
  const raws = ['{not json', '{"settleAt":1,"eventId":"e"}', '{"settleAt":1}', '{"eventId":"e","settleAt":1,"v":2}'];
  for (const [index, raw] of raws.entries()) await redis.hset(`${prefix}:erasure:pending:v1`, `user_${index}`, raw);
  const f = fixture({ pending });
  assert.deepEqual(await f.eraseAccount.sweep(), { finished: 4, failed: 0, waiting: 0 });
  assert.deepEqual((await pending.list()).sort(), [['user_0', { eventId: null, settleAt: 1_060_000 }], ['user_1', { eventId: 'e', settleAt: 1_060_000 }],
    ['user_2', { eventId: null, settleAt: 1_060_000 }], ['user_3', { eventId: 'e', settleAt: 1_060_000 }]]);
  f.clock.time += 60_000;
  assert.deepEqual(await f.eraseAccount.sweep(), { finished: 4, failed: 0, waiting: 0 });
  assert.deepEqual(await pending.list(), [], 'none is kept for good');
});

test('a sweep that cannot read the records says so, without an account', async t => {
  const warnings = [];t.mock.method(console, 'warn', line => warnings.push(JSON.parse(line)));
  const f = fixture({ pending: { put: async () => {}, drop: async () => {}, list: async () => { throw new Error('user_erin'); } } });
  await assert.rejects(f.eraseAccount.sweep());
  assert.deepEqual(warnings, [{ event: 'account_erasure_sweep_failed' }]);
});

test('one store that fails never keeps the others from erasing, and the failure still fails the step', async () => {
  const erased = [];
  await assert.rejects(eraseEach(['region-a', 'region-b', 'region-c'], async id => { if (id === 'region-a') throw new Error('region-a unavailable');erased.push(id); }), /region-a unavailable/);
  assert.deepEqual(erased, ['region-b', 'region-c']);
  await eraseEach([], async () => { throw new Error('never called'); });
});

test('the sweep route is closed without a secret, refuses a wrong one and sweeps with the right one', async t => {
  let sweeps = 0;
  const sweep = async () => { sweeps++;return { finished: 0, failed: 0, waiting: 0 }; };
  const serve = async route => {
    const server = createServer(async (req, res) => { if (!await route(req, res)) { res.writeHead(404);res.end(); } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));t.after(() => server.close());
    return (path, init) => fetch(`http://127.0.0.1:${server.address().port}${path}`, init);
  };
  const closed = await serve(createErasureSweepRoute({ sweep, cronSecret: null }));
  assert.equal((await closed('/api/erasure-sweep', { headers: { Authorization: 'Bearer anything' } })).status, 404);
  const open = await serve(createErasureSweepRoute({ sweep, cronSecret: 'cron-fixture' }));
  assert.equal((await open('/api/erasure-sweep', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await open('/api/erasure-sweep', { method: 'POST', headers: { Authorization: 'Bearer cron-fixture' } })).status, 405);
  const swept = await open('/api/erasure-sweep', { headers: { Authorization: 'Bearer cron-fixture' } });
  assert.equal(swept.status, 200);
  assert.deepEqual(await swept.json(), { ok: true, finished: 0, failed: 0, waiting: 0 });
  assert.equal(sweeps, 1);
  assert.equal((await open('/api/other')).status, 404);
});

test('Vercel calls the sweep every five minutes, through the server entry', () => {
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url)));
  assert.deepEqual(config.crons.filter(cron => cron.path === '/api/erasure-sweep'), [{ path: '/api/erasure-sweep', schedule: '*/5 * * * *' }]);
  assert.equal(config.rewrites.find(item => item.source === '/api/erasure-sweep')?.destination, '/api/server?_river_path=/api/erasure-sweep');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/api/erasure-sweep'), '/api/erasure-sweep');
});

test('without the deletion webhook the Vercel entry answers the sweep with 404, without starting the backend', async t => {
  const names = ['WORKOS_WEBHOOK_SECRET', 'REDIS_URL', 'PUBLIC_ORIGIN'], saved = names.map(name => [name, process.env[name]]);
  for (const name of names) delete process.env[name];
  t.after(() => { for (const [name, value] of saved) if (value === undefined) delete process.env[name]; else process.env[name] = value; });
  const { default: server } = await import(`../../api/server.js?probe=${randomUUID()}`);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  // Starting the backend here would fail without Redis and answer 503.
  for (const query of ['', '&probe=1']) assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/server?_river_path=/api/erasure-sweep${query}`)).status, 404, query);
});
