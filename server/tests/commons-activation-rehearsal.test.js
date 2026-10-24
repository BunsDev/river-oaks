import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { loadDistrictData } from '../district-data.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { roomPrefixFor } from '../world-keys.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { buildRoads, checkBuildSite, buildGeometry } from '../../preview/src/shared-build.js';

// Operator rehearsal of the documented revision rollout (docs/garden-campus.md) for
// Bayou Market Commons, through the real Redis gateway, tickets and WebSockets.
// Each phase replaces the "process" with a fresh gateway on new configuration, as a
// deploy does: activate (revision + epoch raise), a stale deployment overlapping the
// new one, rollback (previous revision + another raise), and re-activation. Accounts,
// chat, creations and positions are compared across every switch against a plain
// restart on unchanged configuration. Fixture identities stay inside this harness.
// RIVER_OAKS_REHEARSAL_RECEIPT=<path> writes the evidence receipt.
// The only district the Commons rolls back to (see step 5).
const ROLLBACK_REVISION = 'river-oaks-gardens-3';
const origin = 'http://127.0.0.1', delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const auth = { handle: async () => false, close() {}, isSessionActive: async () => true,
  authenticate: async req => {
    const id = req.headers.cookie?.match(/^fixture=(alice|bob|carol)$/)?.[1];
    return id ? { userId: id, name: id, sessionId: id, csrfToken: 'fixture-csrf', expiresAt: Date.now() + 120000 } : null;
  } };
const round = position => position.map(value => Math.round(value * 100) / 100);
const until = async (check, label, tries = 160) => { for (let i = 0; i < tries; i++) { const value = check(); if (value) return value; await delay(50); } assert.fail(label); };

for (const from of ['river-oaks-gardens-3', 'river-oaks-garage-1']) test(`activation rehearsal from ${from}: rollout, stale overlap, rollback and re-activation keep durable state`, {
  skip: !process.env.REDIS_URL, timeout: 180000,
}, async t => {
  const host = new URL(process.env.REDIS_URL).hostname;
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(host), 'the rehearsal only runs against a loopback, disposable Redis');
  const namespace = `river-oaks:activation-rehearsal:${randomUUID()}`, redis = new Redis(process.env.REDIS_URL), security = createRedisSecurity({ redis, prefix: `{${namespace}}` });
  const stateKey = `${roomPrefixFor(namespace)}:state`, sockets = new Set(), logs = [], receipt = { from, to: COMMONS_REVISION, namespace, phases: [], checks: [] };
  const info = console.info, warn = console.warn; console.info = (...args) => { logs.push(args.join(' ')); }; console.warn = (...args) => { logs.push(args.join(' ')); };
  // Every gateway this test boots, so cleanup closes any a phase left listening.
  const gateways = new Set();
  t.after(async () => {
    console.info = info; console.warn = warn;
    if (process.env.RIVER_OAKS_REHEARSAL_DEBUG) info(logs.filter(line => line.includes('event')).join('\n'));
    for (const ws of sockets) ws.terminate();
    for (const gateway of gateways) await gateway.close();
    security.close();
    const keys = await redis.keys(`*${namespace}*`); if (keys.length) await redis.del(...keys); await redis.quit();
  });
  const data = {}, worldFor = async revision => data[revision] ??= await loadDistrictData({ districtRevision: revision });
  const commons = (await worldFor(COMMONS_REVISION)).eastGardenCommons;
  const check = (name, ok, detail = null) => { receipt.checks.push({ name, ok: Boolean(ok), ...(detail === null ? {} : { detail }) }); assert.ok(ok, `${name}${detail ? `: ${JSON.stringify(detail)}` : ''}`); };

  async function boot(revision, epoch) {
    const gateway = createWorldGateway({ redis, namespace, worldData: await worldFor(revision), auth, security, waitlist: approvedWaitlist, origin, districtEpoch: epoch, isAdmin: id => id === 'alice' });
    // Phases close their own gateways; cleanup closes the rest, each at most once.
    const close = gateway.close.bind(gateway); let closing = null; gateway.close = () => closing ??= close();
    gateways.add(gateway);
    await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
    return { gateway, base: `http://127.0.0.1:${gateway.server.address().port}`, revision, epoch };
  }
  async function stop(node) { for (const ws of sockets) ws.terminate(); sockets.clear(); await node.gateway.close(); await delay(50); }
  async function join(node, id, { expectSnapshot = true } = {}) {
    const headers = { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'fixture-csrf' };
    const response = await fetch(`${node.base}/api/multiplayer/ticket`, { method: 'POST', headers });
    if (response.status !== 200) return { refused: `ticket ${response.status}` };
    const { ticket } = await response.json();
    const ws = new WebSocket(`${node.base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers });
    sockets.add(ws);
    let snapshot = null, closed = null, sequence = 0;
    const pending = new Map();
    ws.on('error', () => {}); ws.on('close', code => { closed = code; });
    ws.on('message', raw => { const value = JSON.parse(raw); if (value.type === 'snapshot') snapshot = value; if (value.type === 'result') pending.get(value.requestId)?.(value); });
    if (!expectSnapshot) { for (let i = 0; i < 200 && !snapshot && closed === null; i++) await delay(50); return snapshot ? { snapshot } : { refused: closed }; }
    await until(() => snapshot, `${id} snapshot on ${node.revision}@${node.epoch}`);
    const send = message => new Promise((resolve, reject) => {
      const requestId = String(++sequence), timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${message.type} timed out`)); }, 8000);
      pending.set(requestId, value => { clearTimeout(timer); pending.delete(requestId); resolve(value); });
      ws.send(JSON.stringify({ ...message, requestId }));
    });
    return { id, ws, send, get snapshot() { return snapshot; } };
  }
  // The durable view a resident would notice: who is in town and where, what was said, what was built.
  const durable = snapshot => ({
    revision: snapshot.districtRevision,
    players: Object.fromEntries(snapshot.players.map(player => [player.id, { name: player.name, position: round(player.position) }])),
    chat: snapshot.chat.map(entry => `${entry.authorId}:${entry.text}`),
    builds: snapshot.builds.map(item => ({ id: item.id, ownerId: item.ownerId, kind: item.kind, position: round(item.position) })),
  });
  async function phase(name, node, ids = ['alice', 'bob']) {
    const clients = [];
    for (const id of ids) clients.push(await join(node, id));
    const view = durable(await until(() => clients.every(client => client.snapshot.players.length >= ids.length) && clients[0].snapshot, `${name} roster`));
    receipt.phases.push({ name, revision: node.revision, epoch: node.epoch, view });
    return { clients, view };
  }
  const stateBytes = async () => (await redis.getBuffer(stateKey))?.toString('base64') ?? null;

  // 1. Production today: residents, a conversation and a creation in the starting district.
  let node = await boot(from, 1), { clients: [alice, bob] } = await phase('before', node);
  const spawn = alice.snapshot.players.find(player => player.id === 'alice').position;
  check('chat accepted', (await alice.send({ type: 'chat', text: 'Rehearsal: meet at the promenade.' })).ok);
  // The arrival is a street; a creation needs open ground. Find the nearest site the server's own check accepts.
  const startWorld = await worldFor(from), environment = createWalkingEnvironment(startWorld), roads = buildRoads(startWorld), seat = buildGeometry({ kind: 'seat' });
  let site = null;
  for (let radius = 4; radius < 80 && !site; radius += 2) for (let angle = 0; angle < Math.PI * 2 && !site; angle += Math.PI / 12) {
    const position = [spawn[0] + Math.cos(angle) * radius, spawn[1] + Math.sin(angle) * radius];
    if (environment.isFree(position[0], -position[1]) && !environment.roomAt(position[0], -position[1]) && !checkBuildSite({ environment, roads, position, kind: seat, builds: [] })?.reason) site = position;
  }
  const toSite = Math.hypot(site[0] - spawn[0], site[1] - spawn[1]), stand = [site[0] + (spawn[0] - site[0]) / toSite * 1.8, site[1] + (spawn[1] - site[1]) / toSite * 1.8];
  check('alice walks to open ground near the arrival', (await alice.send({ type: 'travel', position: stand })).ok);
  await delay(1200);
  const reply = await alice.send({ type: 'build', action: 'place', kind: 'seat', finish: 'rose', position: site, yaw: 0 }), placed = reply.ok ? reply.item : null;
  check('creation placed near the arrival', placed, reply.ok ? { id: placed.id, site: round(site) } : reply);
  check('bob walks to the promenade seam', (await bob.send({ type: 'travel', position: [commons.edge - 4, -1335] })).ok);
  await delay(1200);
  const before = durable(bob.snapshot);
  await stop(node);

  // 2. Control: a plain process replacement on unchanged configuration.
  node = await boot(from, 1);
  const control = (await phase('restart-unchanged', node)).view;
  check('a plain restart keeps accounts, chat, creations and positions', JSON.stringify({ ...control, revision: null }) === JSON.stringify({ ...before, revision: null }), { before, control });
  await stop(node);

  // 3. Activation: new revision, epoch raised, processes replaced. The first coordinator migrates once.
  const migratedBefore = logs.filter(line => line.includes('district_commons_checkpoint_migrated')).length;
  node = await boot(COMMONS_REVISION, 2);
  ({ clients: [alice, bob] } = await phase('activated', node));
  const activated = durable(alice.snapshot);
  check('the town now serves Bayou Market Commons', activated.revision === COMMONS_REVISION);
  check('activation keeps accounts, chat, creations and District positions', JSON.stringify({ ...activated, revision: null }) === JSON.stringify({ ...before, revision: null }), { before, activated });
  check('the migration is logged exactly once', logs.filter(line => line.includes('district_commons_checkpoint_migrated')).length === migratedBefore + 1, logs.filter(line => line.includes('migrated')));
  const lantern = commons.destination.lanterns[0];
  check('alice walks into the Commons by the gateway lantern', (await alice.send({ type: 'travel', position: [lantern.at[0] + 1.2, lantern.at[1]] })).ok);
  await delay(1200);
  const lit = await alice.send({ type: 'lanterns', action: 'light', lanternId: lantern.id });
  check('the Lantern Walk works on the activated town', lit.ok, lit);
  await delay(1100);
  check('chat in the Commons', (await bob.send({ type: 'chat', text: 'Rehearsal: the Bayou Lantern is ahead.' })).ok);
  await delay(300);
  const live = durable(alice.snapshot);

  // 4a. Overlap: while the new deployment coordinates, an old one still serving sockets only
  // relays to it. Its visitors see the new town (and its pages reload onto the new build).
  const stale = await boot(from, 1), relayed = await join(stale, 'carol', { expectSnapshot: false });
  check('an overlapping old deployment serves the new town, not its own', relayed.snapshot?.districtRevision === COMMONS_REVISION && relayed.snapshot.lanternWalk?.lanterns.some(item => item.lit), { districtRevision: relayed.snapshot?.districtRevision ?? null });
  check('the overlap leaves conversation and creations unchanged', JSON.stringify([durable(relayed.snapshot).chat, durable(relayed.snapshot).builds]) === JSON.stringify([live.chat, live.builds]));
  await stale.gateway.close();
  check('the live town keeps serving through the overlap', (await bob.send({ type: 'travel', position: [commons.edge - 5, -1335] })).ok);
  await delay(1100);
  const beforeRollback = durable(alice.snapshot);
  await stop(node);
  // 4b. With the new deployment gone, an old one left running must refuse to coordinate.
  const staleWarnings = logs.length, alone = await boot(from, 1), aloneJoin = await join(alone, 'carol', { expectSnapshot: false });
  check('an old deployment alone refuses to take the town back', !aloneJoin.snapshot && aloneJoin.refused === 1013, aloneJoin);
  check('operators see the refusal as a superseded district, not an outage', logs.slice(staleWarnings).some(line => line.includes('"reason":"district_superseded"') && line.includes('"district":"newer_district_epoch"')), logs.slice(staleWarnings));
  const afterRefusal = await stateBytes();
  await alone.gateway.close();
  check('the refusal leaves the durable town byte for byte unchanged', (await stateBytes()) === afterRefusal && afterRefusal !== null);

  // 5. Rollback by configuration, epoch raised again. The Commons recovers only to the Gardens
  // (district-commons-checkpoint-migration.js), so that is the rollback target from any start.
  // A rollback straight to the garage fails closed: the town is unavailable and nothing is
  // rewritten, and the correct Gardens rollback with another raise still recovers it.
  let epoch = 3;
  if (from !== ROLLBACK_REVISION) {
    const refusedFrom = logs.length, wrong = await boot(from, epoch++), wrongJoin = await join(wrong, 'alice', { expectSnapshot: false }), untouched = await stateBytes();
    check(`a rollback straight to ${from} fails closed`, !wrongJoin.snapshot && wrongJoin.refused === 1013 && logs.slice(refusedFrom).some(line => line.includes('"reason":"checkpoint_invalid"')), { wrongJoin, logs: logs.slice(refusedFrom) });
    await wrong.gateway.close();
    check('the failed rollback rewrites nothing', (await stateBytes()) === untouched);
  }
  node = await boot(ROLLBACK_REVISION, epoch++);
  ({ clients: [alice, bob] } = await phase('rolled-back', node));
  const rolled = durable(alice.snapshot);
  check('rollback serves the Gardens district', rolled.revision === ROLLBACK_REVISION);
  check('rollback keeps accounts, chat and creations', JSON.stringify([Object.keys(rolled.players).sort(), rolled.chat, rolled.builds]) === JSON.stringify([Object.keys(beforeRollback.players).sort(), beforeRollback.chat, beforeRollback.builds]), { beforeRollback, rolled });
  check('a resident left in the Commons is returned to District ground', rolled.players.alice.position[0] < commons.edge, rolled.players.alice);
  check('a resident in the District keeps their place', JSON.stringify(rolled.players.bob.position) === JSON.stringify(beforeRollback.players.bob.position), { before: beforeRollback.players.bob, after: rolled.players.bob });
  check('the Lantern Walk is left behind with the Commons', alice.snapshot.lanternWalk === undefined);
  await stop(node);
  const rolledBytes = await stateBytes(), staleCommons = await boot(COMMONS_REVISION, 2), staleCommonsJoin = await join(staleCommons, 'carol', { expectSnapshot: false });
  check('the superseded Commons deployment cannot re-take the town', !staleCommonsJoin.snapshot && staleCommonsJoin.refused === 1013, staleCommonsJoin);
  await staleCommons.gateway.close();
  check('the superseded deployment leaves the rolled-back town unchanged', (await stateBytes()) === rolledBytes);

  // 6. Re-activation after a rollback works the same way, with another raise.
  node = await boot(COMMONS_REVISION, epoch++);
  ({ clients: [alice] } = await phase('reactivated', node));
  const again = durable(alice.snapshot);
  check('re-activation keeps accounts, chat and creations', JSON.stringify([Object.keys(again.players).sort(), again.chat, again.builds]) === JSON.stringify([Object.keys(rolled.players).sort(), rolled.chat, rolled.builds]), { rolled, again });
  check('re-activation starts a fresh Lantern Walk round', alice.snapshot.lanternWalk && alice.snapshot.lanternWalk.lanterns.every(item => !item.lit));
  receipt.live = live; receipt.migrationLogs = logs.filter(line => line.includes('migrated'));
  if (process.env.RIVER_OAKS_REHEARSAL_RECEIPT) {
    const path = process.env.RIVER_OAKS_REHEARSAL_RECEIPT.replace('{from}', from);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ ...receipt, finishedAt: new Date().toISOString() }, null, 2));
  }
});
