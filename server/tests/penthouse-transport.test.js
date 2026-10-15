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
import { approvedWaitlist } from './waitlist-fixture.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { OFFICE_LAYOUT_PENTHOUSE, officeLayout } from '../../preview/src/office-layouts.js';

const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const penthouse = officeLayout(OFFICE_LAYOUT_PENTHOUSE);
const anchor = id => penthouse.anchors.find(item => item.id === id).position;
const stairsUp = penthouse.levels[0].portals.find(item => item.kind === 'stairs').id;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

for (const mode of ['memory', 'redis']) test(`${mode}: two visitors on different penthouse floors see each other's server-derived level`, { skip: mode === 'redis' && !process.env.REDIS_URL }, async t => {
  const origin = 'http://127.0.0.1', owner = JEVICA_ADMIN_USER_IDS[0], ids = { owner, guest: 'guest-visitor' };
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true, authenticate: async req => {
    const id = req.headers.cookie?.match(/fixture=(\w+)/)?.[1];
    return ids[id] ? { userId: ids[id], name: id, sessionId: `${id}-session`, csrfToken: 'test-csrf', expiresAt: Date.now() + 120000 } : null;
  } };
  let redis, security; const namespace = `river-oaks:penthouse-test:${randomUUID()}`;
  if (mode === 'redis') { redis = new Redis(process.env.REDIS_URL); security = createRedisSecurity({ redis, prefix: `{${namespace}}` }); }
  const app = mode === 'redis'
    ? createWorldGateway({ redis, namespace, worldData: data, auth, security, waitlist: approvedWaitlist, origin, officeLayout: OFFICE_LAYOUT_PENTHOUSE })
    : createGameServer({ world: createSharedWorld(data, { officeLayout: OFFICE_LAYOUT_PENTHOUSE }), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`, sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    await app.close(); security?.close();
    if (redis) { const keys = await redis.keys(`*${namespace}*`); if (keys.length) await redis.del(...keys); await redis.quit(); }
  });
  const join = async id => {
    const response = await fetch(base + '/api/multiplayer/ticket', { method: 'POST', headers: { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'test-csrf' } });
    const { ticket } = await response.json();
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers: { Origin: origin, Cookie: `fixture=${id}` } });
    sockets.push(ws);
    const pending = new Map(); let last = null, seq = 0;
    await new Promise((resolve, reject) => {
      ws.once('error', reject);
      ws.on('message', raw => {
        const value = JSON.parse(raw);
        if (value.type === 'snapshot') { last = value; resolve(); }
        if (value.type === 'result' && pending.has(value.requestId)) { pending.get(value.requestId)(value); pending.delete(value.requestId); }
      });
    });
    const client = {
      get snapshot() { return last; },
      send: message => new Promise((resolve, reject) => {
        const requestId = String(++seq), timeout = setTimeout(() => { pending.delete(requestId); reject(new Error('Office command timed out')); }, 7000);
        pending.set(requestId, value => { clearTimeout(timeout); resolve(value); });
        ws.send(JSON.stringify({ ...message, requestId }));
      }),
      office: (action, more = {}) => client.send({ type: 'office', action, officeId: 'jevica-office', ...more }),
      // Walk in steps the 2.6 m/s budget allows, waiting for it to refill between steps.
      walk: async to => {
        let at = (await client.office('enter')).office.position;
        while (Math.hypot(to[0] - at[0], to[1] - at[1]) > 1e-9) {
          await delay(1000);
          const length = Math.hypot(to[0] - at[0], to[1] - at[1]), f = Math.min(1, 2.2 / length);
          const next = [at[0] + (to[0] - at[0]) * f, at[1] + (to[1] - at[1]) * f];
          const moved = await client.office('move', { position: next, yaw: 0, layout: OFFICE_LAYOUT_PENTHOUSE });
          assert.equal(moved.ok, true, `${id} to ${next}: ${moved.error}`);
          at = next;
        }
      },
      until: async check => { for (let i = 0; i < 50; i++) { if (last && check(last)) return last; await delay(100); } throw new Error(`${id}: no matching snapshot`); },
    };
    const entrance = (await client.office('list')).offices[0].entrance;
    assert.equal((await client.send({ type: 'travel', position: entrance })).ok, true);
    return client;
  };
  const host = await join('owner'), guest = await join('guest');
  assert.equal((await host.office('invite', { peerId: ids.guest })).ok, true);
  const entered = await host.office('enter');
  assert.deepEqual([entered.office.layout, entered.office.levelId], [OFFICE_LAYOUT_PENTHOUSE, 'jevica-office/l0']);
  assert.equal((await guest.office('enter')).ok, true);
  await host.walk(anchor('stairs-bottom'));
  const up = await host.office('transition', { portalId: stairsUp, layout: OFFICE_LAYOUT_PENTHOUSE });
  assert.deepEqual([up.ok, up.office.levelId, up.office.elevation], [true, 'jevica-office/l1', 3.8], up.error);
  // The guest's own frames place the host upstairs and the guest on the main floor.
  const seen = await guest.until(frame => frame.players.find(p => p.id === owner)?.office?.levelId === 'jevica-office/l1');
  assert.deepEqual([seen.players.find(p => p.id === owner).office.elevation, seen.players.find(p => p.id === ids.guest).office.levelId], [3.8, 'jevica-office/l0']);
  const hostView = await host.until(frame => frame.players.find(p => p.id === ids.guest)?.office?.levelId === 'jevica-office/l0');
  assert.equal(hostView.players.find(p => p.id === owner).office.elevation, 3.8);
  // A client cannot claim the upper floor for itself.
  assert.equal((await guest.office('move', { position: anchor('stairs-top'), yaw: 0, layout: OFFICE_LAYOUT_PENTHOUSE, levelId: 'jevica-office/l1' })).error, 'office_level_stale');
});
