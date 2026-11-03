// Release rollback rehearsal on disposable local services: the candidate's gateway serves a
// town, then the previous release's gateway takes over the same Redis state (a code rollback),
// then the candidate takes it back (roll forward). Real Redis, tickets and WebSockets; fixture
// identities only. Prints one JSON receipt.
//
//   git archive v0.2.2 | tar -x -C <dir> && ln -s "$PWD/node_modules" <dir>/node_modules
//   REDIS_URL=redis://127.0.0.1:<port> node scripts/release/rollback-rehearsal.mjs <dir> [revision]
//
// For each step: everyone gets a ticket and a snapshot, positions and chat carry over
// unchanged, everyone can still move, and no node logs an error.
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import { WebSocket } from 'ws';

const [baseDir, revisionArg] = process.argv.slice(2);
if (!baseDir || !process.env.REDIS_URL) throw new Error('usage: REDIS_URL=redis://127.0.0.1:<port> node scripts/release/rollback-rehearsal.mjs <previous-release-dir> [revision]');
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(process.env.REDIS_URL).hostname)) throw new Error('the rehearsal only runs against a loopback, disposable Redis');
const trees = { candidate: resolve('.'), previous: resolve(baseDir) };
const load = async root => ({
  gateway: (await import(pathToFileURL(`${root}/server/world-gateway.js`).href)).createWorldGateway,
  security: (await import(pathToFileURL(`${root}/server/redis-security.js`).href)).createRedisSecurity,
  district: (await import(pathToFileURL(`${root}/server/district-data.js`).href)).loadDistrictData,
  contract: await import(pathToFileURL(`${root}/preview/src/world-contract.js`).href),
  waitlist: (await import(pathToFileURL(`${root}/server/tests/waitlist-fixture.js`).href)).approvedWaitlist,
});
const code = { candidate: await load(trees.candidate), previous: await load(trees.previous) };
const origin = 'http://127.0.0.1', delay = ms => new Promise(r => setTimeout(r, ms));
const until = async (check, label, tries = 600) => { for (let i = 0; i < tries; i++) { const v = check(); if (v) return v; await delay(50); } throw new Error(label); };
const auth = { handle: async () => false, close() {}, isSessionActive: async () => true,
  authenticate: async req => { const id = req.headers.cookie?.match(/^fixture=(alice|bob)$/)?.[1]; return id ? { userId: id, name: id, sessionId: id, csrfToken: 'fixture-csrf', expiresAt: Date.now() + 120000 } : null; } };
const namespace = `river-oaks:release-rollback:${randomUUID()}`, redis = new Redis(process.env.REDIS_URL);
const logs = [], info = console.info, warn = console.warn, error = console.error;
console.info = (...a) => logs.push(['info', a.join(' ')]); console.warn = (...a) => logs.push(['warn', a.join(' ')]); console.error = (...a) => logs.push(['error', a.join(' ')]);
const receipt = { namespace, revision: revisionArg ?? 'default', trees, steps: [], checks: [] };
const check = (name, ok, detail) => { receipt.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); };
const round = p => p.map(v => Math.round(v * 100) / 100);
const sockets = new Set();

async function boot(which) {
  const c = code[which], worldData = await c.district(revisionArg ? { districtRevision: revisionArg } : {});
  const security = c.security({ redis, prefix: `{${namespace}}` });
  const gateway = c.gateway({ redis, namespace, worldData, auth, security, waitlist: c.waitlist, origin, isAdmin: () => false });
  await new Promise(r => gateway.server.listen(0, '127.0.0.1', r));
  return { which, gateway, security, protocol: c.contract.worldProtocolVersion(worldData), base: `http://127.0.0.1:${gateway.server.address().port}`, revision: worldData.districtRevision ?? null };
}
// The room's durable keys (ticket rate windows excluded) as DUMP payloads.
async function dumpRoom() {
  const keys = (await redis.keys(`*${namespace}*`)).filter(key => !key.includes(':limit:'));
  return Promise.all(keys.map(async key => ({ key, ttl: await redis.pttl(key), value: await redis.dumpBuffer(key) })));
}
async function restoreRoom(backup) {
  const now = (await redis.keys(`*${namespace}*`)).filter(key => !key.includes(':limit:'));
  if (now.length) await redis.del(...now);
  for (const { key, ttl, value } of backup) await redis.restore(key, ttl > 0 ? ttl : 0, value, 'REPLACE');
}
async function stop(node) {
  for (const ws of sockets) ws.terminate(); sockets.clear();
  await node.gateway.close(); node.security.close?.(); await delay(50);
  const windows = await redis.keys(`{${namespace}}:limit:tickets:*`); if (windows.length) await redis.del(...windows);
}
async function join(node, id) {
  const headers = { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'fixture-csrf' };
  const response = await fetch(`${node.base}/api/multiplayer/ticket`, { method: 'POST', headers });
  if (response.status !== 200) throw new Error(`${id} ticket on ${node.which}: ${response.status}`);
  const { ticket } = await response.json();
  const ws = new WebSocket(`${node.base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=${node.protocol}`, { headers });
  sockets.add(ws);
  let snapshot = null, closed = null, sequence = 0; const pending = new Map();
  ws.on('error', () => {}); ws.on('close', (code, reason) => { closed = { code, reason: String(reason) }; });
  ws.on('message', raw => { const v = JSON.parse(raw); if (v.type === 'snapshot') snapshot = v; if (v.type === 'result') pending.get(v.requestId)?.(v); });
  await until(() => snapshot || closed, `${id} snapshot on ${node.which}`);
  if (!snapshot) throw new Error(`${id} closed on ${node.which}: ${JSON.stringify(closed)}`);
  const send = message => new Promise((ok, fail) => { const requestId = String(++sequence), timer = setTimeout(() => fail(new Error(`${message.type} timed out`)), 8000);
    pending.set(requestId, v => { clearTimeout(timer); pending.delete(requestId); ok(v); }); ws.send(JSON.stringify({ ...message, requestId })); });
  return { id, send, get snapshot() { return snapshot; } };
}
const view = snapshot => ({ players: Object.fromEntries(snapshot.players.map(p => [p.id, round(p.position)])), chat: snapshot.chat.map(e => `${e.authorId}:${e.text}`) });
async function step(which, label, before) {
  const node = await boot(which), started = Date.now(), mark = logs.length;
  const clients = [await join(node, 'alice'), await join(node, 'bob')];
  const roster = await until(() => clients.every(c => c.snapshot.players.length >= 2) && clients[0].snapshot, `${label} roster`);
  const arrived = view(roster);
  if (before) {
    check(`${label}: positions carry over`, JSON.stringify(arrived.players) === JSON.stringify(before.players), { before: before.players, after: arrived.players });
    check(`${label}: chat carries over`, before.chat.every(line => arrived.chat.includes(line)), { before: before.chat, after: arrived.chat });
  }
  // Everyone can still move: a 1 m step east, confirmed by the server.
  const moved = {};
  for (const client of clients) {
    const self = client.snapshot.players.find(p => p.id === client.id), to = [self.position[0] + 1, self.position[1], self.position[2] ?? 0];
    const result = await client.send({ type: 'pose', position: to, yaw: 0, altitude: 0 });
    moved[client.id] = { ok: result.ok !== false, error: result.error ?? null };
  }
  check(`${label}: everyone can move`, Object.values(moved).every(m => m.ok), moved);
  await clients[0].send({ type: 'chat', text: `${label} hello` }).catch(() => null);
  await delay(1500);
  const after = view(clients[0].snapshot);
  // The move above must land in the durable checkpoint before the next step reads it.
  await delay(1000);
  const errors = logs.slice(mark).filter(([level, line]) => level === 'error' || /"level":"error"|_failed"/.test(line)).map(([, line]) => line.slice(0, 300));
  check(`${label}: no node errors`, errors.length === 0, errors);
  receipt.steps.push({ label, tree: which, revision: node.revision, protocol: node.protocol, joinMs: Date.now() - started, arrived, moved, after });
  await stop(node);
  return after;
}
try {
  // RIVER_OAKS_REHEARSAL_ORDER=upgrade starts on the previous release instead: the deploy itself.
  // RIVER_OAKS_REHEARSAL_ORDER=restore: the operator rollback. Back up the room keys while the
  // previous release serves, deploy the candidate, then roll back by restoring that backup
  // before the previous release starts. Town changes made after the deploy are lost, by design.
  const order = process.env.RIVER_OAKS_REHEARSAL_ORDER;
  if (order === 'restore') {
    const preDeploy = await step('previous', 'previous serves', null);
    const backup = await dumpRoom();
    receipt.backup = { keys: backup.length };
    const deployed = await step('candidate', 'candidate takes over', preDeploy);
    await restoreRoom(backup);
    const restored = await step('previous', 'previous serves the restored backup', preDeploy);
    check('restore: post-deploy moves are dropped, as a restore must', JSON.stringify(restored) !== JSON.stringify(deployed));
    await step('candidate', 'candidate takes over again', restored);
  } else {
    const [first, second] = order === 'upgrade' ? ['previous', 'candidate'] : ['candidate', 'previous'];
    let state = await step(first, `${first} serves`, null);
    state = await step(second, `${second} takes over`, state);
    await step(first, `${first} takes back`, state);
  }
} catch (e) { check('rehearsal completed', false, String(e.stack ?? e).slice(0, 600)); receipt.lastLogs = logs.slice(-25).map(([level, line]) => `${level} ${line.slice(0, 400)}`); }
finally {
  for (const ws of sockets) ws.terminate();
  const keys = await redis.keys(`*${namespace}*`); if (keys.length) await redis.del(...keys); await redis.quit();
  console.info = info; console.warn = warn; console.error = error;
}
receipt.passed = receipt.checks.length > 0 && receipt.checks.every(c => c.ok);
console.log(JSON.stringify(receipt, null, 2));
process.exit(receipt.passed ? 0 : 1);
