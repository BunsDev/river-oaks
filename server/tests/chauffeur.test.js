import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createChauffeurRoute, chauffeurChoices } from '../chauffeur.js';
import policy from '../../src/river_oaks/chauffeur-policy.json' with { type: 'json' };

const packet = changes => ({ schema_version: 1, tick: 2, generation: 1, vehicle: 'rolls', speed: 0, remaining_m: 40, turn_radians: 0, road_clear: true, rear_clear: true, recovery: false,
  candidates: Object.keys(policy.thresholds).map(action => ({ id: action, action, label: action })), ...changes });
test('driving choices bound acceleration, directional steering, recovery and destination parking', () => {
  const choices = changes => Object.keys(chauffeurChoices(packet(changes)));
  assert.ok(choices({}).includes('accelerate'));
  assert.deepEqual(choices({ road_clear: false }), ['brake', 'yield', 'stop']);
  assert.ok(choices({ turn_radians: .8 }).includes('turn_left'));
  assert.ok(!choices({ turn_radians: .8 }).includes('turn_right'));
  assert.ok(!choices({ turn_radians: .8 }).includes('cruise'));
  assert.ok(choices({ recovery: true }).includes('reverse'));
  assert.ok(!choices({ recovery: true, rear_clear: false }).includes('reverse'));
  assert.ok(choices({ remaining_m: 1 }).includes('park'));
  assert.throws(() => chauffeurChoices(packet({ speed: NaN })));
  assert.throws(() => chauffeurChoices(packet({ candidates: [{ id: 'cruise', action: 'stop', label: '' }] })));
});

async function fixture(t, overrides = {}) {
  let identity = { userId: 'owner', csrfToken: 'csrf' }, banned = false, approved = true, allowed = true, calls = 0, answerChange = {};
  const handler = createChauffeurRoute({ origin: 'https://typesafe.place', apiKey: 'private-fixture-key',
    auth: { authenticate: async () => identity }, security: { isBanned: async () => banned, allow: async () => allowed }, waitlist: { isApproved: async () => approved }, isAdmin: id => id === 'owner',
    fetcher: async (url, options) => {
      calls++; assert.equal(url, 'https://api.typesafe.ai/v1/systemone'); assert.equal(options.headers.Authorization, 'Bearer private-fixture-key');
      const body = JSON.parse(options.body), choices = body.questions.next_action.criteria;
      assert.doesNotMatch(options.body, /private-fixture-key/);
      return { ok: true, json: async () => ({ model: 'jev-1.13.0', answers: { next_action: { type: 'choice', choice: 'cruise', confidence: .9, probabilities: Object.fromEntries(Object.keys(choices).map(key => [key, Number(key === 'cruise')])), ...answerChange } } }) };
    }, ...overrides });
  const server = createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { set: options => { if ('identity' in options) identity = options.identity; if ('banned' in options) banned = options.banned; if ('approved' in options) approved = options.approved; if ('allowed' in options) allowed = options.allowed; if ('answer' in options) answerChange = options.answer; }, calls: () => calls,
    request: (data = packet(), headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/chauffeur`, { method: 'POST', headers: { Origin: 'https://typesafe.place', 'X-CSRF-Token': 'csrf', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) }) };
}
test('hosted Jev decisions require owner, approval, session, origin, CSRF and rate allowance before provider use', async t => {
  const f = await fixture(t);
  f.set({ identity: null }); assert.equal((await f.request()).status, 401);
  f.set({ identity: { userId: 'other', csrfToken: 'csrf' } }); assert.equal((await f.request()).status, 403);
  f.set({ identity: { userId: 'owner', csrfToken: 'csrf' }, approved: false }); assert.equal((await f.request()).status, 403);
  f.set({ approved: true, banned: true }); assert.equal((await f.request()).status, 403);
  f.set({ banned: false }); assert.equal((await f.request(packet(), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.request(packet(), { 'X-CSRF-Token': 'bad' })).status, 403);
  f.set({ allowed: false }); assert.equal((await f.request()).status, 429);
  assert.equal(f.calls(), 0);
  f.set({ allowed: true }); assert.equal((await f.request(packet({ candidates: [] }))).status, 400);
  assert.equal((await f.request(packet({ extra: 'x'.repeat(5000) }))).status, 400);
  const response = await f.request(), text = await response.text();
  assert.equal(JSON.parse(text).candidate_id, 'cruise'); assert.doesNotMatch(text, /private-fixture-key/); assert.equal(f.calls(), 1);
});
test('invalid, low confidence and unconfigured decisions hold instead of moving', async t => {
  const f = await fixture(t);
  for (const answer of [{ choice: 'teleport' }, { confidence: .1 }, { probabilities: { cruise: 1 } }]) {
    f.set({ answer }); const result = await (await f.request()).json(); assert.equal(result.candidate_id, null); assert.notEqual(result.source, 'jev');
  }
  const absent = await fixture(t, { apiKey: null });
  assert.equal((await (await absent.request()).json()).reason, 'not_configured'); assert.equal(absent.calls(), 0);
});
