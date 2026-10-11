// Hardening: anonymous routes that call WorkOS share the sign-in budget, and
// the problem-report limiter works on the hosted (Redis) backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { createGameServer } from '../app.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { SIGN_INS_PER_ADDRESS } from '../rate-limit.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const ORIGIN = 'http://127.0.0.1';

test('the desktop token exchange spends the per-address sign-in budget (memory server)', async t => {
  let reached = 0;
  const auth = {async handle(req, res) { if (new URL(req.url, 'http://x').pathname !== '/auth/desktop/exchange') return false;reached++;res.writeHead(400).end();return true; }, async authenticate() { return null; }};
  const world = {worldId: 'river-oaks', players: new Map(), join: () => ({ok: true}), leave() {}, command: () => ({ok: true}), step() {}, snapshot: () => ({type: 'snapshot', players: [], locals: [], wishes: {}}), resolvePlace: () => null, listPlaces: () => []};
  const app = createGameServer({auth, world, waitlist: approvedWaitlist, origin: ORIGIN, staticRoot: '/nonexistent'});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const statuses = [];
  for (let i = 0; i <= SIGN_INS_PER_ADDRESS; i++) statuses.push((await fetch(`${base}/auth/desktop/exchange`, {method: 'POST', headers: {Origin: ORIGIN, 'Content-Type': 'application/json'}, body: '{}'})).status);
  assert.equal(statuses.at(-1), 429, statuses.join());
  assert.equal(reached, SIGN_INS_PER_ADDRESS, 'the request over budget never reaches WorkOS');
});

test('the desktop token exchange spends the sign-in budget, and problem reports are allowed (Redis gateway)', {skip: !process.env.REDIS_URL, timeout: 60_000}, async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const namespace = `river-oaks:hardening-signin:${randomUUID()}`, origin = 'https://sim.jev.works';
  const worldData = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  let reached = 0;
  const auth = {handle: async (req, res) => { if (new URL(req.url, 'http://x').pathname !== '/auth/desktop/exchange') return false;reached++;res.writeHead(400).end();return true; },
    authenticate: async () => null, isSessionActive: async () => true, close() {}};
  const security = createRedisSecurity({redis, prefix: `{${namespace}}`});
  const gateway = createWorldGateway({redis, namespace, worldData, auth, security, waitlist: approvedWaitlist, origin});
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await gateway.close();security.close();const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  const statuses = [];
  for (let i = 0; i <= SIGN_INS_PER_ADDRESS; i++) statuses.push((await fetch(`${base}/auth/desktop/exchange`, {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: '{}'})).status);
  assert.equal(statuses.at(-1), 429, statuses.join());
  assert.equal(reached, SIGN_INS_PER_ADDRESS);
  assert.equal(await security.allow('debug-report', 'reporter', 3, 600_000), true, 'the problem-report scope is allowed');
  for (let i = 0; i < 2; i++) await security.allow('debug-report', 'reporter', 3, 600_000);
  assert.equal(await security.allow('debug-report', 'reporter', 3, 600_000), false, 'and still limited to 3 per 10 minutes');
});
