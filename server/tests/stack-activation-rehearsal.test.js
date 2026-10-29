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
import { HEIGHTS_REVISION } from '../../shared/bayou-heights-layout.js';
import { STUDEWOOD_REVISION, inStudewood } from '../../shared/studewood-layout.js';
import { TERRACES_REVISION, inBayouTerraces } from '../../shared/bayou-terraces-layout.js';
import { WOODLAND_REVISION, inWoodlandHeights } from '../../shared/woodland-heights-layout.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';

// Operator rehearsal of the whole 3x stack (docs/world-expansion-activation.md, "Activating
// the stack"), through the real Redis gateway, tickets and WebSockets, modelled on the
// Heights rehearsal. Each phase replaces the "process" with a fresh gateway on new
// configuration, as a deploy does. It walks the stack up one revision and one epoch at a
// time (Gardens, Commons, Heights, Studewood, Terraces, Woodland Heights), each step
// logging exactly one migration event; puts an occupant in each of the four Heights-side
// districts; rolls back from Woodland Heights straight to Gardens in one step; re-activates
// Woodland Heights directly from Gardens; and rolls back step by step to Gardens. After
// every rollback nobody stands in removed ground, nobody is airborne or seated, and at the
// end everyone is on District ground west of the Commons edge. Fixture identities only.
// RIVER_OAKS_REHEARSAL_RECEIPT=<path> writes the evidence receipt.
const origin = 'http://127.0.0.1', delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const auth = { handle: async () => false, close() {}, isSessionActive: async () => true,
  authenticate: async req => {
    const id = req.headers.cookie?.match(/^fixture=(alice|bob|carol|dave)$/)?.[1];
    return id ? { userId: id, name: id, sessionId: id, csrfToken: 'fixture-csrf', expiresAt: Date.now() + 120000 } : null;
  } };
const round = position => position.map(value => Math.round(value * 100) / 100);
const until = async (check, label, tries = 160) => { for (let i = 0; i < tries; i++) { const value = check(); if (value) return value; await delay(50); } assert.fail(label); };
// Revision, its district label in the migration log and the event the first coordinator logs.
const STACK = [
  [DISTRICT_REVISION_GARDENS, 'gardens', 'district_gardens_checkpoint_migrated'],
  [COMMONS_REVISION, 'commons', 'district_commons_checkpoint_migrated'],
  [HEIGHTS_REVISION, 'heights', 'district_heights_checkpoint_migrated'],
  [STUDEWOOD_REVISION, 'studewood', 'district_studewood_checkpoint_migrated'],
  [TERRACES_REVISION, 'terraces', 'district_terraces_checkpoint_migrated'],
  [WOODLAND_REVISION, 'woodland', 'district_woodland_checkpoint_migrated'],
];
const labelOf = Object.fromEntries(STACK.map(([revision, label]) => [revision, label]));
const eventOf = Object.fromEntries(STACK.map(([revision, , event]) => [revision, event]));

test('Stack rehearsal from Gardens: up one step at a time, occupants in every district, rollback to Gardens in one step, direct re-activation, rollback step by step', {
  skip: !process.env.REDIS_URL, timeout: 300000,
}, async t => {
  const host = new URL(process.env.REDIS_URL).hostname;
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(host), 'the rehearsal only runs against a loopback, disposable Redis');
  const namespace = `river-oaks:stack-rehearsal:${randomUUID()}`, redis = new Redis(process.env.REDIS_URL), security = createRedisSecurity({ redis, prefix: `{${namespace}}` });
  const stateKey = `${roomPrefixFor(namespace)}:state`, sockets = new Set(), logs = [], receipt = { from: DISTRICT_REVISION_GARDENS, to: WOODLAND_REVISION, namespace, phases: [], checks: [], steps: [] };
  const info = console.info, warn = console.warn; console.info = (...args) => { logs.push(args.join(' ')); }; console.warn = (...args) => { logs.push(args.join(' ')); };
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
  const layouts = Object.fromEntries(await Promise.all(STACK.map(async ([revision]) => [revision, (await worldFor(revision)).eastGardenCommons])));
  const woodland = layouts[WOODLAND_REVISION], frame = ([x, y]) => [woodland.edge + x, -1335 + y];
  const commonsEdge = layouts[COMMONS_REVISION].edge, heightsWest = layouts[HEIGHTS_REVISION].heights.bounds[0];
  const check = (name, ok, detail = null) => { receipt.checks.push({ name, ok: Boolean(ok), ...(detail === null ? {} : { detail }) }); assert.ok(ok, `${name}${detail ? `: ${JSON.stringify(detail)}` : ''}`); };

  async function boot(revision, epoch) {
    const gateway = createWorldGateway({ redis, namespace, worldData: await worldFor(revision), auth, security, waitlist: approvedWaitlist, origin, districtEpoch: epoch, isAdmin: id => id === 'alice' });
    const close = gateway.close.bind(gateway); let closing = null; gateway.close = () => closing ??= close();
    gateways.add(gateway);
    await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
    return { gateway, base: `http://127.0.0.1:${gateway.server.address().port}`, revision, epoch };
  }
  // Production deploy steps are minutes apart; here they are seconds apart, so the ticket
  // window (10 per user per minute, redis-security.js) would refuse the 11th step on a fast
  // runner: a 429 for bob at epoch 10, seen on hosted runs that reached it in under 40 s.
  // Every step starts with a fresh window, as a real deploy would.
  async function stop(node) {
    for (const ws of sockets) ws.terminate(); sockets.clear(); await node.gateway.close(); await delay(50);
    const windows = await redis.keys(`{${namespace}}:limit:tickets:*`); if (windows.length) await redis.del(...windows);
  }
  async function join(node, id) {
    const headers = { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'fixture-csrf' };
    const response = await fetch(`${node.base}/api/multiplayer/ticket`, { method: 'POST', headers });
    assert.equal(response.status, 200, `${id} ticket on ${node.revision}@${node.epoch}`);
    const { ticket } = await response.json();
    const ws = new WebSocket(`${node.base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers });
    sockets.add(ws);
    let snapshot = null, sequence = 0, opened = null, closed = null, first = null;
    const pending = new Map(), received = [], started = Date.now();
    ws.on('error', () => {});
    ws.on('open', () => { opened = Date.now() - started; });
    ws.on('close', (code, reason) => { closed = { code, reason: String(reason), afterMs: Date.now() - started }; });
    ws.on('message', raw => { const value = JSON.parse(raw); first ??= Date.now() - started; if (received.length < 12) received.push(value.type); if (value.type === 'snapshot') snapshot = value; if (value.type === 'result') pending.get(value.requestId)?.(value); });
    // The first join of a freshly booted node waits on that node's boot work: loading the room
    // from Redis and, after a stack step, migrating the checkpoint to the revision now served.
    // The one-step rollback from Woodland Heights to Gardens is the longest (1.6 s locally at
    // load 6, every other step under 1.4 s); on hosted runners it outlived the 7 s request
    // window and the node closed the join with 1013 (#754). redis-room.js now pays that load
    // outside the first request's budget, so the join waits for it; thirty seconds here is a
    // margin for the runner, not a behavior change: a node that never answers still fails.
    // When the snapshot never comes, say what did: the socket's open and close, the first
    // message types, and the node's own log lines for this epoch (migration events, refusals),
    // so a hosted failure attributes itself instead of reading as a slow runner.
    await until(() => snapshot || closed, `${id} snapshot on ${node.revision}@${node.epoch}`, 600);
    if (!snapshot) assert.fail(`${id} snapshot on ${node.revision}@${node.epoch}: ${JSON.stringify({ waitedMs: Date.now() - started, openedAfterMs: opened, firstMessageAfterMs: first, received, closed, readyState: ws.readyState, log: logs.slice(-12) })}`);
    const send = message => new Promise((resolve, reject) => {
      const requestId = String(++sequence), timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${message.type} timed out`)); }, 8000);
      pending.set(requestId, value => { clearTimeout(timer); pending.delete(requestId); resolve(value); });
      ws.send(JSON.stringify({ ...message, requestId }));
    });
    return { id, ws, send, get snapshot() { return snapshot; } };
  }
  const durable = snapshot => ({
    revision: snapshot.districtRevision,
    players: Object.fromEntries(snapshot.players.map(player => [player.id, { name: player.name, position: round(player.position) }])),
    chat: snapshot.chat.map(entry => `${entry.authorId}:${entry.text}`),
    builds: snapshot.builds.map(item => ({ id: item.id, ownerId: item.ownerId, kind: item.kind, position: round(item.position) })),
  });
  const people = ['alice', 'bob', 'carol', 'dave'];
  async function phase(name, node) {
    const clients = [];
    for (const id of people) clients.push(await join(node, id));
    const view = durable(await until(() => clients.every(client => client.snapshot.players.length >= people.length) && clients[0].snapshot, `${name} roster`));
    receipt.phases.push({ name, revision: node.revision, epoch: node.epoch, view });
    return { clients, view };
  }
  const stateBytes = async () => (await redis.getBuffer(stateKey))?.toString('base64') ?? null;
  const migrations = () => logs.filter(line => /"event":"district_(gardens|commons|heights|studewood|terraces|woodland)_checkpoint_migrated"/.test(line));
  const players = snapshot => Object.fromEntries(snapshot.players.map(player => [player.id, player]));
  const where = player => ({ east: Math.round((player.position[0] - woodland.edge) * 100) / 100, north: Math.round((player.position[1] + 1335) * 100) / 100, altitude: player.altitude, sitting: Boolean(player.sitting) });

  // One deploy step: boot the next configuration, join everyone, and require exactly one new
  // migration event, from the revision just left to the one now served.
  let node = null, clients = [], step = 0;
  async function deploy(name, revision, { from, moved = null, event = eventOf[revision] } = {}) {
    if (node) await stop(node);
    const seen = migrations().length;
    node = await boot(revision, ++step);
    ({ clients } = await phase(name, node));
    const fresh = migrations().slice(seen);
    const summary = { name, revision, epoch: step, from, to: labelOf[revision], event, logged: fresh };
    receipt.steps.push(summary);
    check(`${name}: the town serves ${revision}`, clients[0].snapshot.districtRevision === revision, { served: clients[0].snapshot.districtRevision });
    check(`${name}: exactly one migration event`, fresh.length === 1, fresh);
    check(`${name}: logged as ${event} from ${from} to ${labelOf[revision]}`, fresh[0]?.includes(`"event":"${event}"`) && fresh[0].includes(`"from":"${from}"`) && fresh[0].includes(`"to":"${labelOf[revision]}"`), fresh[0]);
    if (moved !== null) check(`${name}: moved ${moved}`, fresh[0]?.includes(`"moved":${moved}`), fresh[0]);
    return clients;
  }

  // 1. Gardens is live: four residents and a conversation, all at the District arrival. No migration.
  node = await boot(DISTRICT_REVISION_GARDENS, ++step);
  ({ clients } = await phase('gardens', node));
  let [alice] = clients;
  check('chat accepted', (await alice.send({ type: 'chat', text: 'Stack rehearsal: meet at the arrival.' })).ok);
  await delay(300);
  const before = durable(alice.snapshot);
  check('a plain Gardens start migrates nothing', migrations().length === 0, migrations());

  // 2. Up the stack, one revision and one epoch raise per deploy; nobody is east of the District, so moved is 0.
  let previous = DISTRICT_REVISION_GARDENS;
  for (const revision of [COMMONS_REVISION, HEIGHTS_REVISION, STUDEWOOD_REVISION, TERRACES_REVISION, WOODLAND_REVISION]) {
    [alice] = await deploy(`activate ${labelOf[revision]}`, revision, { from: labelOf[previous], moved: 0 });
    const now = durable(alice.snapshot);
    check(`activate ${labelOf[revision]}: accounts, chat and positions survive`, JSON.stringify({ ...now, revision: null }) === JSON.stringify({ ...before, revision: null }), { before, now });
    previous = revision;
  }

  // 3. Occupants: one standing in each Heights-side district the stack added.
  const [, bob, carol, dave] = clients;
  const stations = [
    ['alice', alice, frame([545, 111.5]), 'Twentieth Street in Woodland Heights', player => inWoodlandHeights(woodland, player.position[0])],
    ['bob', bob, frame([472, 40]), 'Studewood Park', player => inStudewood(woodland, player.position[0]) && !inWoodlandHeights(woodland, player.position[0])],
    ['dave', dave, frame([60, 130]), 'the north terrace gardens', player => inBayouTerraces(woodland, player.position[0], player.position[1])],
    ['carol', carol, frame([200, 0]), 'Nineteenth Street in Bayou Heights', player => player.position[0] > heightsWest && !inStudewood(woodland, player.position[0]) && !inBayouTerraces(woodland, player.position[0], player.position[1])],
  ];
  for (const [id, client, position, place] of stations) { const result = await client.send({ type: 'travel', position }); check(`${id} travels to ${place}`, result.ok, result); }
  await delay(2000);
  let live = players(alice.snapshot);
  for (const [id, , , place, inside] of stations) check(`${id} stands in ${place}`, inside(live[id]) && live[id].altitude === 0, where(live[id]));
  const occupied = durable(alice.snapshot);

  // 4. Rollback from Woodland Heights straight to Gardens in one step: everyone east of the District edge is walked home.
  [alice] = await deploy('rollback woodland to gardens in one step', DISTRICT_REVISION_GARDENS, { from: 'woodland', moved: 4, event: 'district_woodland_checkpoint_migrated' });
  live = players(alice.snapshot);
  for (const id of people) check(`${id} stands in the District after the one-step rollback`, live[id].position[0] < commonsEdge && live[id].altitude === 0 && !live[id].sitting, where(live[id]));
  check('the one-step rollback keeps accounts and chat', JSON.stringify(Object.keys(durable(alice.snapshot).players).sort()) === JSON.stringify(Object.keys(occupied.players).sort()) && JSON.stringify(durable(alice.snapshot).chat) === JSON.stringify(occupied.chat));
  await stop(node);
  const rolledBytes = await stateBytes();
  const stale = await boot(WOODLAND_REVISION, step), staleJoin = await (async () => { try { return await join(stale, 'bob'); } catch (error) { return { refused: error.message }; } })();
  check('a superseded Woodland deployment cannot re-take the town', !staleJoin.snapshot, staleJoin.refused ?? staleJoin.snapshot?.districtRevision);
  await stale.gateway.close(); for (const ws of sockets) ws.terminate(); sockets.clear();
  check('and leaves the rolled-back town unchanged', (await stateBytes()) === rolledBytes && rolledBytes !== null);
  node = null;

  // 5. Re-activate Woodland Heights directly from Gardens (the chained activation), then occupy every district again.
  [alice] = await deploy('activate woodland directly from gardens', WOODLAND_REVISION, { from: 'gardens', moved: 0 });
  const again = clients;
  for (const [index, [id, , position, place]] of stations.entries()) { const result = await again[people.indexOf(id)].send({ type: 'travel', position }); check(`${id} travels back to ${place}`, result.ok, result); void index; }
  await delay(2000);
  live = players(alice.snapshot);
  for (const [id, , , place, inside] of stations) check(`${id} stands in ${place} again`, inside(live[id]) && live[id].altitude === 0, where(live[id]));

  // 6. Rollback step by step. Each step removes one district; whoever stood in it is walked onto the ground that remains.
  const down = [
    [TERRACES_REVISION, 'woodland', player => !inWoodlandHeights(woodland, player.position[0])],
    [STUDEWOOD_REVISION, 'terraces', player => !inBayouTerraces(woodland, player.position[0], player.position[1])],
    [HEIGHTS_REVISION, 'studewood', player => !inStudewood(woodland, player.position[0])],
    [COMMONS_REVISION, 'heights', player => player.position[0] < heightsWest],
    [DISTRICT_REVISION_GARDENS, 'commons', player => player.position[0] < commonsEdge],
  ];
  for (const [revision, from, clear] of down) {
    [alice] = await deploy(`rollback ${from} to ${labelOf[revision]}`, revision, { from, event: eventOf[STACK.find(([, label]) => label === from)[0]] });
    live = players(alice.snapshot);
    const fresh = receipt.steps.at(-1).logged[0] ?? '';
    check(`rollback ${from} to ${labelOf[revision]}: at least one player was walked out of ${from}`, /"moved":[1-9]/.test(fresh), fresh);
    for (const id of people) check(`${id} is clear of ${from} and on the ground`, clear(live[id]) && live[id].altitude === 0 && !live[id].sitting, where(live[id]));
  }
  check('the stepwise rollback ends with everyone in the District', people.every(id => live[id].position[0] < commonsEdge), Object.fromEntries(people.map(id => [id, where(live[id])])));
  check('accounts and chat survive the whole stack', JSON.stringify(Object.keys(durable(alice.snapshot).players).sort()) === JSON.stringify(Object.keys(before.players).sort()) && JSON.stringify(durable(alice.snapshot).chat) === JSON.stringify(before.chat));
  check('thirteen deploys, twelve migrations, one each', step === 13 && migrations().length === 12, { deploys: step, migrations: migrations().length });
  receipt.migrationLogs = migrations();
  if (process.env.RIVER_OAKS_REHEARSAL_RECEIPT) {
    const path = process.env.RIVER_OAKS_REHEARSAL_RECEIPT;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ ...receipt, finishedAt: new Date().toISOString() }, null, 2));
  }
});
