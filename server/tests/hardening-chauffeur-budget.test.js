// Hardening (billing): the only production path that pays for AI calls has a
// global daily budget and a breaker, so a stolen owner session or a failing
// provider cannot run up calls without end. The budget runs against the real
// security stores: Redis (hosted) and the single-process town's local store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createChauffeurRoute, createLocalChauffeurSecurity } from '../chauffeur.js';
import { createRedisSecurity } from '../redis-security.js';
import policy from '../../src/river_oaks/chauffeur-policy.json' with { type: 'json' };

const packet = {schema_version: 1, tick: 2, generation: 1, vehicle: 'rolls', speed: 0, remaining_m: 40, turn_radians: 0, road_clear: true, rear_clear: true, recovery: false,
  candidates: Object.keys(policy.thresholds).map(action => ({id: action, action, label: action}))};

const stores = [['local', async (t, now) => createLocalChauffeurSecurity({isBanned: async () => false, now})]];
if (process.env.REDIS_URL) stores.push(['redis', async (t, now) => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const prefix = `{river-oaks:chauffeur-budget:${randomUUID()}}`;
  t.after(async () => { const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  return {...createRedisSecurity({redis, prefix, now}), isBanned: async () => false};
}]);

async function fixture(t, makeSecurity, {dailyLimit, fail = () => false}) {
  // Start just after a UTC day boundary, so Redis's day window and the local
  // store's rolling day agree on when the budget comes back.
  let time = 1_800_057_600_000 + 1000, providerCalls = 0;
  const security = await makeSecurity(t, () => time);
  const handler = createChauffeurRoute({origin: 'https://typesafe.place', apiKey: 'fixture-key', dailyLimit, now: () => time,
    auth: {authenticate: async () => ({userId: 'owner', csrfToken: 'csrf'})}, security, waitlist: {isApproved: async () => true}, isAdmin: id => id === 'owner',
    fetcher: async (url, options) => {
      providerCalls++;
      if (fail()) return {ok: false, json: async () => ({})};
      const choices = JSON.parse(options.body).questions.next_action.criteria;
      return {ok: true, json: async () => ({model: 'jev-1.13.0', answers: {next_action: {type: 'choice', choice: 'cruise', confidence: .9, probabilities: Object.fromEntries(Object.keys(choices).map(key => [key, Number(key === 'cruise')]))}}})};
    }});
  const server = createServer(async (req, res) => { if (!await handler(req, res)) res.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections();server.close(); });
  const drive = async () => (await (await fetch(`http://127.0.0.1:${server.address().port}/api/chauffeur`, {method: 'POST', headers: {Origin: 'https://typesafe.place', 'X-CSRF-Token': 'csrf', 'Content-Type': 'application/json'}, body: JSON.stringify(packet)})).json()).reason;
  return {drive, providerCalls: () => providerCalls, advance: ms => { time += ms; }};
}

for (const [name, makeSecurity] of stores) {
  test(`${name}: a global daily budget stops provider calls until the next day`, async t => {
    const f = await fixture(t, makeSecurity, {dailyLimit: 3});
    for (let i = 0; i < 3; i++) assert.equal(await f.drive(), 'accepted');
    assert.equal(await f.drive(), 'budget_exhausted');
    assert.equal(f.providerCalls(), 3, 'the over-budget call never reaches the provider');
    f.advance(86_400_000);
    assert.equal(await f.drive(), 'accepted', 'a new day restores the budget');
  });

  test(`${name}: the daily budget and each owner's pace are separate allowances`, async t => {
    // 40 decisions a minute is the owner's pace; the daily budget is far above it.
    const f = await fixture(t, makeSecurity, {dailyLimit: 6000});
    for (let i = 0; i < 40; i++) assert.equal(await f.drive(), 'accepted', `decision ${i + 1}`);
    assert.equal(await f.drive(), undefined, 'the 41st decision in a minute is paced (429), not refused for budget');
    f.advance(61_000);
    assert.equal(await f.drive(), 'accepted');
    assert.equal(f.providerCalls(), 41);
  });
}

test('repeated provider failures open a breaker instead of retrying at full rate', async t => {
  let failing = true;
  const f = await fixture(t, stores[0][1], {dailyLimit: 100, fail: () => failing});
  for (let i = 0; i < 3; i++) assert.equal(await f.drive(), 'provider_unavailable');
  assert.equal(await f.drive(), 'provider_paused');
  assert.equal(f.providerCalls(), 3, 'no call while the breaker is open');
  failing = false;f.advance(61_000);
  assert.equal(await f.drive(), 'accepted', 'the breaker closes after its pause');
  assert.equal(f.providerCalls(), 4);
});
