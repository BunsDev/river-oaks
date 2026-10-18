// The Gardens' public workstations (#510) through real ticket/WebSocket and HTTP gates:
// a resident walks into a hall, sits at a workstation chair and only then opens their own
// private desk; a second resident at the next chair sees only theirs; standing up, another
// session or the garage revision closes it. Snapshots carry a boolean, never the work.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { createSharedWorld } from '../world.js';
import { createGameServer } from '../app.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { loadDistrictData } from '../district-data.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { campusToSource } from '../../shared/garden-campus-layout.js';

const gardens = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS }), env = createWalkingEnvironment(gardens);
const source = ([u, v]) => campusToSource([u, v]).slice(0, 2), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const seat = name => ({ type: 'sit', buildId: `bench:campus-T1-F1-hall.table-2-${name}`, slot: 0 });

for (const mode of ['memory', 'redis']) test(`${mode}: a Gardens workstation opens only the sitter's own private desk`, { skip: mode === 'redis' && !process.env.REDIS_URL }, async t => {
  const origin = 'http://127.0.0.1', ids = { alice: 'alice', alice_alt: 'alice', bob: 'bob' };
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true,
    authenticate: async req => { const id = req.headers.cookie?.match(/fixture=(\w+)/)?.[1];return ids[id] ? { userId: ids[id], name: id, sessionId: id, csrfToken: 'test-csrf', expiresAt: Date.now() + 600000 } : null; } };
  let redis, security;const namespace = `river-oaks:campus-desk-test:${randomUUID()}`;
  if (mode === 'redis') { redis = new Redis(process.env.REDIS_URL);security = createRedisSecurity({ redis, prefix: `{${namespace}}` }); }
  const app = mode === 'redis' ? createWorldGateway({ redis, namespace, worldData: gardens, auth, security, waitlist: approvedWaitlist, origin })
    : createGameServer({ world: createSharedWorld(gardens), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`, sockets = [];
  t.after(async () => { for (const ws of sockets) ws.terminate();await app.close();security?.close();if (redis) { const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); } });
  const join = async id => {
    const response = await fetch(`${base}/api/multiplayer/ticket`, { method: 'POST', headers: { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'test-csrf' } });
    assert.equal(response.status, 200);const { ticket } = await response.json();
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers: { Origin: origin, Cookie: `fixture=${id}` } });sockets.push(ws);
    const pending = new Map();let last = null, seq = 0, self = null;
    await new Promise((resolve, reject) => { ws.once('error', reject);ws.on('message', raw => { const v = JSON.parse(raw);if (v.type === 'snapshot') { last = v;resolve(); } if (v.type === 'result' && pending.has(v.requestId)) { pending.get(v.requestId)(v);pending.delete(v.requestId); } }); });
    const send = message => new Promise((resolve, reject) => { const requestId = String(++seq), timer = setTimeout(() => { pending.delete(requestId);reject(new Error(`${message.type} timed out`)); }, 8000);
      pending.set(requestId, v => { clearTimeout(timer);if (v.player?.position) self = v.player.position;resolve(v); });ws.send(JSON.stringify({ ...message, requestId })); });
    // Walk in short, paced poses so the server's speed budget and sweep accept every step.
    const walk = async points => {
      // Start from the server's last answer for this player, not a possibly older snapshot.
      let at = self ?? last.players.find(p => p.id === ids[id]).position;
      for (const point of points) {
        const [x, n] = source(point), count = Math.max(1, Math.ceil(Math.hypot(x - at[0], n - at[1]) / 0.25));
        for (let i = 1; i <= count; i++) {
          const e = at[0] + (x - at[0]) * i / count, m = at[1] + (n - at[1]) * i / count;
          await delay(110);const moved = await send({ type: 'pose', position: [e, m, env.groundAt(e, -m)], yaw: 0, altitude: 0 });
          assert.equal(moved.ok, true, `${id} pose ${moved.error}`);
        }
        at = [x, n];
      }
    };
    return { ws, send, walk, get snapshot() { return last; } };
  };
  const post = (id, action, data = {}) => fetch(`${base}/api/office-desk/${action}`, { method: 'POST', headers: { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const until = async (check, label) => { for (let i = 0; i < 60; i++) { if (check()) return;await delay(100); } assert.fail(label); };

  const a = await join('alice'), b = await join('bob');
  assert.equal((await post('alice', 'read')).status, 403, 'not at a workstation yet');
  for (const client of [a, b]) assert.equal((await client.send({ type: 'travel', storeId: 'campus:T1-F1-hall', mode: 'enter' })).ok, true);
  assert.equal((await post('alice', 'read')).status, 403, 'standing in the hall is not a workstation');
  await a.walk([[22.6, 62], [20.6, 62.5]]);
  const sat = await a.send(seat('chair-1'));assert.equal(sat.ok, true, sat.error);
  await until(() => a.snapshot.players.find(p => p.id === 'alice')?.campusWorkstation === true, 'snapshot shows the workstation');
  assert.equal((await post('alice_alt', 'read')).status, 403, 'another session does not inherit the seat');
  const task = { id: 'campus-task', title: 'Plan the atelier launch', notes: 'Private campus notes', result: '', links: [], status: 'open' };
  assert.equal((await post('alice', 'save', { expectedVersion: 0, task })).status, 200);
  assert.equal((await (await post('alice', 'read')).json()).desk.tasks[0].notes, 'Private campus notes');
  // Bob at the next chair has his own, empty desk.
  await b.walk([[22.6, 62], [21, 63]]);
  assert.equal((await b.send(seat('chair-2'))).ok, true);
  await until(() => b.snapshot.players.find(p => p.id === 'bob')?.campusWorkstation === true, 'bob seated');
  assert.deepEqual((await (await post('bob', 'read')).json()).desk.tasks, [], 'a neighbour never sees another account’s work');
  assert.equal(JSON.stringify(b.snapshot).includes('Private campus notes'), false, 'private work never enters public snapshots');
  assert.equal((await b.send(seat('chair-1'))).error, 'already_seated');
  // Standing up closes the desk for that account.
  assert.equal((await a.send({ type: 'stand' })).ok, true);
  await until(() => !a.snapshot.players.find(p => p.id === 'alice')?.campusWorkstation, 'alice stood');
  assert.equal((await post('alice', 'read')).status, 403);
  // And the work is still there when she sits again.
  assert.equal((await a.send(seat('chair-1'))).ok, true);
  await until(() => a.snapshot.players.find(p => p.id === 'alice')?.campusWorkstation === true, 'alice back');
  assert.equal((await (await post('alice', 'read')).json()).desk.tasks[0].title, 'Plan the atelier launch');
});

test('the garage revision has no campus seats and no workstation', async () => {
  const garage = await loadDistrictData(), world = createSharedWorld(garage);
  world.join({ userId: 'alice', name: 'alice' });
  assert.equal(world.command('alice', seat('chair-1')).error, 'invalid_seat');
  assert.equal(world.campusWorkstation('alice'), false);
});
