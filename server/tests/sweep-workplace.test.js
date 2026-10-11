// Unattended recovery (#221 gap): when the instance running a task dies, any
// long-lived instance's sweep finds the overdue task through the due index and
// finishes it, with no read from the owner. Compare-and-set keeps it exactly-once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { createWorkplace, createMemoryWorkplaceStore, createRedisWorkplaceStore } from '../workplace.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { WORKPLACE_LIMITS } from '../../preview/src/workplace-contract.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const STEP = 1000, SWEEP = 5000;
const places = [{id: 'arrival', name: 'Arrival', kind: 'arrival'}, {id: 'spot:garden', name: 'Quiet Garden', kind: 'spot'}];
const brief = {purpose: 'A welcome for Mina', guestOfHonor: 'Mina', preferences: ['garden'], constraints: [], startsAt: null, guests: 6};
const owner = {userId: 'owner-user', name: 'Owner'};
const ownerKey = `owner:${createHash('sha256').update(owner.userId).digest('hex')}`;

const stores = [['memory', async () => now => createMemoryWorkplaceStore({now})]];
if (process.env.REDIS_URL) stores.push(['redis', async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const prefix = `{river-oaks:workplace-sweep:${randomUUID()}}`;
  t.after(async () => { const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const store = createRedisWorkplaceStore({redis, prefix});
  store.drop = key => redis.del(`${prefix}:workplace:v1:${key}`);
  return () => store;
}]);

// Two instances on one store. `dead` admits work and never runs a timer again;
// `live` runs only its sweep. Nobody reads as the owner.
function cluster(makeStore, {allowed = async () => true} = {}) {
  let time = 1_000_000, ids = 0;
  const now = () => time, store = makeStore(now), queued = [];
  const createId = () => `id-${String(++ids).padStart(6, '0')}`;
  const dead = createWorkplace({store, now, stepMs: STEP, createId, schedule: () => null, cancel: () => {}});
  const live = createWorkplace({store, now, stepMs: STEP, createId, allowed, sweepMs: SWEEP, schedule: fn => { queued.push(fn);return fn; }, cancel: () => {}});
  const run = async (rounds, ms = STEP) => { for (let i = 0; i < rounds; i++) { time += ms;for (const fn of queued.splice(0)) await fn(); } };
  return {store, dead, live, run, tick: ms => { time += ms; }};
}
async function admit(c, requestId = 'request-0001') {
  await c.dead.companion(owner, {name: 'Pip'});await c.dead.grant(owner, {scope: 'event_plan'});
  return (await c.dead.submit(owner, {brief, requestId}, {worldId: 'river-oaks', places})).taskId;
}
const stored = async c => (await c.store.load(ownerKey)).value;

for (const [name, makeStore] of stores) {
  test(`${name}: a task orphaned by a dead instance is finished by another instance's sweep, once`, async t => {
    const c = cluster(await makeStore(t));
    const taskId = await admit(c);
    assert.equal((await stored(c)).tasks[0].status, 'running', 'the dead instance took one step during submit');
    await c.run(12, SWEEP);
    const doc = await stored(c);
    const task = doc.tasks.find(item => item.id === taskId);
    assert.equal(task.status, 'completed');
    assert.deepEqual(task.checkpoints.map(item => item.step), ['reading_brief', 'checking_places', 'drafting_plan', 'validating']);
    assert.equal(doc.artifacts.length, 1);assert.equal(doc.notices.length, 1);
    // A sweep inside the step lease resumes without counting a lost runner.
    assert.ok(task.attempts <= WORKPLACE_LIMITS.attempts, `attempts ${task.attempts}`);
    assert.deepEqual(await c.store.due('due', Infinity, 10), [], 'a finished task leaves the due index');
  });

  test(`${name}: a paused task is left alone by the sweep`, async t => {
    const c = cluster(await makeStore(t));
    const taskId = await admit(c);
    await c.dead.pause(owner, {taskId});
    assert.deepEqual(await c.store.due('due', Infinity, 10), [], 'pausing removes the task from the due index');
    const before = await c.store.load(ownerKey);
    await c.run(6, SWEEP);
    const after = await c.store.load(ownerKey);
    assert.equal(after.revision, before.revision, 'the sweep wrote nothing');
    assert.equal(after.value.tasks[0].status, 'paused');
  });

  test(`${name}: the sweep stops an orphaned task whose owner lost access`, async t => {
    let allowed = true;
    const c = cluster(await makeStore(t), {allowed: async () => allowed});
    await admit(c);
    allowed = false;
    await c.run(3, SWEEP);
    const doc = await stored(c);
    assert.equal(doc.tasks[0].status, 'cancelled');assert.equal(doc.tasks[0].reason, 'access_revoked');
    assert.equal(doc.artifacts.length, 0);
    assert.deepEqual(await c.store.due('due', Infinity, 10), []);
  });

  test(`${name}: an index entry for a vanished owner document is cleaned up, not retried forever`, async t => {
    const c = cluster(await makeStore(t));
    await admit(c);
    // The owner document disappears (expired or deleted) while still indexed.
    if (c.store.drop) await c.store.drop(ownerKey);else c.tick(WORKPLACE_LIMITS.retentionMs + 1);
    assert.equal((await c.store.due('due', Infinity, 10)).length, 1);
    await c.run(2, SWEEP);
    assert.deepEqual(await c.store.due('due', Infinity, 10), []);
  });
}

test('a live Redis gateway finishes a task orphaned by another gateway, with no owner reads', {skip: !process.env.REDIS_URL, timeout: 90_000}, async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const namespace = `river-oaks:workplace-sweep-gateway:${randomUUID()}`, origin = 'https://sim.jev.works';
  const worldData = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const auth = {handle: async () => false, authenticate: async req => {
    const userId = req.headers.cookie?.match(/test_session=([\w-]+)/)?.[1];
    return userId ? {userId, name: userId, sessionId: userId + '-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000} : null;
  }, isSessionActive: async () => true, close() {}};
  const security = createRedisSecurity({redis, prefix: `{${namespace}}`});
  const open = new Set();
  const start = async sweep => {
    const gateway = createWorldGateway({redis, namespace, worldData, auth, security, waitlist: approvedWaitlist, origin, workplaceEnabled: true, workplaceSweep: sweep});
    await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));open.add(gateway);
    const base = `http://127.0.0.1:${gateway.server.address().port}`;
    return {gateway, post: (action, data = {}) => fetch(`${base}/api/workplace/${action}`, {method: 'POST',
      headers: {Origin: origin, Cookie: 'test_session=owner', 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json'}, body: JSON.stringify(data)})};
  };
  t.after(async () => { for (const gateway of open) await gateway.close();security.close();const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const first = await start(false);
  await first.post('companion', {name: 'Pip'});await first.post('grant', {scope: 'event_plan'});
  assert.equal((await first.post('submit', {brief, requestId: 'request-0001'})).status, 201);
  open.delete(first.gateway);await first.gateway.close();
  await start(true);
  const key = `{${namespace}}:workplace:v1:owner:${createHash('sha256').update('owner').digest('hex')}`;
  let doc;
  for (const end = Date.now() + 40_000; Date.now() < end; await new Promise(resolve => setTimeout(resolve, 500))) {
    doc = JSON.parse(await redis.hget(key, 'doc'));
    if (!['queued', 'running'].includes(doc.tasks[0].status)) break;
  }
  assert.equal(doc.tasks[0].status, 'completed', 'the second gateway finished the task with nobody reading');
  assert.equal(doc.artifacts.length, 1);assert.equal(doc.notices.length, 1);
});
