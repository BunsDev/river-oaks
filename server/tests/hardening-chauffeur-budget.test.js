// Hardening (billing): the only production path that pays for AI calls has a
// global daily budget and a breaker, so a stolen owner session or a failing
// provider cannot run up calls without end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createChauffeurRoute } from '../chauffeur.js';
import policy from '../../src/river_oaks/chauffeur-policy.json' with { type: 'json' };

const packet = {schema_version: 1, tick: 2, generation: 1, vehicle: 'rolls', speed: 0, remaining_m: 40, turn_radians: 0, road_clear: true, rear_clear: true, recovery: false,
  candidates: Object.keys(policy.thresholds).map(action => ({id: action, action, label: action}))};

async function fixture(t, {dailyLimit, fail = () => false}) {
  let time = 1_800_000_000_000, providerCalls = 0;
  const counters = new Map();
  // A faithful stand-in for security.allow: one counter per scope, id and window.
  const allow = async (scope, id, limit, windowMs) => {
    const key = `${scope}:${id}:${Math.floor(time / windowMs)}`;
    counters.set(key, (counters.get(key) ?? 0) + 1);
    return counters.get(key) <= limit;
  };
  const handler = createChauffeurRoute({origin: 'https://typesafe.place', apiKey: 'fixture-key', dailyLimit, now: () => time,
    auth: {authenticate: async () => ({userId: 'owner', csrfToken: 'csrf'})}, security: {isBanned: async () => false, allow}, waitlist: {isApproved: async () => true}, isAdmin: id => id === 'owner',
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

test('a global daily budget stops provider calls until the next day', async t => {
  const f = await fixture(t, {dailyLimit: 3});
  for (let i = 0; i < 3; i++) assert.equal(await f.drive(), 'accepted');
  assert.equal(await f.drive(), 'budget_exhausted');
  assert.equal(f.providerCalls(), 3, 'the over-budget call never reaches the provider');
  f.advance(86_400_000);
  assert.equal(await f.drive(), 'accepted', 'a new day restores the budget');
});

test('repeated provider failures open a breaker instead of retrying at full rate', async t => {
  let failing = true;
  const f = await fixture(t, {dailyLimit: 100, fail: () => failing});
  for (let i = 0; i < 3; i++) assert.equal(await f.drive(), 'provider_unavailable');
  assert.equal(await f.drive(), 'provider_paused');
  assert.equal(f.providerCalls(), 3, 'no call while the breaker is open');
  failing = false;f.advance(61_000);
  assert.equal(await f.drive(), 'accepted', 'the breaker closes after its pause');
  assert.equal(f.providerCalls(), 4);
});
