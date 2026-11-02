import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { createSharedWorld } from '../world.js';
import { createGameServer } from '../app.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { CRIME_TARGETS } from '../crime.js';

// The first criminal action (#597) through the real ticket and WebSocket gates: one memory
// server, or two Redis gateways sharing a town, then coordinator replacement. A permitted hit
// is one transition every client sees; retries, reconnects and replacement never repeat it.
const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const OWNER = 'jevica-owner', isOwner = id => id === OWNER;
const RIVAL = CRIME_TARGETS['river-oaks'][0], [RX, RN] = RIVAL.position;
const rivalIn = frame => frame.crime.targets.find(item => item.id === RIVAL.id);
const starsIn = (frame, id) => frame.crime.wanted.find(([userId]) => userId === id)?.[1] ?? 0;

async function harness(t, mode) {
  const origin = 'http://127.0.0.1', ids = { owner: OWNER, alice: 'alice', bob: 'bob' }, sessions = {};
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true, authenticate: async req => {
    const id = req.headers.cookie?.match(/fixture=(\w+)/)?.[1];
    return ids[id] ? { userId: ids[id], name: id, sessionId: `${id}-session-${sessions[id] ?? 0}`, csrfToken: 'test-csrf', expiresAt: Date.now() + 60000 } : null;
  } };
  const namespace = `river-oaks:crime-test:${randomUUID()}`, clients = [], apps = [], sockets = [];
  const redisFor = () => { const redis = new Redis(process.env.REDIS_URL);clients.push(redis);return redis; };
  const security = mode === 'redis' ? createRedisSecurity({ redis: redisFor(), prefix: `{${namespace}}` }) : null;
  const memory = mode === 'memory' ? createGameServer({ world: createSharedWorld(data, { isAdmin: isOwner }), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent', isAdmin: isOwner }) : null;
  const gateway = async () => {
    const app = memory ?? createWorldGateway({ redis: redisFor(), namespace, worldData: data, auth, security, waitlist: approvedWaitlist, origin, isAdmin: isOwner });
    if (!app.server.listening) await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    if (!apps.includes(app)) apps.push(app);
    return { app, base: `http://127.0.0.1:${app.server.address().port}` };
  };
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    for (const app of apps) await app.close().catch(() => {});
    security?.close();
    if (clients.length) { const keys = await clients[0].keys(`*${namespace}*`);if (keys.length) await clients[0].del(...keys); }
    for (const redis of clients) await redis.quit();
  });
  const join = async (target, id) => {
    const response = await fetch(target.base + '/api/multiplayer/ticket', { method: 'POST', headers: { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'test-csrf' } });
    assert.equal(response.status, 200);
    const { ticket } = await response.json();
    const ws = new WebSocket(`${target.base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers: { Origin: origin, Cookie: `fixture=${id}` } });
    sockets.push(ws);
    const pending = new Map();let last = null, seq = 0;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${id}: no first snapshot within 15 s`)), 15000);
      ws.once('error', error => { clearTimeout(timeout);reject(error); });
      ws.once('close', code => { clearTimeout(timeout);if (!last) reject(new Error(`${id}: socket closed (${code}) before its first snapshot`)); });
      ws.on('message', raw => {
        const value = JSON.parse(raw);
        if (value.type === 'snapshot') { last = value;clearTimeout(timeout);resolve(); }
        if (value.type === 'result' && pending.has(value.requestId)) { pending.get(value.requestId)(value);pending.delete(value.requestId); }
      });
    });
    return {
      ws, get snapshot() { return last; },
      send: message => new Promise((resolve, reject) => {
        const requestId = String(++seq), timeout = setTimeout(() => { pending.delete(requestId);reject(new Error('World rules command timed out')); }, 8000);
        pending.set(requestId, value => { clearTimeout(timeout);resolve(value); });
        ws.send(JSON.stringify({ ...message, requestId }));
      }),
      until: check => new Promise((resolve, reject) => {
        if (last && check(last)) return resolve(last);
        const timeout = setTimeout(() => reject(new Error('No matching snapshot')), 8000);
        ws.on('message', function seen(raw) { const value = JSON.parse(raw);if (value.type === 'snapshot' && check(value)) { clearTimeout(timeout);ws.off('message', seen);resolve(value); } });
      }),
    };
  };
  return { sessions, gateway, join, sockets, apps };
}

const actionIn = (frame, id) => frame.crime.actions?.find(item => item.id === id);
// Walk a client between two lane points in 0.3 m steps every 110 ms (about 2.7 m/s, under the
// brisk walk), at the height its own frame reports; the server corrects anything faster.
async function walk(client, from, to) {
  const self = client.snapshot.players.find(player => player.id === 'alice');
  const height = self?.position[2] ?? 0, steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.3));
  for (let i = 1; i <= steps; i++) {
    await new Promise(resolve => setTimeout(resolve, 110));
    const t = i / steps, position = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, height];
    const moved = await client.send({ type: 'pose', position, yaw: Math.atan2(to[0] - from[0], from[1] - to[1]), altitude: 0 });
    assert.equal(moved.ok, true, `walk step ${i}/${steps}: ${JSON.stringify(moved)}`);
  }
}
for (const mode of ['memory', 'redis']) test(`${mode}: one hit is seen by every client once, through retries${mode === 'redis' ? ', reconnects and writer replacement' : ' and reconnects'}`, { skip: mode === 'redis' && !process.env.REDIS_URL, timeout: 120_000 }, async t => {
  const { sessions, gateway, join, sockets, apps } = await harness(t, mode);
  const first = await gateway(), second = await gateway();
  const owner = await join(first, 'owner'), alice = await join(first, 'alice'), bob = await join(second, 'bob');
  assert.equal(rivalIn(bob.snapshot).health, 100);
  const arrived = await alice.send({ type: 'travel', position: [RX + 1.2, RN] });
  assert.equal(arrived.ok, true, JSON.stringify(arrived));
  const strike = { type: 'attack', targetId: RIVAL.id, attackKind: 'melee', attackId: 'alice-transport-0001' };
  assert.equal((await alice.send(strike)).error, 'violence_off', 'peaceful by default');
  assert.equal(rivalIn(bob.snapshot).health, 100);
  assert.equal((await owner.send({ type: 'worldPolicy', action: 'update', expectedRevision: 0, changes: { violence: { mode: 'forced', zones: ['westcreek-lane'] } } })).ok, true);
  await alice.until(frame => frame.worldPolicy.revision === 1);
  // A refused attack ID is not spent: the same ID is admitted once the rule allows it. It lands
  // at contact (#640): the reply confirms a windup, and every client sees the hit once.
  const landed = await alice.send(strike);
  assert.equal(landed.ok, true, JSON.stringify(landed));
  assert.deepEqual([landed.action.phase, landed.action.outcome, landed.hit], ['windup', null, undefined]);
  for (const client of [bob, owner]) {
    const frame = await client.until(value => rivalIn(value).health === 75);
    assert.equal(starsIn(frame, 'alice'), 1);
    // The hit is public in the frame that shows its damage (actions stay public while shown).
    assert.equal(actionIn(frame, landed.action.id)?.outcome, 'hit');
  }
  // Out of the rival's counter range (#640), so its counters cannot interleave with this test.
  // On foot: an officer is on alice from the step the hit landed, and a pursued player cannot
  // travel (#785); the walk is the authoritative movement at a lawful pace.
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal((await alice.send({ type: 'travel', position: [RX, RN + 5] })).error, 'pursued', 'no hop out of the chase');
  await walk(alice, [RX + 1.2, RN], [RX, RN + 5]);
  // Retried on the same socket, then after a reconnect through the other gateway.
  const replay = await alice.send(strike);
  assert.deepEqual([replay.replayed, replay.action.id, replay.action.outcome], [true, landed.action.id, 'hit']);
  alice.ws.terminate();sessions.alice = 1;
  const aliceAgain = await join(second, 'alice');
  const retried = await aliceAgain.send(strike);
  assert.deepEqual([retried.ok, retried.replayed, retried.action.id, retried.action.effect.health], [true, true, landed.action.id, 75]);
  assert.deepEqual([rivalIn(bob.snapshot).health, starsIn(bob.snapshot, 'alice')], [75, 1], 'still one hit');
  // Bob is not the target of anything, and players cannot fight with PvP off.
  assert.equal((await bob.send({ type: 'attack', targetId: 'alice', attackKind: 'melee' })).error, 'pvp_off');
  if (mode === 'memory') return;
  for (const ws of sockets) ws.terminate();
  for (const app of apps.splice(0)) await app.close();
  const third = await gateway();
  const ownerAgain = await join(third, 'owner');
  assert.deepEqual([rivalIn(ownerAgain.snapshot).health, starsIn(ownerAgain.snapshot, 'alice')], [75, 1], 'health and stars survive writer replacement');
  // Writer replacement in the middle of a windup: the replacement resolves it exactly once.
  const aliceThird = await join(third, 'alice');
  await walk(aliceThird, [RX, RN + 5], [RX + 1.2, RN]);
  const pendingStrike = { ...strike, attackId: 'alice-transport-0002' };
  const pending = await aliceThird.send(pendingStrike);
  assert.equal(pending.ok, true, JSON.stringify(pending));
  assert.equal(pending.action.phase, 'windup');
  for (const ws of sockets) ws.terminate();
  for (const app of apps.splice(0)) await app.close();
  const fourth = await gateway();
  const ownerLast = await join(fourth, 'owner');
  const settled = await ownerLast.until(frame => rivalIn(frame).health < 75);
  assert.deepEqual([rivalIn(settled).health, starsIn(settled, 'alice')], [50, 2], 'one contact after replacement');
  const aliceLast = await join(fourth, 'alice');
  const again = await aliceLast.send(pendingStrike);
  assert.deepEqual([again.replayed, again.action.id, again.action.outcome], [true, pending.action.id, 'hit']);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(rivalIn(ownerLast.snapshot).health, 50, 'never twice');
});

for (const mode of ['memory', 'redis']) test(`${mode}: police, authenticated surrender and one arrest agree across clients and writer replacement`, { skip: mode === 'redis' && !process.env.REDIS_URL, timeout: 120_000 }, async t => {
  const { gateway, join, sockets, apps } = await harness(t, mode);
  const first = await gateway(), second = await gateway();
  const owner = await join(first, 'owner'), alice = await join(first, 'alice'), bob = await join(second, 'bob');
  assert.equal((await alice.send({ type:'travel', position:[RX + 1.2, RN] })).ok,true);
  assert.equal((await owner.send({ type:'worldPolicy',action:'update',expectedRevision:0,changes:{violence:{mode:'forced',zones:['westcreek-lane']}} })).ok,true);
  assert.equal((await alice.send({ type:'attack',targetId:RIVAL.id,attackKind:'melee',attackId:'police-transport-hit' })).ok,true);
  const observed = await bob.until(frame => frame.police.units.some(unit => unit.targetId === 'alice'));
  assert.equal(observed.police.units.length,1);
  assert.equal((await bob.send({ type:'surrender',userId:'alice' })).error,'invalid_surrender');
  assert.equal((await alice.send({ type:'surrender' })).ok,true);
  await bob.until(frame => frame.police.units.some(unit => unit.state === 'arrest'));
  let observer = bob, subject = alice;
  if (mode === 'redis') {
    for (const ws of sockets) ws.terminate();
    for (const app of apps.splice(0)) await app.close();
    const replacement = await gateway();
    subject = await join(replacement,'alice'); observer = await join(replacement,'bob');
  }
  const after = await observer.until(frame => starsIn(frame,'alice') === 0);
  assert.ok(after.police.units.every(unit => unit.targetId !== 'alice'));
  const arrival = after.players.find(player => player.id === 'alice');
  assert.ok(Math.hypot(arrival.position[0]-RX,arrival.position[1]-RN)>10);
  assert.equal((await subject.send({type:'surrender'})).error,'not_wanted');
  const final = await subject.until(frame => starsIn(frame,'alice') === 0);
  assert.equal(rivalIn(final).health,75,'arrest does not replay the attack or heal the rival');
});
