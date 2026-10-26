// Local simulation comparison; not a hosted capacity or network latency claim.
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { loadDistrictData } from '../../server/district-data.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { createSharedWorld } from '../../server/world.js';
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
const report = { at: new Date().toISOString(), runtime: process.version, samples: [],
  scope: 'Same-process real shared simulation, 2 and 32 synthetic players, existing Gardens versus Commons expansion; 100 warmed 50ms ticks per case including accepted movement from every player. No regional partitioning, hosted network, Redis or production capacity claim.' };
for (const players of [2, 32]) for (const revision of ['river-oaks-gardens-3', 'east-garden-commons-market-1']) {
  const data = await loadDistrictData({ districtRevision: revision });
  let time = 1000;
  const world = createSharedWorld(data, { now: () => time }), environment = createWalkingEnvironment(data);
  const starts = new Map(), edge = data.eastGardenCommons?.edge ?? data.bounds_m[2];
  for (let i = 0; i < players; i++) {
    const id = `probe-${i}`;
    if (!world.join({ userId: id, name: id }).ok) throw new Error('Probe admission failed');
    const position = [edge + (data.eastGardenCommons && i % 2 ? 5 : -8), -1335];
    const result = world.command(id, { type: 'travel', position });
    if (!result.ok) throw new Error(`Probe arrival failed: ${result.error}`);
    starts.set(id, position);
  }
  for (let i = 0; i < 20; i++) { time += 50; world.step(.05); }
  const steps = [], snapshots = [];
  for (let i = 0; i < 100; i++) {
    time += 50; let start = performance.now();
    for (const [id, [x, north]] of starts) {
      const east = x + (i % 40 <= 20 ? i % 40 : 40 - i % 40) * .1;
      const moved = world.command(id, { type: 'pose', position: [east, north, environment.groundAt(east, -north)], yaw: i % 40 <= 20 ? -Math.PI / 2 : Math.PI / 2, altitude: 0 });
      if (!moved.ok) throw new Error(`Probe movement failed: ${moved.error}`);
    }
    world.step(.05); steps.push(performance.now() - start);
    start = performance.now(); world.snapshot(); snapshots.push(performance.now() - start);
  }
  report.samples.push({ revision, players, locals: world.snapshot().locals.length,
    stepP50Ms: percentile(steps, .5), stepP95Ms: percentile(steps, .95), stepMaxMs: Math.max(...steps),
    ticksOver50Ms: steps.filter(ms => ms > 50).length, snapshotP95Ms: percentile(snapshots, .95),
    snapshotBytes: Buffer.byteLength(JSON.stringify(world.snapshot())), checkpointBytes: Buffer.byteLength(JSON.stringify(world.checkpoint())) });
}
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
