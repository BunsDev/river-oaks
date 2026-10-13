// Scheduled sweep on Vercel (#221 gap): a serverless function cannot keep a
// timer, so Vercel Cron calls a guarded route once a minute and the sweep
// drains each overdue task to completion within a time budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { createWorkplace, createMemoryWorkplaceStore } from '../workplace.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { normalizeVercelRoute } from '../vercel-routing.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const STEP = 1500;
const places = [{id: 'arrival', name: 'Arrival', kind: 'arrival'}, {id: 'spot:garden', name: 'Quiet Garden', kind: 'spot'}];
const brief = {purpose: 'A welcome for Mina', guestOfHonor: 'Mina', preferences: ['garden'], constraints: [], startsAt: null, guests: 6};

// One store; `dead` admits work and never runs again; `cron` only runs sweeps.
// Sleeping advances the fake clock, as a real invocation would wait.
function cluster() {
  let time = 1_000_000, ids = 0;
  const now = () => time, store = createMemoryWorkplaceStore({now});
  const createId = () => `id-${String(++ids).padStart(6, '0')}`;
  const dead = createWorkplace({store, now, stepMs: STEP, createId, schedule: () => null, cancel: () => {}});
  const cron = createWorkplace({store, now, stepMs: STEP, createId, schedule: () => null, cancel: () => {}, sleep: async ms => { time += ms; }});
  return {store, dead, cron, tick: ms => { time += ms; }};
}
async function admit(c, userId) {
  const actor = {userId, name: userId};
  await c.dead.companion(actor, {name: 'Pip'});await c.dead.grant(actor, {scope: 'event_plan'});
  await c.dead.submit(actor, {brief, requestId: `request-${userId}`}, {worldId: 'river-oaks', places});
  return actor;
}
const doc = async (c, userId) => (await c.store.load(`owner:${createHash('sha256').update(userId).digest('hex')}`)).value;

test('one drain sweep finishes every orphaned task, owners in parallel, exactly once', async () => {
  const c = cluster();
  for (const user of ['owner-a', 'owner-b', 'owner-c']) await admit(c, user);
  c.tick(60_000); // The next cron fires a minute later.
  const stats = await c.cron.sweep({drain: true, budgetMs: 20_000});
  assert.equal(stats.owners, 3);
  for (const user of ['owner-a', 'owner-b', 'owner-c']) {
    const state = await doc(c, user);
    assert.equal(state.tasks[0].status, 'completed', user);
    assert.deepEqual(state.tasks[0].checkpoints.map(item => item.step), ['reading_brief', 'checking_places', 'drafting_plan', 'validating']);
    assert.equal(state.tasks[0].attempts, 1, 'the minute-long gap counts one recovery, then the drain keeps the lease');
    assert.equal(state.artifacts.length, 1);assert.equal(state.notices.length, 1);
  }
  assert.deepEqual(await c.store.due('due', Infinity, 10), []);
});

test('a drain sweep stops at its budget and leaves the task due for the next run', async () => {
  const c = cluster();
  await admit(c, 'owner-a');
  c.tick(60_000);
  await c.cron.sweep({drain: true, budgetMs: STEP});
  const state = await doc(c, 'owner-a');
  assert.equal(state.tasks[0].status, 'running');
  assert.ok(state.tasks[0].checkpoints.length >= 1 && state.tasks[0].checkpoints.length < 4);
  assert.equal((await c.store.due('due', Infinity, 10)).length, 1, 'still indexed for the next cron');
});

test('Vercel declares a per-minute cron for the sweep route, rewritten to the server and allowlisted', () => {
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url)));
  assert.deepEqual(config.crons.filter(cron => cron.path === '/api/workplace-sweep'), [{path: '/api/workplace-sweep', schedule: '* * * * *'}]);
  assert.equal(config.rewrites.find(item => item.source === '/api/workplace-sweep')?.destination, '/api/server?_river_path=/api/workplace-sweep');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/api/workplace-sweep'), '/api/workplace-sweep');
});

test('the Vercel entry answers the sweep route with 404 while the workplace is off, without starting the backend', async t => {
  const saved = {...process.env};
  for (const name of ['RIVER_OAKS_WORKPLACE', 'REDIS_URL', 'PUBLIC_ORIGIN']) delete process.env[name];
  t.after(() => { process.env = saved; });
  const {default: server} = await import(`../../api/server.js?probe=${randomUUID()}`);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/server?_river_path=/api/workplace-sweep`);
  // Starting the backend here would fail without Redis and answer 503.
  assert.equal(response.status, 404);
});

test('the sweep route on a live gateway is closed without a secret, refuses a wrong one, and drains with the right one', {skip: !process.env.REDIS_URL, timeout: 90_000}, async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const namespace = `river-oaks:workplace-cron:${randomUUID()}`, origin = 'https://sim.jev.works';
  const worldData = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const auth = {handle: async () => false, authenticate: async req => {
    const userId = req.headers.cookie?.match(/test_session=([\w-]+)/)?.[1];
    return userId ? {userId, name: userId, sessionId: userId + '-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000} : null;
  }, isSessionActive: async () => true, close() {}};
  const security = createRedisSecurity({redis, prefix: `{${namespace}}`});
  const open = new Set();
  const start = async (options = {}) => {
    const gateway = createWorldGateway({redis, namespace, worldData, auth, security, waitlist: approvedWaitlist, origin, workplaceEnabled: true, ...options});
    await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));open.add(gateway);
    const base = `http://127.0.0.1:${gateway.server.address().port}`;
    return {gateway, base, post: (action, data = {}) => fetch(`${base}/api/workplace/${action}`, {method: 'POST',
      headers: {Origin: origin, Cookie: 'test_session=owner', 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json'}, body: JSON.stringify(data)})};
  };
  t.after(async () => { for (const gateway of open) await gateway.close();security.close();const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  // Admit a task, then lose that gateway before it finishes.
  const first = await start();
  await first.post('companion', {name: 'Pip'});await first.post('grant', {scope: 'event_plan'});
  assert.equal((await first.post('submit', {brief, requestId: 'request-0001'})).status, 201);
  open.delete(first.gateway);await first.gateway.close();
  const closed = await start();
  assert.equal((await fetch(`${closed.base}/api/workplace-sweep`)).status, 404, 'no secret configured: the route does not exist');
  open.delete(closed.gateway);await closed.gateway.close();
  const secret = 'cron-secret-' + randomUUID();
  const serverless = await start({workplaceCronSecret: secret});
  assert.equal((await fetch(`${serverless.base}/api/workplace-sweep`)).status, 401);
  assert.equal((await fetch(`${serverless.base}/api/workplace-sweep`, {headers: {Authorization: `Bearer ${secret}x`}})).status, 401);
  assert.equal((await fetch(`${serverless.base}/api/workplace-sweep`, {method: 'POST', headers: {Authorization: `Bearer ${secret}`}})).status, 404, 'GET only');
  // The cron fires after the next step is due (here 1.5 s; in production up to a minute).
  await new Promise(resolve => setTimeout(resolve, 1700));
  const swept = await fetch(`${serverless.base}/api/workplace-sweep`, {headers: {Authorization: `Bearer ${secret}`}});
  assert.equal(swept.status, 200);
  assert.equal((await swept.json()).owners, 1);
  const key = `{${namespace}}:workplace:v1:owner:${createHash('sha256').update('owner').digest('hex')}`;
  const state = JSON.parse(await redis.hget(key, 'doc'));
  assert.equal(state.tasks[0].status, 'completed', 'one cron call finished the orphaned task');
  assert.equal(state.artifacts.length, 1);
});
