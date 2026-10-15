import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { createSharedWorld } from '../world.js';
import { createGameServer } from '../app.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { MOVE_CLOSE, UPDATE_CLOSE } from '../connection-close.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const LIFETIME = 3000, NOTICE = 2000;

// The town retires each socket before the host would cut it (server/connection-close.js):
// a rotate notice, then 4010. A page that opens a fresh socket in between keeps its place;
// an update closes with 1012 so the page can say the world is improving.
async function town(t, mode) {
  const origin = 'http://127.0.0.1', ids = { alice: 'alice', bob: 'bob' };
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true, authenticate: async req => {
    const id = req.headers.cookie?.match(/fixture=(\w+)/)?.[1];
    return ids[id] ? { userId: ids[id], name: id, sessionId: `${id}-session`, csrfToken: 'test-csrf', expiresAt: Date.now() + 600_000 } : null;
  } };
  let redis, security; const namespace = `river-oaks:rotation-test:${randomUUID()}`;
  if (mode === 'redis') { redis = new Redis(process.env.REDIS_URL); security = createRedisSecurity({ redis, prefix: `{${namespace}}` }); }
  const options = { connectionLifetime: LIFETIME, rotateNoticeMs: NOTICE };
  const app = mode === 'redis'
    ? createWorldGateway({ redis, namespace, worldData: data, auth, security, waitlist: approvedWaitlist, origin, ...options })
    : createGameServer({ world: createSharedWorld(data), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent', ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`, sockets = [];
  let closed = false;
  const close = async () => { if (closed) return; closed = true; await app.close(); };
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    await close(); security?.close();
    if (redis) { const keys = await redis.keys(`*${namespace}*`); if (keys.length) await redis.del(...keys); await redis.quit(); }
  });
  // One socket through the real ticket gate; it records every frame and its close.
  const open = async id => {
    const response = await fetch(`${base}/api/multiplayer/ticket`, { method: 'POST', headers: { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'test-csrf' } });
    assert.equal(response.status, 200);
    const { ticket } = await response.json();
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers: { Origin: origin, Cookie: `fixture=${id}` } });
    sockets.push(ws);
    const socket = { ws, opened: Date.now(), snapshots: [], notices: [], closed: null };
    ws.on('message', raw => { const value = JSON.parse(raw); if (value.type === 'snapshot') socket.snapshots.push({ at: Date.now(), value }); if (value.type === 'rotate') socket.notices.push({ at: Date.now(), value }); });
    ws.on('close', (code, reason) => { socket.closed = { code, reason: reason.toString(), at: Date.now() }; });
    await new Promise((resolve, reject) => { ws.once('error', reject); const check = setInterval(() => { if (socket.snapshots.length) { clearInterval(check); resolve(); } }, 20); });
    return socket;
  };
  const until = (check, ms = 5000) => new Promise((resolve, reject) => {
    const started = Date.now(), timer = setInterval(() => { const value = check(); if (value) { clearInterval(timer); resolve(value); } else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error('timed out')); } }, 20);
  });
  // The hosted gateway builds the world on its first connection; let that happen before any timing.
  const warm = await open('bob');
  warm.ws.close();
  await until(() => warm.closed);
  return { open, until, close };
}

for (const mode of ['memory', 'redis']) {
  const skip = mode === 'redis' && !process.env.REDIS_URL;

  test(`${mode}: a socket is warned before it is retired, and a fresh socket takes over without losing the player`, { skip }, async t => {
    const { open, until } = await town(t, mode);
    const alice = await open('alice');
    const notice = await until(() => alice.notices[0]);
    // bob watches from a socket opened now, so his own retirement falls after the hand-over.
    const bob = await open('bob');
    assert.deepEqual(notice.value, { type: 'rotate', closeInMs: NOTICE });
    const warnedAfter = notice.at - alice.opened;
    assert.ok(warnedAfter >= LIFETIME - NOTICE - 150 && warnedAfter < LIFETIME, `the notice leaves the page ${NOTICE} ms (${warnedAfter} ms after opening)`);
    // The page moves to a fresh socket before the old one is retired.
    const fresh = await open('alice');
    await until(() => alice.closed);
    assert.ok([4009, MOVE_CLOSE.code].includes(alice.closed.code), `the replaced socket closes as superseded or moved: ${JSON.stringify(alice.closed)}`);
    const before = fresh.snapshots.length;
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.ok(fresh.snapshots.length > before, 'the fresh socket keeps receiving the town');
    // bob saw alice the whole time.
    assert.ok(bob.snapshots.some(frame => frame.at > alice.closed.at), `bob received the town after the hand-over (${bob.snapshots.length} frames)`);
    assert.ok(bob.snapshots.every(frame => frame.value.players.some(player => player.id === 'alice')), 'alice never left the town');
    assert.equal(fresh.closed, null);
  });

  test(`${mode}: without a replacement the socket closes as a planned move, and an update says so`, { skip }, async t => {
    const { open, until, close } = await town(t, mode);
    const alice = await open('alice');
    await until(() => alice.closed, LIFETIME + 3000);
    assert.equal(alice.closed.code, MOVE_CLOSE.code, JSON.stringify(alice.closed));
    assert.ok(alice.closed.at - alice.opened >= LIFETIME - 100);
    const bob = await open('bob');
    await close();
    await until(() => bob.closed);
    assert.deepEqual([bob.closed.code, bob.closed.reason], [UPDATE_CLOSE.code, UPDATE_CLOSE.reason]);
  });
}
