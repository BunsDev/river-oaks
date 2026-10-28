// Reproducible crime workload probe (#640 increment 5, #599 protocol of 2026-10-24). Server
// simulation only: a synthetic town with 1/8/16/32 players standing around the service lane
// rival at five stars, each striking every second while the police respond (six-officer cap).
// Reports step p95, snapshot and checkpoint bytes per tier, two runs each. No transport, no
// browser, no Redis; numbers are measurements on this host, not budgets.
//   node server/crime-workload.js [out.json] [--players 1,8,16,32] [--runs 2] [--seconds 20] [--label main]
//     [--mode sustained|literal] [--baseline other-report.json]
// `literal` follows the protocol to the letter: the rival is down after four hits for 20 s and
// officers carry the standing strikers off to the safe arrival, so the town goes quiet within a
// few seconds. `sustained` (default) restores the rival, the five stars and the ring every
// simulated second through the town's own sealed checkpoint, outside the measured step, so every
// tier keeps striking, flinching and arresting for the whole window. `--baseline` embeds another
// head's report so one file carries the comparison.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadavg } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createSharedWorld } from './world.js';
import { CRIME_RULES, CRIME_TARGETS } from './crime.js';
import { POLICE_RULES } from './police.js';

const args = process.argv.slice(2).flatMap(arg => arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg]);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); const value = index >= 0 ? args[index + 1] : undefined; return value !== undefined && !value.startsWith('--') ? value : fallback; };
const outPath = args.find((arg, index) => !arg.startsWith('--') && (index === 0 || !args[index - 1].startsWith('--')));
const tiers = option('players', '1,8,16,32').split(',').map(Number);
if (tiers.some(count => !Number.isInteger(count) || count < 1)) throw new Error(`--players wants positive integers, got ${option('players', '')}`);
const runs = Number(option('runs', 2)), seconds = Number(option('seconds', 20)), label = option('label', 'unlabelled'), mode = option('mode', 'sustained');
if (!['sustained', 'literal'].includes(mode)) throw new Error(`--mode is sustained or literal, got ${mode}`);
const baselinePath = option('baseline', null);
const district = JSON.parse(await readFile(new URL('../preview/public/data/district.json', import.meta.url)));
district.vegetation = JSON.parse(await readFile(new URL('../preview/public/data/district-vegetation.json', import.meta.url)));
const RIVAL = CRIME_TARGETS['river-oaks'].find(target => target.id === 'rival:service-lane');
const ZONE = 'south-service-lane', OWNER = 'crime-0', STEP_MS = 50;
const quantile = (samples, fraction) => { const sorted = [...samples].sort((a, b) => a - b); return Math.round((sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0) * 100) / 100; };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const seal = value => ({ ...value, checksum: digest({ version: value.version, worldId: value.worldId, worldFingerprint: value.worldFingerprint, payload: value.payload }) });
const git = (...argv) => { try { return execFileSync('git', argv, { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim(); } catch { return null; } };

function workload(players) {
  const clock = { time: 5_000_000 };
  const world = createSharedWorld(district, { now: () => clock.time, isAdmin: id => id === OWNER });
  const ids = Array.from({ length: players }, (_, i) => `crime-${i}`);
  const ground = () => world.snapshot().crime.targets.find(target => target.id === RIVAL.id).position[2];
  const place = () => ids.forEach((id, i) => { const angle = i / players * 2 * Math.PI; world.players.get(id).position = [RIVAL.position[0] + 1.2 * Math.cos(angle), RIVAL.position[1] + 1.2 * Math.sin(angle), ground()]; });
  const join = () => { for (const id of ids) if (!world.players.has(id) && !world.join({ userId: id, name: id }).ok) throw new Error(`Admission failed: ${id}`); place(); };
  join();
  clock.time += 1000;
  const policy = world.command(OWNER, { type: 'worldPolicy', action: 'update', expectedRevision: world.worldPolicy().revision, changes: { violence: { mode: 'forced', zones: [ZONE] } } });
  if (!policy.ok) throw new Error(`Policy: ${JSON.stringify(policy)}`);
  // Every player starts at five stars: the same checkpoint the town writes, with the wanted list set.
  // In sustained mode the same reset also brings the rival back up and clears the arrests, so the
  // fight never settles; it runs between measured steps, through the town's own validation.
  let resets = 0;
  const reset = () => {
    const saved = world.checkpoint();
    saved.payload.crime.wanted = ids.map(id => [id, { stars: CRIME_RULES.maxStars, quietSince: clock.time }]);
    if (mode === 'sustained') {
      saved.payload.crime.rivals = saved.payload.crime.rivals.map(rival => ({ ...rival, health: CRIME_RULES.maxHealth, hitAt: null }));
      saved.payload.police = { ...saved.payload.police, surrendered: [], subdued: [], units: saved.payload.police.units.filter(unit => unit.state !== 'arrest') };
    }
    const restored = world.restore(seal(saved));
    if (!restored.ok) throw new Error(`Restore: ${JSON.stringify(restored)}`);
    join(); resets++;
  };
  reset();
  const step = [], snapshot = [], checkpoint = [], admitted = {}, outcomes = {};
  let snapshotBytes = 0, checkpointBytes = 0, policeUnits = 0, policeMax = 0, strikes = 0, seen = new Set();
  const tally = (table, key) => { table[key] = (table[key] ?? 0) + 1; };
  const strike = () => { for (const id of ids) { const reply = world.command(id, { type: 'attack', targetId: RIVAL.id, attackKind: 'melee' }); tally(admitted, reply.ok ? 'ok' : reply.error ?? 'error'); if (reply.ok) strikes++; } };
  const count = () => { const view = world.snapshot(); policeUnits = view.police.units.length; policeMax = Math.max(policeMax, policeUnits);
    for (const action of view.crime.actions) if (action.outcome && !seen.has(action.id)) { seen.add(action.id); tally(outcomes, `${action.kind}:${action.outcome}`); } };
  const tick = (measure) => { clock.time += STEP_MS; const start = performance.now(); world.step(STEP_MS / 1000); const ms = performance.now() - start; if (measure) step.push(ms); };
  // Warm navigation and the police response before measuring: two simulated seconds (not tallied).
  for (let i = 0; i < 2000 / STEP_MS; i++) { if (i % (1000 / STEP_MS) === 0) { if (mode === 'sustained') reset(); for (const id of ids) world.command(id, { type: 'attack', targetId: RIVAL.id, attackKind: 'melee' }); } tick(false); }
  resets = 0; seen = new Set(world.snapshot().crime.actions.map(action => action.id));
  const steps = Math.round(seconds * 1000 / STEP_MS);
  for (let i = 0; i < steps; i++) {
    if (i % (1000 / STEP_MS) === 0) { if (mode === 'sustained') reset(); strike(); }
    tick(true);
    if (i % 4 === 0) {
      let start = performance.now(); const view = world.snapshot(); snapshot.push(performance.now() - start); snapshotBytes = Buffer.byteLength(JSON.stringify(view));
      start = performance.now(); const durable = world.checkpoint(); checkpoint.push(performance.now() - start); checkpointBytes = Buffer.byteLength(JSON.stringify(durable));
      count();
    }
  }
  count();
  const view = world.snapshot();
  return { players, mode, seconds, steps, resets, stepP95Ms: quantile(step, .95), stepMaxMs: quantile(step, 1), stepMeanMs: Math.round(step.reduce((a, b) => a + b, 0) / step.length * 100) / 100,
    stepOver50Ms: step.filter(ms => ms > 50).length, snapshotP95Ms: quantile(snapshot, .95), checkpointP95Ms: quantile(checkpoint, .95), snapshotBytes, checkpointBytes,
    policeUnitsAtEnd: policeUnits, policeUnitsMax: policeMax, policeCap: POLICE_RULES.maxUnits, wantedAtEnd: view.crime.wanted.length, starsAtEnd: view.crime.wanted.length ? Math.min(...view.crime.wanted.map(([, stars]) => stars)) : 0,
    strikesAdmitted: strikes, admission: admitted, outcomes, actionsShown: view.crime.actions.length, rivalHealth: view.crime.targets.find(target => target.id === RIVAL.id).health, npcs: view.locals.length };
}

const report = { at: new Date().toISOString(), label, mode, head: git('rev-parse', 'HEAD'), dirty: Boolean(git('status', '--porcelain')), runtime: process.version, platform: `${process.platform}/${process.arch}`, loadavg: loadavg().map(value => Math.round(value * 100) / 100),
  protocol: `Server simulation only (createSharedWorld, ${STEP_MS} ms steps on a synthetic clock); every player at five stars in ${ZONE} strikes ${RIVAL.id} every simulated second; officers respond up to the cap of ${POLICE_RULES.maxUnits} (one wanted player draws at most ${Math.ceil(CRIME_RULES.maxStars / 2)}); ${runs} runs of ${seconds} s per tier after a 2 s warm-up. `
    + (mode === 'literal' ? `Literal protocol: the rival is down after four hits for ${CRIME_RULES.recoveryMs / 1000} s and arrested strikers are returned to the safe arrival, so the town goes quiet within seconds and later strikes mostly miss. `
      : 'Sustained: the rival, the five stars and the ring are restored every simulated second through a sealed checkpoint outside the measured step. ')
    + 'Measurements on this host (see loadavg), not budgets.',
  tiers: [] };
for (const players of tiers) report.tiers.push({ players, runs: Array.from({ length: runs }, () => workload(players)) });
if (baselinePath) { const baseline = JSON.parse(await readFile(baselinePath, 'utf8')); report.baseline = { label: baseline.label, mode: baseline.mode, head: baseline.head, dirty: baseline.dirty, at: baseline.at, loadavg: baseline.loadavg, tiers: baseline.tiers }; }
if (outPath) await writeFile(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
