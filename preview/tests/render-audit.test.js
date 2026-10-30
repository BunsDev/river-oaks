import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderAudit } from '../src/render-audit.js';
import { distribution, auditOptions, gestureWait, peerRoster } from '../audit/metrics.js';
import { rivalFigures, policeFigures } from '../src/crime-ui.js';
import { CRIME_TARGETS } from '../../server/crime.js';

test('frame audit resets between tiers and signals overflow rather than omitting slow frames silently', () => {
  const audit = createRenderAudit({ limit: 2 });
  audit.frame(1, 99);
  audit.start(); audit.frame(100, 1); audit.frame(116, 3); audit.frame(500, 8); audit.frame(516, 2);
  assert.deepEqual(audit.stop(), { frames: [{ intervalMs: 16, cpuMs: 3 }, { intervalMs: 384, cpuMs: 8 }], overflow: true });
  audit.frame(999, 999);
  audit.start(); audit.frame(1000, 2); audit.frame(1017, 4);
  assert.deepEqual(audit.stop(), { frames: [{ intervalMs: 17, cpuMs: 4 }], overflow: false });
});

test('capacity timing rejects empty/invalid evidence and retains tail stalls', () => {
  assert.throws(() => distribution([])); assert.throws(() => distribution([1, NaN])); assert.throws(() => distribution([-1]));
  const samples = [...Array(99).fill(16), 800];
  assert.deepEqual(distribution(samples), { count: 100, p50Ms: 16, p95Ms: 16, p99Ms: 16, maxMs: 800 });
  assert.equal(samples.at(-1), 800);
});

// The town the page draws (#778): the snapshot's players plus its authored rivals
// and police units, through the same figure builders main.js syncs into the registry.
function townAt(playerCount, { police = [], ready = () => true, drop = null } = {}) {
  const players = Array.from({ length: playerCount }, (_, i) => ({ id: i ? `actor-${i - 1}` : 'viewer', position: [i, 0, 0] }));
  const crime = { targets: CRIME_TARGETS['river-oaks'].map(rival => ({ ...rival, position: [...rival.position, 0], incapacitated: false, staggered: false })) };
  const drawn = [...players.filter(player => player.id !== 'viewer'), ...rivalFigures(crime), ...policeFigures({ units: police })];
  return { connected: true, selfId: 'viewer', snapshot: { players },
    remotes: drawn.filter(figure => figure.id !== drop).map(figure => ({ id: figure.id, ready: ready(figure.id), onScreen: true })) };
}

test('tier convergence counts other players by roster id, not the town figures drawn beside them', () => {
  const police = [{ id: 'police:0', position: [5, 5, 0], yaw: 0, state: 'pursue' }];
  for (const count of [1, 8, 16, 32]) {
    const town = townAt(count, { police }), roster = peerRoster(town, count);
    // The registry is longer than the tier by the two rivals and one officer: the length check #778 tripped on.
    assert.equal(town.remotes.length, count - 1 + 3);
    assert.equal(roster.converged, true, `tier ${count}`);
    assert.deepEqual(roster.peers.map(peer => peer.id), Array.from({ length: count - 1 }, (_, i) => `actor-${i}`));
    assert.deepEqual(roster.figures.map(figure => figure.id), ['rival:westcreek', 'rival:service-lane', 'police:0']);
  }
});

test('tier convergence still waits for every player, every load and the right tier', () => {
  assert.equal(peerRoster(townAt(8, { drop: 'actor-3' }), 8).converged, false, 'a peer missing from the registry');
  assert.equal(peerRoster(townAt(8, { ready: id => id !== 'actor-6' }), 8).converged, false, 'a peer still loading');
  assert.equal(peerRoster(townAt(8, { ready: id => id !== 'rival:westcreek' }), 8).converged, false, 'a town figure still loading during the sample');
  assert.equal(peerRoster(townAt(8), 16).converged, false, 'the roster has not reached the tier');
  assert.equal(peerRoster({ ...townAt(8), connected: false }, 8).converged, false, 'disconnected');
  assert.equal(peerRoster(undefined, 1).converged, false, 'no town hook yet');
  // Two rivals must not stand in for two absent players.
  const short = townAt(8, { drop: 'actor-0' });
  short.remotes = short.remotes.filter(remote => remote.id !== 'actor-1');
  assert.equal(short.remotes.length, 7);
  assert.equal(peerRoster(short, 8).converged, false);
  // After everyone leaves, the viewer still draws the rivals: no player peers remain.
  const alone = peerRoster(townAt(1), 1);
  assert.deepEqual([alone.converged, alone.peers.length, alone.figures.length], [true, 0, 2]);
});

test('tier convergence serializes into the page as a self-contained predicate', () => {
  const town = townAt(8);
  assert.equal(new Function('town', `return (${peerRoster})(town, 8).converged`)(town), true);
});

test('capacity options refuse ambiguous runs, excessive duration and invalid player tiers', () => {
  assert.deepEqual(auditOptions([]).players, [1, 8, 16, 32]);
  assert.equal(auditOptions(['--seconds=600', '--quality=auto']).quality, 'auto');
  assert.equal(auditOptions([]).vsync, 'on');
  assert.equal(auditOptions(['--vsync=off']).vsync, 'off');
  assert.deepEqual([auditOptions([]).view, auditOptions([]).compare, auditOptions([]).profile], ['crowd', 'none', 'off']);
  assert.deepEqual(auditOptions(['--view=away', '--compare=avatar-culling', '--profile=on']), { ...auditOptions([]), view: 'away', compare: 'avatar-culling', profile: 'on' });
  assert.equal(auditOptions(['--compare=figure-culling']).compare, 'figure-culling');
  assert.equal(auditOptions(['--compare=shadow-depth']).compare, 'shadow-depth');
  assert.equal(auditOptions(['--compare=occlusion-sort']).compare, 'occlusion-sort');
  for (const args of [['--seconds=601'], ['--seconds=4'], ['--warmup=0'], ['--players=32,8'], ['--players=33'], ['--players=8,8'], ['--quality=fast'], ['--vsync=false'], ['--vsync=on', '--vsync=off'], ['--view=top'], ['--compare=batching'], ['--compare=figure'], ['--profile=yes'], ['--seconds=5', '--seconds=6'], ['--unknown=x']])
    assert.throws(() => auditOptions(args));
});

test('sample deadline cannot trigger a final gesture before its cooldown, even if a fractional timer wakes early', () => {
  assert.deepEqual(gestureWait(1800), { delayMs: 1700, finish: false });
  assert.deepEqual(gestureWait(1699.6), { delayMs: 1700, finish: true });
  assert.deepEqual(gestureWait(20.2), { delayMs: 21, finish: true });
  assert.deepEqual(gestureWait(-4), { delayMs: 1, finish: true });
});

test('phase timing measures consecutive work without reading the clock while inactive', () => {
  let time = 0, reads = 0;
  const audit = createRenderAudit({ now: () => { reads++; return time; } });
  audit.beginFrame(); audit.phase('residents'); audit.frame(0);
  assert.equal(reads, 0);
  audit.start();
  audit.beginFrame(); time = 3; audit.phase('residents'); time = 8; audit.phase('pipeline'); time = 10; audit.frame(100);
  time = 20; audit.beginFrame(); time = 24; audit.phase('residents'); time = 31; audit.phase('pipeline'); time = 32; audit.frame(116);
  assert.deepEqual(audit.stop(), { frames: [{ intervalMs: 16, cpuMs: 12, phasesMs: { residents: 4, pipeline: 7, tail: 1 } }], overflow: false });
  const before = reads;
  audit.beginFrame(); audit.phase('pipeline'); audit.frame(200);
  assert.equal(reads, before);
});

test('phase records reset each frame and run, and overflow remains explicit and bounded', () => {
  let time = 0;
  const audit = createRenderAudit({ limit: 1, now: () => ++time });
  audit.start();
  for (const at of [0, 16, 32]) { audit.beginFrame(); audit.phase('residents'); audit.frame(at); }
  const result = audit.stop();
  assert.equal(result.overflow, true); assert.equal(result.frames.length, 1);
  audit.start();
  for (const at of [100, 116]) { audit.beginFrame(); audit.phase('pipeline'); audit.frame(at); }
  assert.deepEqual(audit.stop(), { frames: [{ intervalMs: 16, cpuMs: 2, phasesMs: { pipeline: 1, tail: 1 } }], overflow: false });
  assert.deepEqual(result.frames[0].phasesMs, { residents: 1, tail: 1 });
});

test('phase timing fails explicitly for invalid clock evidence and refuses unbounded capacities', () => {
  for (const limit of [0, -1, 1.5, Infinity, 120001]) assert.throws(() => createRenderAudit({ limit }));
  let time = 10;
  const audit = createRenderAudit({ now: () => time });
  audit.start(); audit.beginFrame(); time = 9;
  assert.throws(() => audit.phase('residents'), /clock/);
  time = NaN;
  assert.throws(() => audit.beginFrame(), /clock/);
});

test('overflow stops phase clocks and allocation until an explicit restart', () => {
  let reads = 0;
  const audit = createRenderAudit({ limit: 1, now: () => ++reads });
  audit.start();
  for (const at of [0, 16, 32]) { audit.beginFrame(); audit.phase('pipeline'); audit.frame(at); }
  const before = reads;
  audit.beginFrame(); audit.phase('pipeline'); audit.frame(48);
  assert.equal(reads, before);
  assert.equal(audit.stop().overflow, true);
});

test('visibility discontinuities exclude hidden intervals and are reported, without reactivating a stopped audit', () => {
  const audit = createRenderAudit();
  audit.start(); audit.frame(0, 1); audit.frame(16, 2);
  audit.discontinuity(); audit.frame(9000, 3); audit.frame(9016, 4);
  assert.deepEqual(audit.stop(), { frames: [{ intervalMs: 16, cpuMs: 2 }, { intervalMs: 16, cpuMs: 4 }], overflow: false, discontinuities: 1 });
  audit.discontinuity(); audit.frame(9999, 5);
  audit.start(); audit.frame(10000, 1); audit.frame(10016, 2);
  assert.deepEqual(audit.stop(), { frames: [{ intervalMs: 16, cpuMs: 2 }], overflow: false });
});

test('phase names are bounded and repeated work accumulates within its named bucket', () => {
  let time = 0;
  const audit = createRenderAudit({ now: () => ++time });
  audit.start(); audit.beginFrame();
  assert.throws(() => audit.phase('unbounded-name'), /phase/);
  audit.frame(0);
  audit.beginFrame(); audit.phase('residents'); audit.phase('residents'); audit.frame(16);
  assert.deepEqual(audit.stop().frames[0].phasesMs, { residents: 2, tail: 1 });
});
