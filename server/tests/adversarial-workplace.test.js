// #221 adversarial cases for the workplace, driven only through the real HTTP
// routes (session, waitlist, ban, origin and CSRF gates included) and, with
// REDIS_URL, through live Redis gateways. Each case states the attack and the
// fail-closed outcome the slice promises.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { createGameServer } from '../app.js';
import { createWorkplace } from '../workplace.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { WORKPLACE_ACTIONS, validateEventPlan } from '../../preview/src/workplace-contract.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const ORIGIN = 'http://127.0.0.1';
const auth = {
  async handle() { return false; },
  async authenticate(req) { const id = req.headers.cookie?.match(/session=([\w-]+)/)?.[1];return id ? {userId: id, name: id, sessionId: id, csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000} : null; },
};
const safePlaces = [{id: 'arrival', ref: 'arrival', name: 'Arrival', kind: 'arrival', position: [0, 0]}, {id: 'spot:garden', ref: 'garden', name: 'Quiet Garden', kind: 'spot', position: [5, 5]}];
const brief = {purpose: 'Welcome Mina to the block', guestOfHonor: 'Mina', preferences: ['garden'], constraints: [], guests: 6};

// One memory-backed server. Timers never fire, so each authorized read drives
// exactly one step, as on a serverless host; the cases stay deterministic.
async function serve(t, {places = safePlaces} = {}) {
  const workplace = createWorkplace({stepMs: 0, schedule: () => null, cancel: () => {}});
  const world = {worldId: 'river-oaks', players: new Map(), join: () => ({ok: true}), leave() {}, command: () => ({ok: true}), step() {},
    snapshot: () => ({type: 'snapshot', players: [], locals: [], wishes: {}}), resolvePlace: id => places.find(place => place.id === id) ?? null, listPlaces: () => places};
  const app = createGameServer({auth, world, waitlist: approvedWaitlist, workplace, origin: ORIGIN, staticRoot: '/nonexistent'});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.close();workplace.close(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (user, action, data = {}) => fetch(`${base}/api/workplace/${action}`, {method: 'POST',
    headers: {Origin: ORIGIN, Cookie: `session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const read = async user => (await (await post(user, 'state')).json()).state;
  return {post, read};
}
async function prepare(api, user = 'owner') {
  assert.equal((await api.post(user, 'companion', {name: 'Pip'})).status, 200);
  const granted = await (await api.post(user, 'grant', {scope: 'event_plan'})).json();
  return granted.state.grant;
}
async function finish(api, user = 'owner') {
  let state;
  for (let i = 0; i < 8; i++) state = await api.read(user);
  return state;
}

test('another account cannot read, steer or settle the owner\'s work through any action', async t => {
  const api = await serve(t);
  const grant = await prepare(api);
  assert.equal((await api.post('owner', 'submit', {brief, requestId: 'request-0001'})).status, 201);
  const done = await finish(api);
  const [task] = done.tasks;
  assert.equal(task.status, 'completed');
  const before = JSON.stringify(await api.read('owner'));
  // Every action, replayed by a second account with the owner's real identifiers.
  const probes = {
    artifact: {artifactId: task.artifactId}, delete: {artifactId: task.artifactId}, cancel: {taskId: task.id}, pause: {taskId: task.id},
    resume: {taskId: task.id}, ack: {noticeId: `result:${task.id}`}, revoke: {grantId: grant.id, expectedRevision: grant.revision},
  };
  for (const [action, data] of Object.entries(probes)) {
    const response = await api.post('intruder', action, data);
    assert.ok([403, 404].includes(response.status), `${action} answered ${response.status}`);
    const text = await response.text();
    for (const secret of [task.id, task.artifactId, grant.id, 'Mina']) assert.equal(text.includes(secret), false, `${action} leaked ${secret}`);
  }
  assert.equal(JSON.stringify(await api.read('owner')), before, 'the owner\'s document is untouched');
  // The intruder's own projections carry nothing of the owner's.
  const theirs = JSON.stringify(await api.read('intruder')) + JSON.stringify(await (await api.post('intruder', 'occupancy')).json());
  for (const secret of [task.id, task.artifactId, grant.id, 'Mina', 'owner']) assert.equal(theirs.includes(secret), false, secret);
  assert.ok(WORKPLACE_ACTIONS.every(action => action in probes || ['state', 'companion', 'grant', 'offer', 'submit', 'presence', 'occupancy'].includes(action)),
    'every owner-scoped action has a cross-account probe');
});

test('hostile world text never becomes a venue, markup stays inert text, and no safe venue fails closed', async t => {
  const hostile = [
    ...safePlaces,
    {id: 'spot:bidi', name: 'Garden‮ evil', kind: 'spot'},
    {id: 'spot:control', name: 'Garden\u0007bell', kind: 'spot'},
    {id: 'spot:long', name: 'Garden '.repeat(10).trim(), kind: 'spot'},
    {id: 'javascript:alert(1)', name: 'Garden link', kind: 'spot'},
    {id: 'spot:../../etc/passwd', name: 'Garden path', kind: 'spot'},
    {id: 'spot:markup', name: '<img src=x onerror=alert(1)>', kind: 'spot'},
    {id: 'shop:vault', name: 'Garden Vault', kind: 'shop'},
  ];
  const api = await serve(t, {places: hostile});
  await prepare(api);
  const markupBrief = {...brief, purpose: '<script>alert("garden")</script>', preferences: ['garden', 'img']};
  assert.equal((await api.post('owner', 'submit', {brief: markupBrief, requestId: 'request-0001'})).status, 201);
  const [task] = (await finish(api)).tasks;
  assert.equal(task.status, 'completed');
  const response = await api.post('owner', 'artifact', {artifactId: task.artifactId});
  assert.match(response.headers.get('content-type'), /^application\/json/);
  const {artifact} = await response.json();
  assert.equal(validateEventPlan(artifact.plan), true);
  const allowed = new Set(['arrival', 'spot:garden', 'spot:markup']);
  for (const option of artifact.plan.options) assert.ok(allowed.has(option.placeId), `unsafe venue ${option.placeId}`);
  for (const source of artifact.plan.sources) assert.ok(allowed.has(source.id), `unsafe source ${source.id}`);
  // Markup is carried as plain text; the panel renders it with textContent only.
  assert.equal(artifact.plan.title.includes('<script>'), true);
  const panel = await readFile(new URL('../../preview/src/workplace-ui.js', import.meta.url), 'utf8');
  assert.equal(/innerHTML|insertAdjacentHTML|outerHTML/.test(panel), false, 'the panel never parses HTML');

  const none = await serve(t, {places: hostile.filter(place => !allowed.has(place.id))});
  await prepare(none);
  await none.post('owner', 'submit', {brief, requestId: 'request-0001'});
  const failed = await finish(none);
  assert.equal(failed.tasks[0].status, 'failed');assert.equal(failed.tasks[0].reason, 'no_venues');
  assert.equal(failed.artifacts.length, 0);
  assert.deepEqual(failed.notices.map(notice => notice.id), [`failed:${failed.tasks[0].id}`]);
});

test('an edited approval cannot widen, extend or forge a grant, and a replayed request cannot swap its brief', async t => {
  const api = await serve(t);
  const grant = await prepare(api);
  for (const body of [{scope: 'publish'}, {scope: 'event_plan', expiresAt: Date.now() + 365 * 86_400_000}, {scope: 'event_plan', writes: ['events']}, {scope: ['event_plan']}])
    assert.equal((await api.post('owner', 'grant', body)).status, 400, JSON.stringify(body));
  assert.equal((await api.post('owner', 'grant', {scope: 'event_plan'})).status, 409, 'an active grant is not re-issued');
  const after = (await api.read('owner')).grant;
  assert.deepEqual({id: after.id, revision: after.revision, expiresAt: after.expiresAt}, {id: grant.id, revision: grant.revision, expiresAt: grant.expiresAt});
  assert.deepEqual(after.writes, []);
  assert.equal((await api.post('owner', 'revoke', {grantId: 'forged-grant-0001', expectedRevision: grant.revision})).status, 404);
  assert.equal((await api.post('owner', 'revoke', {grantId: grant.id, expectedRevision: grant.revision + 7})).status, 409);
  assert.equal((await api.read('owner')).grant.active, true, 'a forged revoke changes nothing');
  assert.equal((await api.post('owner', 'submit', {brief, requestId: 'request-0001', grantId: grant.id})).status, 400, 'a request cannot name its grant');
  const first = await (await api.post('owner', 'submit', {brief, requestId: 'request-0001'})).json();
  const edited = await api.post('owner', 'submit', {brief: {...brief, purpose: 'Something else entirely'}, requestId: 'request-0001'});
  assert.equal((await edited.json()).taskId, first.taskId);
  const state = await api.read('owner');
  assert.equal(state.tasks.length, 1);assert.equal(state.tasks[0].brief.purpose, brief.purpose, 'the stored brief is the one first admitted');
});

test('revoking during work stops it at once, and a burst of reads cannot resurrect it', async t => {
  const api = await serve(t);
  const grant = await prepare(api);
  await api.post('owner', 'submit', {brief, requestId: 'request-0001'});
  const running = await api.read('owner');
  assert.equal(running.tasks[0].status, 'running');
  const latest = running.grant;
  assert.equal((await api.post('owner', 'revoke', {grantId: grant.id, expectedRevision: latest.revision})).status, 200);
  await Promise.all(Array.from({length: 12}, () => api.read('owner')));
  const state = await finish(api);
  assert.equal(state.tasks[0].status, 'cancelled');assert.equal(state.tasks[0].reason, 'grant_revoked');
  assert.equal(state.artifacts.length, 0);assert.equal(state.notices.length, 0);
  assert.equal((await api.post('owner', 'resume', {taskId: state.tasks[0].id})).status, 409, 'a cancelled task cannot be resumed');
});

test('duplicate callbacks land once: concurrent submits, reads and acknowledgments', async t => {
  const api = await serve(t);
  await prepare(api);
  const submits = await Promise.all(Array.from({length: 10}, () => api.post('owner', 'submit', {brief, requestId: 'request-0001'})));
  assert.ok(submits.every(response => [200, 201].includes(response.status)), submits.map(response => response.status).join());
  const ids = new Set(await Promise.all(submits.map(async response => (await response.json()).taskId)));
  assert.equal(ids.size, 1, 'one task for one request id');
  for (let i = 0; i < 6; i++) await Promise.all(Array.from({length: 6}, () => api.read('owner')));
  const state = await api.read('owner');
  assert.equal(state.tasks.length, 1);
  assert.deepEqual(state.tasks[0].checkpoints.map(item => item.step), ['reading_brief', 'checking_places', 'drafting_plan', 'validating'], 'no step ran twice');
  assert.equal(state.artifacts.length, 1);assert.equal(state.notices.length, 1);
  const acks = await Promise.all(Array.from({length: 5}, () => api.post('owner', 'ack', {noticeId: state.notices[0].id})));
  assert.ok(acks.every(response => response.status === 200));
  const settled = await api.read('owner');
  assert.equal(settled.notices.length, 0);
});

test('an effect that completed before its acknowledgment is never repeated by a client retry', async t => {
  const api = await serve(t);
  await prepare(api);
  // The submit response is "lost": the client never saw the task id, and retries.
  await api.post('owner', 'submit', {brief, requestId: 'request-0001'});
  const done = await finish(api);
  assert.equal(done.tasks[0].status, 'completed');
  const retry = await (await api.post('owner', 'submit', {brief, requestId: 'request-0001'})).json();
  assert.equal(retry.taskId, done.tasks[0].id);
  const state = await finish(api);
  assert.equal(state.tasks.length, 1);assert.equal(state.artifacts.length, 1);
  // The acknowledgment is retried after it already landed, then after the draft is deleted.
  assert.equal((await api.post('owner', 'ack', {noticeId: `result:${done.tasks[0].id}`})).status, 200);
  assert.equal((await api.post('owner', 'ack', {noticeId: `result:${done.tasks[0].id}`})).status, 200);
  assert.equal((await api.post('owner', 'delete', {artifactId: done.tasks[0].artifactId})).status, 200);
  assert.equal((await api.post('owner', 'delete', {artifactId: done.tasks[0].artifactId})).status, 404);
  assert.equal((await api.post('owner', 'ack', {noticeId: `result:${done.tasks[0].id}`})).status, 404);
  assert.equal(JSON.stringify(await api.read('owner')).includes('Welcome Mina'), false, 'deleting the draft forgot the brief');
});

// Live Redis: real gateways, real timers, the shared security store.
async function gateways(t, {waitlist = approvedWaitlist} = {}) {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const namespace = `river-oaks:workplace-adversarial:${randomUUID()}`, origin = 'https://sim.jev.works';
  const worldData = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const gatewayAuth = {handle: async () => false, authenticate: async req => {
    const userId = req.headers.cookie?.match(/test_session=([\w-]+)/)?.[1];
    return userId ? {userId, name: userId, sessionId: userId + '-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000} : null;
  }, isSessionActive: async () => true, close() {}};
  const security = createRedisSecurity({redis, prefix: `{${namespace}}`});
  const open = new Set();
  async function start(enabled = true) {
    const gateway = createWorldGateway({redis, namespace, worldData, auth: gatewayAuth, security, waitlist, origin, workplaceEnabled: enabled});
    await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
    open.add(gateway);
    const base = `http://127.0.0.1:${gateway.server.address().port}`;
    const post = (user, action, data = {}) => fetch(`${base}/api/workplace/${action}`, {method: 'POST',
      headers: {Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json'}, body: JSON.stringify(data)});
    return {post, read: async user => (await (await post(user, 'state')).json()).state, close: async () => { open.delete(gateway);await gateway.close(); }};
  }
  // Reads the stored owner document directly, without passing through any gate.
  const stored = async user => {
    const doc = await redis.hget(`{${namespace}}:workplace:v1:owner:${createHash('sha256').update(user).digest('hex')}`, 'doc');
    return doc ? JSON.parse(doc) : null;
  };
  t.after(async () => { for (const gateway of open) await gateway.close();security.close();const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  return {start, stored, security};
}
const until = async (check, ms = 20_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(resolve => setTimeout(resolve, 250))) { const value = await check();if (value) return value; }
  return null;
};

test('two live gateways racing one task produce one plan and one notice; the kill switch keeps data', {skip: !process.env.REDIS_URL, timeout: 90_000}, async t => {
  const env = await gateways(t);
  const a = await env.start(), b = await env.start();
  await a.post('owner', 'companion', {name: 'Pip'});await b.post('owner', 'grant', {scope: 'event_plan'});
  assert.equal((await a.post('owner', 'submit', {brief, requestId: 'request-0001'})).status, 201);
  assert.equal((await b.post('owner', 'submit', {brief, requestId: 'request-0001'})).status, 201, 'the same request through the other gateway is the same task');
  // Both gateways run timers and both serve reads while the task advances.
  const done = await until(async () => {
    const [left, right] = await Promise.all([a.read('owner'), b.read('owner')]);
    return [left, right].find(state => !['queued', 'running'].includes(state.tasks[0].status));
  });
  assert.equal(done?.tasks[0].status, 'completed');
  const doc = await env.stored('owner');
  assert.equal(doc.tasks.length, 1);assert.equal(doc.artifacts.length, 1);assert.equal(doc.notices.length, 1);
  assert.deepEqual(doc.tasks[0].checkpoints.map(item => item.step), ['reading_brief', 'checking_places', 'drafting_plan', 'validating']);
  // Kill switch: both gateways replaced with the flag off, then on again.
  await a.close();await b.close();
  const off = await env.start(false);
  for (const action of WORKPLACE_ACTIONS) assert.equal((await off.post('owner', action, {})).status, 404, action);
  await off.close();
  const on = await env.start(true);
  const restored = await on.read('owner');
  assert.equal(restored.artifacts.length, 1, 'turning the flag back on restores the saved draft');
  assert.equal(restored.tasks[0].status, 'completed');
});

test('a ban or an ended waitlist approval mid-task stops unattended work on the service', {skip: !process.env.REDIS_URL, timeout: 90_000}, async t => {
  const removed = new Set();
  const waitlist = {...approvedWaitlist, isApproved: async id => !removed.has(id)};
  const env = await gateways(t, {waitlist});
  const gateway = await env.start();
  for (const user of ['banned', 'unlisted', 'bystander']) {
    await gateway.post(user, 'companion', {name: 'Pip'});await gateway.post(user, 'grant', {scope: 'event_plan'});
    assert.equal((await gateway.post(user, 'submit', {brief, requestId: 'request-0001'})).status, 201);
  }
  await env.security.ban({userId: 'banned', reason: 'adversarial test', actorId: 'moderator'});
  removed.add('unlisted');
  assert.equal((await gateway.post('banned', 'state')).status, 403);
  assert.equal((await gateway.post('unlisted', 'state')).status, 403);
  // Nobody reads for these owners again; only the service timer can move their tasks.
  for (const user of ['banned', 'unlisted']) {
    const doc = await until(async () => { const value = await env.stored(user);return value?.tasks[0].status === 'cancelled' ? value : null; });
    assert.ok(doc, `${user}: the timer stopped the task`);
    assert.equal(doc.tasks[0].reason, 'access_revoked');
    assert.ok(doc.grant.revokedAt, `${user}: the grant is revoked`);
    assert.equal(doc.artifacts.length, 0);
  }
  const bystander = await until(async () => { const state = await gateway.read('bystander');return state.tasks[0].status === 'completed' ? state : null; });
  assert.ok(bystander, 'an owner in good standing is unaffected');
  // Restored access does not revive the old grant; new work needs a new grant.
  await env.security.unban({userId: 'banned', actorId: 'moderator'});
  const back = await gateway.read('banned');
  assert.equal(back.grant.active, false);
  assert.equal((await gateway.post('banned', 'submit', {brief, requestId: 'request-0002'})).status, 403);
});
