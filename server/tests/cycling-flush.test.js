import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../app.js';
import { createSharedWorld } from '../world.js';
import { createMemoryCyclingMiles } from '../cycling-miles.js';
import { createAccountErasure } from '../account-erasure.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonRack } from '../../preview/src/plaza-salon-plan.js';
import { approvedWaitlist } from './waitlist-fixture.js';

// The dev-town transport banks metres into the store on uncycle, on the
// periodic tick, and when a rider leaves. (The hosted room drains on its tick.)
const district = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url), 'utf8'));
const environment = createWalkingEnvironment(district);
const slot = plazaSalonRack(district)[1];
const publicOrigin = 'https://sim.jev.works';
// West along the rack line: the plaza bench sits 8 m south of the rack.
const west = metres => [slot.x - metres, slot.north, environment.groundAt(slot.x - metres, -slot.north)];
// Polls a value until it deep-equals the expectation; the last mismatch is the failure.
async function until(read, expected, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let actual;
  for (;;) {
    actual = await read();
    try { assert.deepEqual(actual, expected); return; } catch (error) { if (Date.now() >= deadline) throw error; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function fixture(t, options = {}) {
  let time = 100000;
  const identity = { userId: 'alice', name: 'Alice', sessionId: 'alice-session', csrfToken: 'csrf', expiresAt: time + 600000 };
  const auth = { async authenticate(req) { return /test_session=alice/.test(req.headers.cookie ?? '') ? identity : null; }, async handle() { return false; } };
  const world = createSharedWorld(district, { now: () => time });
  const cyclingMiles = createMemoryCyclingMiles();
  const app = createGameServer({ auth, world, waitlist: approvedWaitlist, origin: publicOrigin, now: () => time, cyclingMiles, cyclingFlushMs: 200, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const response = await fetch(origin + '/api/multiplayer/ticket', { method: 'POST', headers: { Origin: publicOrigin, Cookie: 'test_session=alice', 'X-CSRF-Token': 'csrf' } });
  assert.equal(response.status, 200);
  const { ticket } = await response.json();
  const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/multiplayer?protocol=3&ticket=${ticket}`, { headers: { Origin: publicOrigin, Cookie: 'test_session=alice' } });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let requestId = 0;
  const command = message => new Promise(resolve => {
    const id = String(++requestId);
    const onMessage = raw => { const parsed = JSON.parse(raw.toString()); if (parsed.type === 'result' && parsed.requestId === id) { ws.off('message', onMessage); resolve(parsed); } };
    ws.on('message', onMessage); ws.send(JSON.stringify({ ...message, requestId: id }));
  });
  const joined = () => new Promise(resolve => { const poll = () => world.players.has('alice') ? resolve() : setTimeout(poll, 10); poll(); });
  const put = ([x, north]) => Object.assign(world.players.get('alice'), { position: [x, north, environment.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 });
  return { app, world, cyclingMiles, command, put, ws, joined, origin, advance: ms => { time += ms; } };
}

test('uncycle flushes the ride, and a rider still out is flushed by the tick', async t => {
  const f = await fixture(t);
  await f.joined();
  f.put(slot.approach);
  assert.equal((await f.command({ type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 })).ok, true);
  f.advance(1000);
  assert.equal((await f.command({ type: 'pose', position: west(5), yaw: 0, altitude: 0, vehicle: 'bicycle' })).ok, true);
  assert.equal((await f.command({ type: 'uncycle' })).ok, true);
  assert.deepEqual(await f.cyclingMiles.rank('alice'), { rank: 1, meters: 5 }, 'uncycle banked the ride before answering');
  f.put(slot.approach);
  assert.equal((await f.command({ type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 })).ok, true);
  f.advance(1000);
  assert.equal((await f.command({ type: 'pose', position: west(4), yaw: 0, altitude: 0, vehicle: 'bicycle' })).ok, true);
  await until(() => f.cyclingMiles.rank('alice'), { rank: 1, meters: 9 });
  f.ws.close();
});

test('a rider who disconnects mid-ride is banked when the departure grace ends', async t => {
  const f = await fixture(t, { cyclingFlushMs: 60_000, departureGraceMs: 50 });
  await f.joined();
  f.put(slot.approach);
  assert.equal((await f.command({ type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 })).ok, true);
  f.advance(1000);
  assert.equal((await f.command({ type: 'pose', position: west(3), yaw: 0, altitude: 0, vehicle: 'bicycle' })).ok, true);
  assert.equal(await f.cyclingMiles.rank('alice'), null, 'nothing is banked until the ride is drained');
  f.ws.close();
  await until(() => f.cyclingMiles.rank('alice'), { rank: 1, meters: 3 });
  assert.equal(f.world.players.has('alice'), false, 'the departure grace removed the rider');
});

test('the leaderboard route ranks the rider after a flushed ride', async t => {
  const f = await fixture(t);
  await f.joined();
  f.put(slot.approach);
  assert.equal((await f.command({ type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 })).ok, true);
  f.advance(1000);
  assert.equal((await f.command({ type: 'pose', position: west(6), yaw: 0, altitude: 0, vehicle: 'bicycle' })).ok, true);
  assert.equal((await f.command({ type: 'uncycle' })).ok, true);
  await until(() => f.cyclingMiles.rank('alice'), { rank: 1, meters: 6 }, 3000);
  const response = await fetch(f.origin + '/api/cycling/leaderboard', { headers: { Cookie: 'test_session=alice' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { top: [{ rank: 1, name: 'Alice', miles: 0 }], me: { rank: 1, miles: 0 }, limit: 20 });
  assert.equal((await fetch(f.origin + '/api/cycling/leaderboard')).status, 401, 'a session is required');
  f.ws.close();
});

test('an account erased while its ride is being banked keeps no total, banked or handed back', async t => {
  for (const outcome of ['banked', 'store down']) {
    // The store holds the ride's add until the erasure has started.
    const totals = createMemoryCyclingMiles();let hold = null, asked = null;
    const store = { ...totals, async add(...args) {
      if (hold) { const current = hold;hold = null;asked();await current;if (outcome === 'store down') throw new Error('store down'); }
      return totals.add(...args);
    } };
    const f = await fixture(t, { cyclingMiles: store, cyclingFlushMs: 50 });
    await f.joined();
    f.put(slot.approach);
    assert.equal((await f.command({ type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 })).ok, true);
    f.advance(1000);
    let open;const gate = new Promise(resolve => { open = resolve; });
    const adding = new Promise(resolve => { asked = resolve; });hold = gate;
    assert.equal((await f.command({ type: 'pose', position: west(5), yaw: 0, altitude: 0, vehicle: 'bicycle' })).ok, true);
    await adding;
    const eraseAccount = createAccountErasure({ tombstone: async () => {}, revoke: async () => {},
      steps: { world: id => f.app.forgetAccount(id) }, after: { cyclingMiles: id => totals.eraseUser(id) } });
    const erasing = eraseAccount('alice');
    await new Promise(resolve => setTimeout(resolve, 30));
    open();
    await erasing;
    // Later flushes find nothing of the account to bank.
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(await totals.rank('alice'), null, outcome);
  }
});
