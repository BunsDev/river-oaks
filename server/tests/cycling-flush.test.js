import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../app.js';
import { createSharedWorld } from '../world.js';
import { createMemoryCyclingMiles } from '../cycling-miles.js';
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
  const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/multiplayer?protocol=2&ticket=${ticket}`, { headers: { Origin: publicOrigin, Cookie: 'test_session=alice' } });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let requestId = 0;
  const command = message => new Promise(resolve => {
    const id = String(++requestId);
    const onMessage = raw => { const parsed = JSON.parse(raw.toString()); if (parsed.type === 'result' && parsed.requestId === id) { ws.off('message', onMessage); resolve(parsed); } };
    ws.on('message', onMessage); ws.send(JSON.stringify({ ...message, requestId: id }));
  });
  const joined = () => new Promise(resolve => { const poll = () => world.players.has('alice') ? resolve() : setTimeout(poll, 10); poll(); });
  const put = ([x, north]) => Object.assign(world.players.get('alice'), { position: [x, north, environment.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 });
  const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
  return { world, cyclingMiles, command, put, ws, joined, settle, advance: ms => { time += ms; } };
}

test('uncycle flushes the ride, and a rider still out is flushed by the tick', async t => {
  const f = await fixture(t);
  await f.joined();
  f.put(slot.approach);
  assert.equal((await f.command({ type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 })).ok, true);
  f.advance(1000);
  assert.equal((await f.command({ type: 'pose', position: west(5), yaw: 0, altitude: 0, vehicle: 'bicycle' })).ok, true);
  assert.equal((await f.command({ type: 'uncycle' })).ok, true);
  await f.settle(50);
  assert.deepEqual(await f.cyclingMiles.rank('alice'), { rank: 1, meters: 5 });
  f.put(slot.approach);
  assert.equal((await f.command({ type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 })).ok, true);
  f.advance(1000);
  assert.equal((await f.command({ type: 'pose', position: west(4), yaw: 0, altitude: 0, vehicle: 'bicycle' })).ok, true);
  await f.settle(350);
  assert.deepEqual(await f.cyclingMiles.rank('alice'), { rank: 1, meters: 9 }, 'the periodic flush banked the open ride');
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
  await f.settle(150);
  assert.equal(f.world.players.has('alice'), false);
  assert.deepEqual(await f.cyclingMiles.rank('alice'), { rank: 1, meters: 3 }, 'leave banked the open ride');
});
