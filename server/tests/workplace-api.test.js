import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { createGameServer } from '../app.js';
import { createWorkplace } from '../workplace.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { normalizeVercelRoute } from '../vercel-routing.js';
import { WORKPLACE_ACTIONS } from '../../preview/src/workplace-contract.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const ORIGIN = 'http://127.0.0.1';
const auth = {
  async handle() { return false; },
  async authenticate(req) { const id = req.headers.cookie?.match(/session=([\w-]+)/)?.[1];return id ? {userId: id, name: id, sessionId: id, csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000} : null; },
};
const places = [{id: 'arrival', ref: 'arrival', name: 'Arrival', kind: 'arrival', position: [0, 0]}, {id: 'spot:garden', ref: 'garden', name: 'Quiet Garden', kind: 'spot', position: [5, 5]}];
const brief = {purpose: 'Welcome Mina to the block', guestOfHonor: 'Mina', preferences: ['garden'], constraints: [], guests: 6};

async function serve(t, workplace, waitlist = approvedWaitlist) {
  const world = {worldId: 'river-oaks', players: new Map(), join: () => ({ok: true}), leave() {}, command: () => ({ok: true}), step() {},
    snapshot: () => ({type: 'snapshot', players: [], locals: [], wishes: {}}), resolvePlace: id => places.find(place => place.id === id) ?? null, listPlaces: () => places};
  const app = createGameServer({auth, world, waitlist, workplace, origin: ORIGIN, staticRoot: '/nonexistent'});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.close();workplace?.close(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (user, action, data = {}, {csrf = 'test-csrf', origin = ORIGIN, raw} = {}) => fetch(`${base}/api/workplace/${action}`, {method: 'POST',
    headers: {Origin: origin, ...(user ? {Cookie: `session=${user}`} : {}), 'X-CSRF-Token': csrf, 'Content-Type': 'application/json'}, body: raw ?? JSON.stringify(data)});
  return {post};
}

test('the workplace API is absent unless the server flag provides a service', async t => {
  const {post} = await serve(t, null);
  assert.equal((await post('owner', 'state')).status, 404);
});

test('every workplace route passes the hosted allowlist and nothing else does', () => {
  for (const action of WORKPLACE_ACTIONS) assert.equal(normalizeVercelRoute(`/api/server?_river_path=/api/workplace/${action}`), `/api/workplace/${action}`);
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/api/workplace/admin'), '/not-found');
});

test('workplace requests are authenticated, same-origin, approved and owner-scoped end to end', async t => {
  const workplace = createWorkplace({stepMs: 0});
  const {post} = await serve(t, workplace, {...approvedWaitlist, isApproved: async id => id !== 'pending'});
  assert.equal((await post(null, 'state')).status, 401);
  assert.equal((await post('pending', 'state')).status, 403, 'waitlist approval is required');
  assert.equal((await post('owner', 'state', {}, {csrf: 'wrong'})).status, 403);
  assert.equal((await post('owner', 'state', {}, {origin: 'https://evil.example'})).status, 403);
  assert.equal((await post('owner', 'admin')).status, 404, 'unknown actions fail closed');
  assert.equal((await post('owner', 'companion', {name: 'Pip', ownerId: 'other'})).status, 400, 'a body cannot name an owner');
  assert.equal((await post('owner', 'companion', {name: 'Pip', admin: true})).status, 400);
  assert.equal((await post('owner', 'companion', {}, {raw: JSON.stringify({name: 'x'.repeat(5000)})})).status, 400, 'oversized bodies are refused');
  assert.equal((await post('owner', 'companion', {}, {raw: '{not json'})).status, 400);
  assert.equal((await post('owner', 'companion', {name: 'Pip'})).status, 200);
  assert.equal((await post('owner', 'submit', {brief, requestId: 'request-0001'})).status, 403, 'no grant, no work');
  const granted = await (await post('owner', 'grant', {scope: 'event_plan'})).json();
  assert.deepEqual(granted.state.grant.writes, [], 'the grant writes nothing outside the workplace');
  const submitted = await post('owner', 'submit', {brief, requestId: 'request-0001'});
  assert.equal(submitted.status, 201);
  // stepMs 0: each authorized read drives one atomic step, as on a serverless host.
  let state;
  for (let i = 0; i < 8; i++) state = (await (await post('owner', 'state')).json()).state;
  const task = state.tasks[0];
  assert.equal(task.status, 'completed');
  const owned = await post('owner', 'artifact', {artifactId: task.artifactId});
  assert.equal(owned.status, 200);
  const {artifact} = await owned.json();
  assert.equal(artifact.plan.recommendation.placeId, 'spot:garden');
  // A second account sees nothing private through any action.
  assert.equal((await post('guest', 'artifact', {artifactId: task.artifactId})).status, 404);
  assert.equal((await post('guest', 'cancel', {taskId: task.id})).status, 404);
  assert.equal((await post('guest', 'ack', {noticeId: `result:${task.id}`})).status, 404);
  assert.equal((await post('guest', 'delete', {artifactId: task.artifactId})).status, 404);
  const guestView = JSON.stringify(await (await post('guest', 'state')).json()) + JSON.stringify(await (await post('guest', 'occupancy')).json());
  for (const secret of ['Welcome Mina', 'owner', task.id, task.artifactId]) assert.equal(guestView.includes(secret), false, secret);
  assert.equal((await post('owner', 'revoke', {grantId: state.grant.id, expectedRevision: state.grant.revision})).status, 200);
  assert.equal((await post('owner', 'submit', {brief, requestId: 'request-0002'})).status, 403, 'revocation stops new work');
  assert.equal((await post('owner', 'artifact', {artifactId: task.artifactId})).status, 200, 'revocation keeps existing results readable');
});

test('a saved plan survives gateway replacement on Redis', {skip: !process.env.REDIS_URL, timeout: 60_000}, async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const namespace = `river-oaks:workplace-gateway:${randomUUID()}`, origin = 'https://sim.jev.works';
  const worldData = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  const gatewayAuth = {handle: async () => false, authenticate: async req => {
    const userId = req.headers.cookie?.match(/test_session=([\w-]+)/)?.[1];
    return userId ? {userId, name: userId, sessionId: userId + '-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000} : null;
  }, isSessionActive: async () => true, close() {}};
  const security = createRedisSecurity({redis, prefix: `{${namespace}}`});
  const make = enabled => createWorldGateway({redis, namespace, worldData, auth: gatewayAuth, security, waitlist: approvedWaitlist, origin, workplaceEnabled: enabled});
  let gateway = make(true);await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  let base = `http://127.0.0.1:${gateway.server.address().port}`;
  t.after(async () => { await gateway.close();security.close();const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const post = (user, action, data = {}) => fetch(`${base}/api/workplace/${action}`, {method: 'POST', headers: {Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  await post('owner', 'companion', {name: 'Pip'});await post('owner', 'grant', {scope: 'event_plan'});
  assert.equal((await post('owner', 'submit', {brief, requestId: 'request-0001'})).status, 201);
  // The first gateway disappears mid-task; a replacement continues from the stored checkpoint.
  await gateway.close();gateway = make(true);await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${gateway.server.address().port}`;
  let state;
  for (let i = 0; i < 40; i++) {
    state = (await (await post('owner', 'state')).json()).state;
    if (state.tasks[0].status !== 'running' && state.tasks[0].status !== 'queued') break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(state.tasks[0].status, 'completed');
  assert.equal(state.notices.length, 1, 'one notice, not one per gateway');
  assert.equal(state.artifacts.length, 1);
  assert.equal((await post('guest', 'artifact', {artifactId: state.tasks[0].artifactId})).status, 404);
  // Turning the flag off is the kill switch: the routes disappear, the data stays.
  await gateway.close();gateway = make(false);await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${gateway.server.address().port}`;
  assert.equal((await post('owner', 'state')).status, 404);
  assert.equal((await redis.keys(`*${namespace}*:workplace:v1:*`)).length > 0, true);
});
