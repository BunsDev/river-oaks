import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import { officeRedis } from '../server/tests/helpers/office-redis.js';
import * as currentStore from '../server/office-workspaces.js';
import { createRedisOfficeDesk } from '../server/office-desk.js';
import * as currentVisits from '../server/office-workspace-visits.js';

// Compare the same synthetic workload with a historical store/visit module.
// Git reads only; dependencies continue to come from this checkout's lockfile.
const ref = process.argv[2];
let stores = currentStore, visits = currentVisits;
await mkdir('.runtime/office-reliability', { recursive: true });
if (ref) {
  const load = async name => {
    let source = execFileSync('git', ['show', `${ref}:server/${name}.js`], { encoding: 'utf8' });
    source = source.replace('../preview/src/office-desk-contract.js', pathToFileURL(resolve('preview/src/office-desk-contract.js')).href);
    const path = resolve(`.runtime/office-reliability/baseline-${name}.mjs`);
    await writeFile(path, source);
    return import(pathToFileURL(path).href);
  };
  stores = await load('office-workspaces');
  visits = await load('office-workspace-visits');
}
const fixture = await officeRedis();
let control;
const results = [];
try {
  const redis = await fixture.start();
  control = new Redis(fixture.port, '127.0.0.1');
  await control.ping();
  const stats = async () => Object.fromEntries((await control.info('commandstats')).split('\r\n')
    .flatMap(line => { const m = /^cmdstat_([^:]+):calls=(\d+)/.exec(line); return m && m[1] !== 'info' ? [[m[1], Number(m[2])]] : []; }));
  async function measure(size, round, operation, action) {
    const before = await stats(), stream = redis.connector.stream;
    const tx = stream.bytesWritten, rx = stream.bytesRead, start = performance.now();
    await action();
    const latencyMs = performance.now() - start;
    const sentBytes = stream.bytesWritten - tx, receivedBytes = stream.bytesRead - rx;
    const after = await stats(), commands = {};
    for (const [name, count] of Object.entries(after)) if (count > (before[name] ?? 0)) commands[name] = count - (before[name] ?? 0);
    results.push({ size, round, operation, commands, sentBytes, receivedBytes, latencyMs });
  }
  for (const size of ['empty', 'near-capacity']) for (let round = 0; round < 5; round++) {
    const prefix = `{office-cost-${size}-${round}}`, store = stores.createRedisOfficeWorkspaces({ redis, prefix, now: () => 100 });
    let workspace;
    await measure(size, round, 'provision-new', async () => { workspace = await store.provision('owner'); });
    const privateDesks = createRedisOfficeDesk({ redis, prefix, now: () => 100 });
    const id = workspace.id, residents = ['owner', 'alice', 'bob', 'carol'];
    for (const user of residents.slice(1)) { await store.provision(user); await store.invite('owner', id, user); await store.accept(user, id); }
    const task = i => ({ id: `task-${i}`, title: 'Synthetic daily work', notes: 'n'.repeat(4000), result: 'r'.repeat(1200), links: [], status: 'open' });
    let version = 0;
    if (size === 'near-capacity') for (let i = 0; i < 24; i++) {
      assert.equal((await store.save('owner', id, { expectedVersion: version++, operationId: `seed-${i}`, task: task(i) })).ok, true);
    }
    if (size === 'near-capacity') for (const user of residents) for (let i = 0; i < 24; i++) {
      assert.equal((await privateDesks.save(user, { expectedVersion: i, operationId: `seed-${i}`, task: task(i) })).ok, true);
    }
    const deskBytes = Buffer.byteLength(JSON.stringify((await store.read('owner', id)).desk));
    await measure(size, round, 'provision-existing', () => store.provision('owner'));
    await measure(size, round, 'discovery-four-residents', async () => { for (const user of residents) await store.list(user); });
    await measure(size, round, 'enter-four-residents', async () => { for (const user of residents) assert.ok(await visits.workspaceContext(store, user, { type: 'office', action: 'enter', officeId: id })); });
    await measure(size, round, 'walk-40-authorizations', async () => { for (let step = 0; step < 10; step++) for (const user of residents) assert.ok(await visits.workspaceContext(store, user, { type: 'office', action: 'move', officeId: id })); });
    await measure(size, round, 'reconcile-four-visits', () => visits.reconcileOfficeVisits({ players: new Map(residents.map(user => [user, {}])), officeVisit: () => ({ id }), endOfficeVisit() { throw Error('Unexpected removal'); } }, store));
    await measure(size, round, 'read-four-residents', async () => { for (const user of residents) assert.equal((await store.read(user, id)).ok, true); });
    await measure(size, round, 'private-read-four-residents', async () => { for (const user of residents) await privateDesks.read(user); });
    await measure(size, round, 'private-save', async () => assert.equal((await privateDesks.save('alice', { expectedVersion: version, operationId: 'measured-save', task: task(0) })).ok, true));
    await measure(size, round, 'save', async () => assert.equal((await store.save('alice', id, { expectedVersion: version, operationId: 'measured-save', task: task(0) })).ok, true));
    await measure(size, round, 'revoke-and-deny', async () => { assert.equal((await store.revoke('owner', id, 'alice')).ok, true); assert.equal((await store.read('alice', id)).ok, false); });
    results.filter(row => row.size === size && row.round === round).forEach(row => { row.deskBytes = deskBytes; });
  }
  const summary = [];
  for (const size of ['empty', 'near-capacity']) for (const operation of [...new Set(results.map(r => r.operation))]) {
    const rows = results.filter(r => r.size === size && r.operation === operation), latencies = rows.map(r => r.latencyMs).sort((a,b) => a-b);
    summary.push({ size, operation, deskBytes: rows[0].deskBytes, commands: rows[0].commands,
      sentBytes: rows.reduce((n,r) => n+r.sentBytes,0)/rows.length, receivedBytes: rows.reduce((n,r) => n+r.receivedBytes,0)/rows.length,
      medianMs: latencies[2], maxMs: latencies[4] });
  }
  const report = { revision: ref ?? 'working-tree', measuredAt: new Date().toISOString(),
    scope: 'Office-store/authorization calls only, RESP socket bytes and Redis commandstats including Lua subcommands; loopback AOF always; 5 samples; no auth/room transport costs or production latency claim.', summary, results };
  const output = `.runtime/office-reliability/cost-${ref ? 'baseline' : 'after'}.json`;
  await writeFile(output, JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify({ output, summary }, null, 2));
} finally { control?.disconnect(); await fixture.close(); }
