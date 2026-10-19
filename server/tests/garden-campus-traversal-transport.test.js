// Two residents on the campus through the real ticket and WebSocket gates (#508): one walks
// the street under B12 while the other rides T1's lift to Floor 4 and crosses the skywalk
// over them; each snapshot shows both at their own height and level. A forged deck pose is
// refused over the socket, and a reconnect returns the visitor to Floor 4, not the street.
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
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusToSource } from '../../shared/garden-campus-layout.js';

const gardens = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS }), BASE = CAMPUS.frame.baseAltitude;
const source = ([u, v]) => campusToSource([u, v]).slice(0, 2), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const environments = new Map(), environmentFor = levelId => {
  if (!environments.has(levelId ?? '')) environments.set(levelId ?? '', createWalkingEnvironment(gardens, [], levelId ?? null));
  return environments.get(levelId ?? '');
};

for (const mode of ['memory', 'redis']) test(`${mode}: a walker under B12 and a visitor crossing it share the town at their own heights`, { skip: mode === 'redis' && !process.env.REDIS_URL }, async t => {
  const origin = 'http://127.0.0.1', ids = { walker: 'walker', visitor: 'visitor' };
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true,
    authenticate: async req => { const id = req.headers.cookie?.match(/fixture=(\w+)/)?.[1];return ids[id] ? { userId: ids[id], name: id, sessionId: id, csrfToken: 'test-csrf', expiresAt: Date.now() + 600000 } : null; } };
  let redis, security;const namespace = `river-oaks:campus-traversal-test:${randomUUID()}`;
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
      pending.set(requestId, v => { clearTimeout(timer);if (v.player) self = v.player;resolve(v); });ws.send(JSON.stringify({ ...message, requestId })); });
    const me = () => self ?? last.players.find(p => p.id === ids[id]);
    // Paced 0.25 m poses on the resident's own level, as the page sends them.
    const walk = async points => {
      let at = me().position;
      for (const point of points) {
        const [x, n] = source(point), count = Math.max(1, Math.ceil(Math.hypot(x - at[0], n - at[1]) / 0.25));
        for (let i = 1; i <= count; i++) {
          const levelId = me().levelId ?? null, e = at[0] + (x - at[0]) * i / count, m = at[1] + (n - at[1]) * i / count;
          await delay(110);const moved = await send({ type: 'pose', position: [e, m, environmentFor(levelId).groundAt(e, -m)], yaw: 0, altitude: 0, ...(levelId ? { levelId } : {}) });
          assert.equal(moved.ok, true, `${id} pose ${moved.error}`);
        }
        at = [x, n];
      }
    };
    return { ws, send, walk, me, get snapshot() { return last; } };
  };
  const until = async (check, label) => { for (let i = 0; i < 80; i++) { if (check()) return;await delay(100); } assert.fail(label); };

  const walker = await join('walker'), visitor = await join('visitor');
  assert.equal((await walker.send({ type: 'travel', position: source([31, 76.8]) })).ok, true);
  await walker.walk([[20, 76.8], [16, 76.8]]);
  assert.equal((await visitor.send({ type: 'travel', storeId: 'campus:T1-F1-hall', mode: 'enter' })).ok, true);
  await delay(1100);
  await visitor.walk([[11.6, 56.3]]);
  for (const portalId of ['T1-F1/lift-up', 'T1-F2/lift-up', 'T1-F3/lift-up']) { const moved = await visitor.send({ type: 'interiorLevel', portalId });assert.equal(moved.ok, true, `${portalId}: ${moved.error}`);await delay(300); }
  await visitor.walk([[12, 57.5], [16, 57.5], [16, 76.8]]);
  // Both clients see both residents at the same x/z, one on the street, one on the deck.
  for (const client of [walker, visitor]) await until(() => {
    const below = client.snapshot.players.find(p => p.id === 'walker'), above = client.snapshot.players.find(p => p.id === 'visitor');
    return below && above && above.levelId === 'garden-campus/l3' && Math.abs(above.position[2] - (BASE + 13)) < 1e-9 && below.levelId === null && Math.abs(below.position[2] - BASE) < 1e-9
      && Math.hypot(above.position[0] - below.position[0], above.position[1] - below.position[1]) < 1e-6;
  }, 'both residents at one x/z, at their own heights, in every snapshot');
  // A forged deck pose from the street is refused over the socket and corrected.
  const [x, n] = source([16, 78]), forged = await walker.send({ type: 'pose', position: [x, n, BASE + 13], yaw: 0, altitude: 0, levelId: 'garden-campus/l3' });
  assert.deepEqual([forged.ok, forged.error, forged.correction?.levelId ?? null], [false, 'invalid_level', null]);
  // The visitor's socket drops and a new one joins: Floor 4, where they stood.
  const before = visitor.me().position;visitor.ws.terminate();
  const back = await join('visitor');
  await until(() => back.snapshot.players.find(p => p.id === 'visitor')?.levelId === 'garden-campus/l3', 'reconnect resumes on Floor 4');
  assert.deepEqual(back.snapshot.players.find(p => p.id === 'visitor').position, before);
  await back.walk([[16, 74]]);
});
