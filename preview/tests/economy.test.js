import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomy, stepEconomy, updateEconomyConfig, economyPacket, applyEconomyDecisions } from '../src/economy.js';

const world = { bounds_m: [0, 0, 300, 300], roads: [
  { id: 'a', points: [[0, 0, 3], [50, 0, 4], [100, 0, 5]] },
  { id: 'b', points: [[0, 10, 3], [0, 100, 5]] },
] };
function run(state, realSeconds, fps = 60) {
  for (let i = 0; i < realSeconds * fps; i += 1) stepEconomy(state, 1 / fps);
}
function reply(packet, action = 'continue', source = 'jev') {
  return { schema_version: 1, tick: packet.tick, latency_ms: 12, decisions: packet.agents.map((agent) => ({ id: agent.id, action, source })) };
}
function started(config) { const state = createEconomy(world, config); state.running = true; return state; }

test('fixed simulation clock and accounting are deterministic across render frame rates', () => {
  const smooth = started(), coarse = started();
  run(smooth, 30, 60); run(coarse, 30, 10);
  assert.equal(smooth.elapsed, 1800);
  assert.deepEqual(smooth.metrics, coarse.metrics);
  assert.deepEqual(smooth.workers.map((worker) => worker.position), coarse.workers.map((worker) => worker.position));
  assert.ok(smooth.metrics.completed > 0);
  assert.equal(smooth.metrics.profit, smooth.metrics.revenue - smooth.metrics.cost);
});

test('higher demand creates more requests while higher prices reduce synthetic demand', () => {
  const base = started({ demand: 1, fee: 18 });
  const busy = started({ demand: 2, fee: 18 });
  const expensive = started({ demand: 1, fee: 55 });
  for (const state of [base, busy, expensive]) run(state, 15);
  assert.ok(busy.metrics.requested > base.metrics.requested);
  assert.ok(expensive.metrics.requested < base.metrics.requested);
});

test('the stated baseline demand rate does not lose a request to floating-point accumulation', () => {
  const state = started({ demand: 1, fee: 18 });
  run(state, 20);
  assert.equal(state.metrics.requested, 540);
});

test('wages accrue by staffed hours, stay monotonic, and fees produce no revenue without completions', () => {
  const state = started({ demand: 0, wage: 24, staff: 80 });
  run(state, 10);
  assert.ok(Math.abs(state.metrics.cost - 320) < 1e-8);
  assert.equal(state.metrics.revenue, 0);
  assert.equal(state.metrics.completed, 0);
  updateEconomyConfig(state, { staff: 20, wage: 30 });
  run(state, 10);
  assert.ok(Math.abs(state.metrics.cost - 420) < 1e-8);
  assert.equal(state.metrics.profit, -state.metrics.cost);
});

test('pause freezes positions, service progress, demand, and accounting', () => {
  const state = started(); run(state, 2);
  assert.ok(state.elapsed > 0 && state.workers.some((worker) => worker.job));
  state.running = false;
  const before = JSON.stringify({ workers: state.workers, metrics: state.metrics, elapsed: state.elapsed });
  run(state, 10);
  assert.equal(JSON.stringify({ workers: state.workers, metrics: state.metrics, elapsed: state.elapsed }), before);
});

test('storm safety immediately prevents throughput and movement while wages continue, then work recovers', () => {
  const state = started(); run(state, 5);
  const oldPacket = economyPacket(state);
  updateEconomyConfig(state, { storm: true });
  const positions = state.workers.map((worker) => [...worker.position]);
  const completed = state.metrics.completed, cost = state.metrics.cost;
  assert.equal(applyEconomyDecisions(state, reply(oldPacket)), false);
  assert.ok(state.workers.filter((worker) => worker.active).every((worker) => worker.action === 'seek_shelter'));
  run(state, 10);
  assert.equal(state.metrics.completed, completed);
  assert.deepEqual(state.workers.map((worker) => worker.position), positions);
  assert.ok(state.metrics.cost > cost);
  const duringStorm = economyPacket(state);
  assert.equal(applyEconomyDecisions(state, reply(duringStorm, 'continue', 'jev')), true);
  assert.ok(state.workers.filter((worker) => worker.active).every((worker) => worker.source === 'safety_override'));
  updateEconomyConfig(state, { storm: false }); run(state, 10);
  assert.ok(state.metrics.completed > completed);
});

test('malformed, stale, unknown-agent, unknown-action, duplicate, and false-source decisions cannot corrupt state', () => {
  const state = started();
  const oldPacket = economyPacket(state), current = economyPacket(state);
  const good = reply(current);
  const invalid = [null, {}, reply(oldPacket), { ...good, latency_ms: NaN },
    { ...good, decisions: [{ ...good.decisions[0], id: 'stranger' }] },
    { ...good, decisions: [{ ...good.decisions[0], action: 'teleport' }] },
    { ...good, decisions: [{ ...good.decisions[0], source: 'pretend-ai' }] },
    { ...good, decisions: [good.decisions[0], good.decisions[0]] }];
  const before = JSON.stringify(state.workers);
  for (const response of invalid) assert.equal(applyEconomyDecisions(state, response), false);
  assert.equal(JSON.stringify(state.workers), before);
  assert.equal(applyEconomyDecisions(state, good), true);
  assert.equal(state.decisionStats.jev, state.config.staff);
  assert.equal(state.decisionStats.latency_ms, 12);
  assert.equal(applyEconomyDecisions(state, good), false);
});

test('packets contain only active typed workers and bounded contextual activity strings', () => {
  const state = started({ staff: 900 }); run(state, 1);
  const packet = economyPacket(state);
  assert.equal(packet.schema_version, 1);
  assert.equal(packet.tick, 1);
  assert.equal(packet.hour, 12);
  assert.equal(packet.agents.length, 300);
  assert.equal(new Set(packet.agents.map((agent) => agent.id)).size, 300);
  for (const agent of packet.agents) {
    assert.ok(['delivery', 'landscaper'].includes(agent.kind));
    assert.ok(agent.activity.length <= 64);
    assert.match(agent.activity, /queue.*fee/);
    assert.ok(agent.position.length === 3 && agent.position.every(Number.isFinite));
  }
  updateEconomyConfig(state, { staff: -1, demand: NaN, fee: Infinity });
  assert.equal(state.config.staff, 20);
  assert.equal(economyPacket(state).agents.length, 20);
  assert.ok(Number.isFinite(state.config.demand) && Number.isFinite(state.config.fee));
});

test('slow and stop decisions physically change travel without leaving observed polylines', () => {
  const normal = started(), slow = started(), stop = started();
  for (const state of [normal, slow, stop]) run(state, 0.5);
  const start = stop.workers.map((worker) => [...worker.position]);
  applyEconomyDecisions(slow, reply(economyPacket(slow), 'slow', 'jev'));
  applyEconomyDecisions(stop, reply(economyPacket(stop), 'stop', 'local_rules'));
  run(normal, 1); run(slow, 1); run(stop, 1);
  assert.deepEqual(stop.workers.map((worker) => worker.position), start);
  assert.ok(normal.metrics.completed >= slow.metrics.completed);
  assert.ok(slow.workers.some((worker, index) => worker.position.some((value, axis) => value !== normal.workers[index].position[axis])));
  for (const worker of normal.workers) {
    assert.ok(worker.position[0] === 0 || worker.position[1] === 0);
    assert.ok(worker.position[2] >= 3 && worker.position[2] <= 5);
  }
});

test('idle workers retain their last route position and long frames or invalid deltas stay bounded', () => {
  const state = started({ demand: 0 });
  const positions = state.workers.map((worker) => [...worker.position]);
  stepEconomy(state, 999);
  assert.equal(state.elapsed, 15);
  assert.deepEqual(state.workers.map((worker) => worker.position), positions);
  stepEconomy(state, NaN); stepEconomy(state, -5);
  assert.equal(state.elapsed, 15);
});

test('queue and events remain bounded during sustained high-demand storms', () => {
  const state = started({ demand: 3, fee: 1, storm: true });
  run(state, 90, 4);
  assert.ok(state.jobs.length <= 2000);
  assert.ok(state.events.length <= 8);
  assert.ok(state.metrics.lost > 0);
  assert.equal(state.metrics.completed, 0);
  assert.equal(state.metrics.revenue, 0);
});

test('redirect reverses actual route travel and does not teleport on receipt while paused', () => {
  const state = started(); run(state, 0.5);
  const worker = state.workers.find((item) => item.job?.phase === 'travel' && item.distance > 10 && item.distance < item.route.length - 10);
  assert.ok(worker);
  state.running = false;
  const distance = worker.distance, position = [...worker.position], progress = worker.progress, direction = worker.direction;
  const packet = economyPacket(state);
  assert.equal(applyEconomyDecisions(state, { ...reply(packet), decisions: [{ id: worker.id, action: 'redirect', source: 'jev' }] }), true);
  run(state, 1);
  assert.deepEqual(worker.position, position);
  assert.equal(worker.progress, progress);
  state.running = true;
  stepEconomy(state, 1 / 60);
  assert.ok((worker.distance - distance) * direction < 0);
  assert.equal(worker.source, 'jev');
});

test('quoted fees are preserved across price changes and recognized only on completion', () => {
  const state = started({ fee: 18 }); run(state, 0.25);
  assert.equal(state.metrics.completed, 0);
  const quotedJobs = [...state.jobs, ...state.workers.flatMap((worker) => worker.job ? [worker.job] : [])];
  assert.ok(quotedJobs.length > 0);
  const quotedRevenue = quotedJobs.reduce((sum, job) => sum + job.fee, 0);
  updateEconomyConfig(state, { fee: 100, demand: 0 });
  run(state, 10);
  assert.equal(state.metrics.completed, quotedJobs.length);
  assert.ok(Math.abs(state.metrics.revenue - quotedRevenue) < 1e-8);
});

test('decision attribution stays mixed and expired responses revert to honest local fallback', () => {
  const state = started();
  const packet = economyPacket(state), response = reply(packet);
  response.decisions.forEach((decision, index) => { decision.source = index % 2 ? 'local_rules' : 'jev'; });
  assert.equal(applyEconomyDecisions(state, response), true);
  assert.equal(state.decisionStats.jev, 40);
  assert.equal(state.decisionStats.local_rules, 40);
  run(state, 4);
  assert.equal(state.decisionStats.jev, 0);
  assert.equal(state.decisionStats.local_rules, 80);
});

test('nearby context uses the closest actual active workers within30meters and stays bounded at4', () => {
  const state = createEconomy(world, { staff: 20 });
  const packet = economyPacket(state);
  let withNeighbors = 0;
  for (const agent of packet.agents) {
    const expected = packet.agents.filter((other) => other.id !== agent.id).map((other) => ({
      id: other.id, kind: other.kind,
      distance_m: Math.hypot(...other.position.map((value, axis) => value - agent.position[axis])),
    })).filter((other) => other.distance_m <= 30).sort((a, b) => a.distance_m - b.distance_m || (a.id < b.id ? -1 : 1)).slice(0, 4);
    assert.deepEqual(agent.nearby, expected);
    assert.ok(agent.nearby.length <= 4);
    assert.ok(agent.nearby.every((other) => other.id !== agent.id && other.distance_m >= 0 && other.distance_m <= 30));
    if (agent.nearby.length) withNeighbors += 1;
  }
  assert.ok(withNeighbors > 0);
});
