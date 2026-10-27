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
import { HEIGHTS_REVISION, HEIGHTS_TABLE } from '../../shared/bayou-heights-layout.js';
import { plazaSalonSeats } from '../../preview/src/plaza-salon-plan.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';

// Operator rehearsal of the Bayou Heights rollout (docs/world-expansion-activation.md),
// through the real Redis gateway, tickets and WebSockets, adapted from the Commons
// rehearsal (#630) by the #586 support review. Each phase replaces the "process" with
// a fresh gateway on new configuration, as a deploy does: activate from the Commons,
// occupants standing, seated and airborne in Heights, a stale deployment overlapping
// the new one, rollback to the Commons, re-activation, and a chained rollback to
// Gardens. Fixture identities stay inside this harness.
// RIVER_OAKS_REHEARSAL_RECEIPT=<path> writes the evidence receipt.
const origin = 'http://127.0.0.1', delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const auth = { handle: async () => false, close() {}, isSessionActive: async () => true,
  authenticate: async req => {
    const id = req.headers.cookie?.match(/^fixture=(alice|bob|carol|dave|erin)$/)?.[1];
    return id ? { userId: id === 'carol' ? FLYER : id, name: id, sessionId: id, csrfToken: 'fixture-csrf', expiresAt: Date.now() + 120000 } : null;
  } };
// The owner fixture identity may fly (shared-appearances.js); carol signs in as it.
const FLYER = 'user_01M402HKJYDTH1QJM5NAQDZ4HH';
const round = position => position.map(value => Math.round(value * 100) / 100);
const until = async (check, label, tries = 160) => { for (let i = 0; i < tries; i++) { const value = check(); if (value) return value; await delay(50); } assert.fail(label); };

for (const from of [COMMONS_REVISION]) test(`Heights rehearsal from ${from}: activation, occupants, stale overlap, rollback to the Commons and chained rollback to Gardens`, {
  skip: !process.env.REDIS_URL, timeout: 180000,
}, async t => {
  const host = new URL(process.env.REDIS_URL).hostname;
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(host), 'the rehearsal only runs against a loopback, disposable Redis');
  const namespace = `river-oaks:activation-rehearsal:${randomUUID()}`, redis = new Redis(process.env.REDIS_URL), security = createRedisSecurity({ redis, prefix: `{${namespace}}` });
  const stateKey = `${roomPrefixFor(namespace)}:state`, sockets = new Set(), logs = [], receipt = { from, to: HEIGHTS_REVISION, namespace, phases: [], checks: [] };
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
  const commons = (await worldFor(COMMONS_REVISION)).eastGardenCommons, heightsData = await worldFor(HEIGHTS_REVISION), heights = heightsData.eastGardenCommons, west = heights.heights.bounds[0], frame = ([x, y]) => [heights.edge + x, -1335 + y];
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


  const migrations = () => logs.filter(line => line.includes('district_heights_checkpoint_migrated'));
  const people = ['alice', 'bob', 'carol', 'dave'];
  // 1. The Commons is live: four residents, a conversation, all near the arrival.
  let node = await boot(from, 1), { clients } = await phase('before', node, people);
  let [alice, bob, carol, dave] = clients;
  check('chat accepted', (await alice.send({ type: 'chat', text: 'Rehearsal: meet at the footbridge.' })).ok);
  await delay(300);
  const before = durable(alice.snapshot);
  await stop(node);

  // 2. Activation: Heights, epoch raised. The first coordinator migrates once, from the Commons.
  node = await boot(HEIGHTS_REVISION, 2);
  ({ clients } = await phase('activated', node, people)); [alice, bob, carol, dave] = clients;
  const activated = durable(alice.snapshot);
  check('the town now serves Bayou Heights', activated.revision === HEIGHTS_REVISION);
  check('activation keeps accounts, chat and positions', JSON.stringify({ ...activated, revision: null }) === JSON.stringify({ ...before, revision: null }), { before, activated });
  check('activation is logged once, from the Commons', migrations().length === 1 && migrations()[0].includes('"from":"commons"') && migrations()[0].includes('"to":"heights"'), migrations());

  // 3. Occupants: standing east of the bridge, seated at the icehouse table, airborne over Heights.
  check('alice walks east of the footbridge', (await alice.send({ type: 'travel', position: frame([200, 0]) })).ok);
  const seat = plazaSalonSeats(heightsData).find(item => item.buildId === `bench:plaza-salon-${HEIGHTS_TABLE}-0`);
  check('bob walks to the icehouse table', (await bob.send({ type: 'travel', position: seat.approach })).ok);
  check('carol walks to Nineteenth & Yale', (await carol.send({ type: 'travel', position: frame([300, 1.5]) })).ok);
  await delay(1500);
  check('bob sits at the icehouse table', (await bob.send({ type: 'sit', buildId: seat.buildId, slot: 0 })).ok);
  const flying = carol.snapshot.players.find(player => player.id === FLYER);
  const lift = await carol.send({ type: 'pose', position: flying.position, yaw: 0, altitude: 1 });
  check('carol is airborne over Heights', lift.ok, lift);
  await delay(1200);
  const live = durable(alice.snapshot);
  const sitting = alice.snapshot.players.find(player => player.id === 'bob')?.sitting;
  check('bob is seated before the rollback', Boolean(sitting), sitting);

  // 4. Overlap: an old Commons deployment relays to Heights; alone, it refuses to take the town back.
  const stale = await boot(from, 1), relayed = await join(stale, 'erin', { expectSnapshot: false });
  check('an overlapping Commons deployment serves the Heights town', relayed.snapshot?.districtRevision === HEIGHTS_REVISION, { districtRevision: relayed.snapshot?.districtRevision ?? null });
  await stale.gateway.close();
  await stop(node);
  const staleWarnings = logs.length, alone = await boot(from, 1), aloneJoin = await join(alone, 'erin', { expectSnapshot: false });
  check('an old Commons deployment alone refuses the town', !aloneJoin.snapshot && aloneJoin.refused === 1013, aloneJoin);
  check('operators see a superseded district', logs.slice(staleWarnings).some(line => line.includes('"reason":"district_superseded"')), logs.slice(staleWarnings));
  const untouched = await stateBytes();
  await alone.gateway.close();
  check('the refusal leaves the durable town unchanged', (await stateBytes()) === untouched && untouched !== null);

  // 5. Rollback to the Commons, epoch raised: Heights occupants stand on the Commons by the bridge.
  node = await boot(COMMONS_REVISION, 3);
  ({ clients } = await phase('rolled-back-commons', node, people)); [alice, bob, carol, dave] = clients;
  const rolled = durable(alice.snapshot), players = Object.fromEntries(alice.snapshot.players.map(player => [player.id, player]));
  check('rollback serves the Commons', rolled.revision === COMMONS_REVISION);
  check('rollback is logged from Heights to the Commons and moves the three occupants', migrations().length === 2 && migrations()[1].includes('"from":"heights"') && migrations()[1].includes('"to":"commons"') && migrations()[1].includes('"moved":3'), migrations());
  for (const id of ['alice', 'bob', FLYER]) check(`${id} stands on the Commons`, players[id].position[0] > commons.edge && players[id].position[0] < west && players[id].altitude === 0 && !players[id].sitting, players[id]);
  check('dave keeps his place', JSON.stringify(rolled.players.dave.position) === JSON.stringify(live.players.dave.position), { live: live.players.dave, rolled: rolled.players.dave });
  // erin joined through the overlapping deployment, so the roster may only grow.
  check('rollback keeps accounts and chat', Object.keys(live.players).every(id => id in rolled.players) && JSON.stringify(rolled.chat) === JSON.stringify(live.chat), { live: Object.keys(live.players), rolled: Object.keys(rolled.players) });
  await stop(node);
  const rolledBytes = await stateBytes(), staleHeights = await boot(HEIGHTS_REVISION, 2), staleJoin = await join(staleHeights, 'erin', { expectSnapshot: false });
  check('the superseded Heights deployment cannot re-take the town', !staleJoin.snapshot && staleJoin.refused === 1013, staleJoin);
  await staleHeights.gateway.close();
  check('and leaves the rolled-back town unchanged', (await stateBytes()) === rolledBytes);

  // 6. Re-activate, put someone in Heights again, then roll back straight to Gardens (chained).
  node = await boot(HEIGHTS_REVISION, 4);
  ({ clients } = await phase('reactivated', node, people)); [alice] = clients;
  const back = await alice.send({ type: 'travel', position: frame([200, 0]) });
  check('alice walks back into Heights', back.ok, back);
  await delay(1500);
  await stop(node);
  node = await boot(DISTRICT_REVISION_GARDENS, 5);
  ({ clients } = await phase('rolled-back-gardens', node, people)); [alice] = clients;
  const district = Object.fromEntries(alice.snapshot.players.map(player => [player.id, player]));
  check('the chained rollback serves Gardens', alice.snapshot.districtRevision === DISTRICT_REVISION_GARDENS);
  check('the chained rollback is logged from Heights to Gardens', migrations().length >= 4 && migrations().at(-1).includes('"from":"heights"') && migrations().at(-1).includes('"to":"gardens"'), migrations());
  for (const id of ['alice', 'bob', FLYER, 'dave']) check(`${id} stands in the District`, district[id].position[0] < commons.edge && district[id].altitude === 0, district[id]);
  receipt.live = live; receipt.migrationLogs = logs.filter(line => line.includes('migrated'));
  if (process.env.RIVER_OAKS_REHEARSAL_RECEIPT) {
    const path = process.env.RIVER_OAKS_REHEARSAL_RECEIPT.replace('{from}', from);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ ...receipt, finishedAt: new Date().toISOString() }, null, 2));
  }
});
