// Live Redis gateway with real timers: submit -> completed latency, recovery after
// the gateway is lost mid-task, per-owner storage, and response sizes. 5 trials each.
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { createWorldGateway } from '../../../../server/world-gateway.js';
import { createRedisSecurity } from '../../../../server/redis-security.js';
import { approvedWaitlist } from '../../../../server/tests/waitlist-fixture.js';
const redis = new Redis(process.env.REDIS_URL);
const namespace = `river-oaks:workplace-measure:${randomUUID()}`, origin = 'https://sim.jev.works';
const worldData = JSON.parse(await readFile(new URL('../../../../preview/public/data/district.json', import.meta.url)));
const auth = {handle: async () => false, authenticate: async req => { const userId = req.headers.cookie?.match(/test_session=([\w-]+)/)?.[1]; return userId ? {userId, name: userId, sessionId: userId + '-s', csrfToken: 't', expiresAt: Date.now() + 600_000} : null; }, isSessionActive: async () => true, close() {}};
const security = createRedisSecurity({redis, prefix: `{${namespace}}`});
const open = new Set();
async function start() { const g = createWorldGateway({redis, namespace, worldData, auth, security, waitlist: approvedWaitlist, origin, workplaceEnabled: true}); await new Promise(r => g.server.listen(0, '127.0.0.1', r)); open.add(g);
  const base = `http://127.0.0.1:${g.server.address().port}`;
  return {post: (u, a, d = {}) => fetch(`${base}/api/workplace/${a}`, {method: 'POST', headers: {Origin: origin, Cookie: `test_session=${u}`, 'X-CSRF-Token': 't', 'Content-Type': 'application/json'}, body: JSON.stringify(d)}), close: async () => { open.delete(g); await g.close(); }}; }
const brief = {purpose: 'Welcome Mina to the block', guestOfHonor: 'Mina', preferences: ['garden'], constraints: ['quiet after nine'], guests: 6};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const summary = xs => ({n: xs.length, min: Math.min(...xs), p50: pct(xs, 0.5), max: Math.max(...xs)});
const completion = [], recovery = [], sizes = [];
let storage;
try {
  for (let i = 0; i < 5; i++) {
    const g = await start(), user = `owner${i}`;
    await g.post(user, 'companion', {name: 'Pip'}); await g.post(user, 'grant', {scope: 'event_plan'});
    const t0 = Date.now(); await g.post(user, 'submit', {brief, requestId: `request-${i}000001`});
    // Only the service timer drives this task: poll Redis directly, not through reads.
    const key = `{${namespace}}:workplace:v1:owner:${createHash('sha256').update(user).digest('hex')}`;
    for (;;) { const d = JSON.parse(await redis.hget(key, 'doc')); if (d.tasks[0].status === 'completed') break; if (Date.now() - t0 > 30000) throw new Error('timeout'); await sleep(50); }
    completion.push(Date.now() - t0);
    const state = await (await g.post(user, 'state')).text(); const doc = JSON.parse(state).state;
    const art = await (await g.post(user, 'artifact', {artifactId: doc.tasks[0].artifactId})).text();
    const occ = await (await g.post(user, 'occupancy')).text();
    sizes.push({state: state.length, artifact: art.length, occupancy: occ.length});
    if (i === 0) storage = {ownerKeyBytes: await redis.call('MEMORY', 'USAGE', key), ownerDocBytes: (await redis.hget(key, 'doc')).length, stationsKeyBytes: await redis.call('MEMORY', 'USAGE', `{${namespace}}:workplace:v1:stations`), ownerTtlDays: +((await redis.pttl(key)) / 86_400_000).toFixed(2)};
    await g.close();
    // Recovery: the gateway disappears one step in; a replacement serves the owner's reads.
    const r1 = await start(), ru = `recover${i}`;
    await r1.post(ru, 'companion', {name: 'Pip'}); await r1.post(ru, 'grant', {scope: 'event_plan'}); await r1.post(ru, 'submit', {brief, requestId: `request-${i}000002`});
    await sleep(1600); await r1.close();
    await sleep(3000);
    const r2 = await start(), t1 = Date.now();
    let s;
    for (;;) { s = (await (await r2.post(ru, 'state')).json()).state; if (!['queued', 'running'].includes(s.tasks[0].status)) break; if (Date.now() - t1 > 30000) throw new Error('recovery timeout'); await sleep(250); }
    recovery.push({ms: Date.now() - t1, status: s.tasks[0].status, attempts: s.tasks[0].attempts, artifacts: s.artifacts.length, notices: s.notices.length});
    await r2.close();
  }
  console.log(JSON.stringify({stepMs: 1500, completionMs: summary(completion), recovery: {afterReplacementMs: summary(recovery.map(r => r.ms)), outcomes: recovery}, responseBytes: {state: summary(sizes.map(s => s.state)), artifact: summary(sizes.map(s => s.artifact)), occupancy: summary(sizes.map(s => s.occupancy))}, storage}, null, 2));
} finally { for (const g of open) await g.close(); security.close(); const keys = await redis.keys(`*${namespace}*`); if (keys.length) await redis.del(...keys); await redis.quit(); }
