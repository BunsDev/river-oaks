import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../app.js';
import { createSharedWorld } from '../world.js';
import { approvedWaitlist } from './waitlist-fixture.js';

// The dev-town transport tells the world when a player's connection drops and when it comes
// back within the departure grace (world.away), so a flying pilot's craft lands meanwhile
// (ribbonwing-maneuvers.test.js covers the descent itself).
const district = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url), 'utf8'));
const publicOrigin = 'https://sim.jev.works';

async function until(check, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) { if (Date.now() >= deadline) throw new Error('timed out');await new Promise(resolve => setTimeout(resolve, 10)); }
}

test('a dropped connection marks the player away and keeps the world ticking for the grace; reconnecting clears it', async t => {
  const time = 100000;
  const identity = { userId: 'alice', name: 'Alice', sessionId: 'alice-session', csrfToken: 'csrf', expiresAt: time + 600000 };
  const auth = { async authenticate(req) { return /test_session=alice/.test(req.headers.cookie ?? '') ? identity : null; }, async handle() { return false; } };
  const world = createSharedWorld(district, { now: () => time }), calls = [], away = world.away;
  world.away = (userId, isAway) => { calls.push([userId, isAway]);away(userId, isAway); };
  let steps = 0;const step = world.step;world.step = delta => { steps++;step(delta); };
  const app = createGameServer({ auth, world, waitlist: approvedWaitlist, origin: publicOrigin, now: () => time, departureGraceMs: 60_000 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const connect = async () => {
    const response = await fetch(origin + '/api/multiplayer/ticket', { method: 'POST', headers: { Origin: publicOrigin, Cookie: 'test_session=alice', 'X-CSRF-Token': 'csrf' } });
    assert.equal(response.status, 200);
    const { ticket } = await response.json();
    const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/multiplayer?protocol=3&ticket=${ticket}`, { headers: { Origin: publicOrigin, Cookie: 'test_session=alice' } });
    await new Promise((resolve, reject) => { ws.once('open', resolve);ws.once('error', reject); });
    return ws;
  };
  const first = await connect();
  await until(() => world.players.has('alice'));
  first.close();
  await until(() => calls.some(([id, isAway]) => id === 'alice' && isAway));
  assert.equal(world.players.has('alice'), true, 'still in the world for the grace');
  // Nobody is connected now, yet the world keeps ticking for the grace, so the away pilot's craft can land.
  const before = steps;await until(() => steps > before + 2);
  const second = await connect();
  t.after(() => second.close());
  await until(() => calls.at(-1)?.[1] === false);
  assert.deepEqual(calls.at(-1), ['alice', false], 'back, and no longer away');
});
