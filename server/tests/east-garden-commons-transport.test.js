import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { createGameServer } from '../app.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';

const data = await loadDistrictData({ districtRevision: COMMONS_REVISION });
const layout = data.eastGardenCommons, environment = createWalkingEnvironment(data);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (check, label) => {
  for (let i = 0; i < 100; i++) { if (check()) return; await delay(50); }
  assert.fail(label);
};

for (const mode of ['memory', 'redis']) test(`${mode}: Commons HTTP revision, peer poses and reconnect agree through real transports`, {
  skip: mode === 'redis' && !process.env.REDIS_URL, timeout: 60000,
}, async t => {
  const origin = 'http://127.0.0.1', namespace = `river-oaks:commons-transport:${randomUUID()}`;
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true,
    authenticate: async req => {
      const id = req.headers.cookie?.match(/^fixture=(alice|bob)$/)?.[1];
      return id ? { userId: id, name: id, sessionId: id, csrfToken: 'fixture-csrf', expiresAt: Date.now() + 120000 } : null;
    } };
  let redis, security;
  if (mode === 'redis') { redis = new Redis(process.env.REDIS_URL); security = createRedisSecurity({ redis, prefix: `{${namespace}}` }); }
  const app = mode === 'redis'
    ? createWorldGateway({ redis, namespace, worldData: data, auth, security, waitlist: approvedWaitlist, origin })
    : createGameServer({ world: createSharedWorld(data), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent' });
  const sockets = [], timers = new Set();
  t.after(async () => {
    for (const timer of timers) clearTimeout(timer);
    for (const ws of sockets) ws.terminate();
    await app.close(); security?.close();
    if (redis) { const keys = await redis.keys(`*${namespace}*`); if (keys.length) await redis.del(...keys); await redis.quit(); }
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const response = await fetch(`${base}/api/world-data?world=river-oaks`, { headers: { Cookie: 'fixture=alice' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { template: 'river-oaks', districtRevision: COMMONS_REVISION });
  const join = async id => {
    const headers = { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'fixture-csrf' };
    const response = await fetch(`${base}/api/multiplayer/ticket`, { method: 'POST', headers });
    assert.equal(response.status, 200);
    const { ticket } = await response.json();
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers });
    sockets.push(ws);
    let snapshot = null, sequence = 0;
    const pending = new Map();
    ws.on('error', () => {});
    ws.on('message', raw => {
      const value = JSON.parse(raw);
      if (value.type === 'snapshot') snapshot = value;
      if (value.type === 'result') pending.get(value.requestId)?.(value);
    });
    await until(() => snapshot, `${id} initial snapshot`);
    assert.equal(snapshot.districtRevision, COMMONS_REVISION);
    return { ws, get snapshot() { return snapshot; }, send(message) {
      return new Promise((resolve, reject) => {
        const requestId = String(++sequence), timer = setTimeout(() => {
          timers.delete(timer); pending.delete(requestId); reject(new Error(`${message.type} timed out`));
        }, 8000);
        timers.add(timer);
        pending.set(requestId, value => { clearTimeout(timer); timers.delete(timer); pending.delete(requestId); resolve(value); });
        ws.send(JSON.stringify({ ...message, requestId }));
      });
    } };
  };
  const alice = await join('alice'), bob = await join('bob');
  // The broader keyboard journey starts at arrival; this transport fixture positions at the seam.
  for (const client of [alice, bob]) assert.equal((await client.send({ type: 'travel', position: [layout.edge - 1, -1335] })).ok, true);
  await delay(1100);
  for (let step = 1; step <= 12; step++) {
    const east = layout.edge - 1 + step * .25;
    await delay(110);
    for (const client of [alice, bob]) {
      const moved = await client.send({ type: 'pose', position: [east, -1335, environment.groundAt(east, 1335)], yaw: -Math.PI / 2, altitude: 0 });
      assert.equal(moved.ok, true, moved.error);
    }
  }
  for (const client of [alice, bob]) await until(() => ['alice', 'bob'].every(id => {
    const player = client.snapshot.players.find(p => p.id === id);
    return player && Math.abs(player.position[0] - (layout.edge + 2)) < .001;
  }), 'both peers see the accepted crossing');
  const invalid = await alice.send({ type: 'travel', position: [layout.edge + 15, -1280] });
  assert.equal(invalid.ok, false, 'empty reserved land is not a destination');
  const before = alice.snapshot.players.find(p => p.id === 'alice');
  alice.ws.terminate();
  const back = await join('alice');
  const after = back.snapshot.players.find(p => p.id === 'alice');
  assert.deepEqual(after.position, before.position);
  assert.deepEqual(after.appearance, before.appearance);
  assert.equal(back.snapshot.players.filter(p => p.id === 'alice').length, 1);
  await delay(1100);
  for (let step = 1; step <= 12; step++) {
    const east = layout.edge + 2 - step * .25;
    await delay(110);
    for (const client of [back, bob]) assert.equal((await client.send({ type: 'pose', position: [east, -1335, environment.groundAt(east, 1335)], yaw: Math.PI / 2, altitude: 0 })).ok, true);
  }
  for (const client of [back, bob]) await until(() => client.snapshot.players.every(p => p.position[0] < layout.edge), 'both peers returned across the seam');
});
