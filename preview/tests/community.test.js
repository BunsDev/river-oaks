import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunity, stepCommunity, interactWithLocal, chooseCommunityScenario, snapshotForLocal, applyLocalReaction } from '../src/community.js';

const world = { buildings: Array.from({ length: 48 }, (_, i) => ({ id: `house-${i}`, center: [i * 25, i % 5 * 35, i % 3], size: [12, 14, 9], yaw_deg: 0 })) };
function start(key = 'heatwave') {
  const state = createCommunity(world);
  chooseCommunityScenario(state, key);
  state.running = true;
  return state;
}
function advance(state, seconds, economy, fps = 60) {
  for (let i = 0; i < seconds * fps; i++) stepCommunity(state, 1 / fps, economy);
}
function priority(state) { return state.locals.filter((local) => local.priority); }
function ask(state, local) { return interactWithLocal(state, local.id, 'ask'); }

test('fictional locals use deterministic distinct source homes and handle empty geometry', () => {
  const first = createCommunity(world), second = createCommunity(world);
  assert.ok(first, 'community model must be initialized');
  assert.deepEqual(first.locals, second.locals);
  assert.equal(first.locals.length, 24);
  assert.equal(new Set(first.locals.map((local) => local.id)).size, 24);
  assert.equal(new Set(first.locals.map((local) => local.homeId)).size, 24);
  assert.ok(first.locals.every((local) => local.fictional && local.position.every(Number.isFinite)));
  assert.equal(createCommunity({ buildings: [] }).locals.length, 0);
});

test('district walking anchors take precedence over residential source buildings', () => {
  const communityLocations = [{ id: 'plaza', name: 'Central plaza', position: [12, 25, 2] }, { id: 'cafe', name: 'Café terrace', position: [80, 25, 2] }];
  const state = createCommunity({ ...world, communityLocations });
  assert.equal(state.locals.length, 2);
  assert.deepEqual(state.locals.map((local) => local.position), communityLocations.map((location) => location.position));
  assert.equal(state.locals[0].anchorName, 'Central plaza');
  assert.equal(state.locals[0].homeId, null);
});

test('asking reveals needs once, supplies give measurable relief with a repeat cooldown', () => {
  const state = start(), local = priority(state)[0];
  assert.equal(interactWithLocal(state, local.id, 'supply').reason, 'ask_first');
  assert.equal(ask(state, local).ok, true);
  assert.equal(local.needKnown, true);
  assert.equal(ask(state, local).reason, 'already_asked');
  const before = local.need, stock = state.supplies;
  assert.equal(interactWithLocal(state, local.id, 'supply').ok, true);
  assert.ok(local.need < before);
  assert.equal(state.supplies, stock - state.scenario.supplyCost);
  const remaining = state.supplies;
  assert.equal(interactWithLocal(state, local.id, 'supply').reason, 'cooldown');
  assert.equal(state.supplies, remaining);
  advance(state, 2);
  assert.equal(interactWithLocal(state, local.id, 'supply').ok, true);
  assert.equal(local.status, 'supported');
});

test('dispatch spends finite help once and resolves only after simulated work finishes', () => {
  const state = start(), local = priority(state)[0];
  ask(state, local);
  const before = state.helpBudget;
  assert.equal(interactWithLocal(state, local.id, 'dispatch').ok, true);
  assert.equal(state.helpBudget, before - 1);
  assert.equal(local.status, 'aid_en_route');
  assert.equal(state.supported, 0);
  assert.equal(interactWithLocal(state, local.id, 'dispatch').reason, 'already_dispatched');
  assert.equal(state.helpBudget, before - 1);
  advance(state, 1);
  assert.equal(state.supported, 0);
  advance(state, 10);
  assert.equal(local.status, 'supported');
  assert.equal(local.need, 0);
  assert.equal(state.supported, 1);
  assert.equal(state.jobs.length, 0);
});

test('unmet needs worsen, failure is finite, and finished missions cannot continue spending', () => {
  const state = start(), local = priority(state)[0], original = local.need;
  advance(state, 10);
  assert.ok(local.need > original);
  advance(state, 90);
  assert.equal(state.status, 'failed');
  assert.equal(state.running, false);
  assert.ok(state.elapsed <= state.scenario.duration);
  ask(state, local);
  const stock = state.supplies;
  assert.equal(interactWithLocal(state, local.id, 'supply').ok, false);
  assert.equal(state.supplies, stock);
  const elapsed = state.elapsed;
  advance(state, 5);
  assert.equal(state.elapsed, elapsed);
});

test('a planned mix of delayed help and scarce supplies can achieve the objective', () => {
  const state = start();
  const locals = priority(state);
  for (const local of locals.slice(0, 4)) {
    ask(state, local);
    assert.equal(interactWithLocal(state, local.id, 'dispatch').ok, true);
  }
  for (const local of locals.slice(4, 6)) {
    ask(state, local);
    assert.equal(interactWithLocal(state, local.id, 'supply').ok, true);
  }
  advance(state, 2);
  for (const local of locals.slice(4, 6)) assert.equal(interactWithLocal(state, local.id, 'supply').ok, true);
  advance(state, 12);
  assert.equal(state.status, 'success');
  assert.equal(state.supported, state.target);
  assert.equal(state.running, false);
  assert.ok(state.supplies >= 0 && state.helpBudget >= 0);
});

test('finite resources cannot go negative even when multiple households request help', () => {
  const state = start();
  for (const local of priority(state)) {
    ask(state, local);
    for (let i = 0; i < 5; i++) interactWithLocal(state, local.id, 'dispatch');
  }
  assert.equal(state.helpBudget, 0);
  assert.equal(state.jobs.length, 4);
  const unserved = priority(state).filter((local) => local.status === 'needs_help');
  assert.equal(interactWithLocal(state, unserved[0].id, 'dispatch').reason, 'no_help');
  state.supplies = 1;
  const need = unserved[0].need;
  assert.equal(interactWithLocal(state, unserved[0].id, 'supply').reason, 'no_supplies');
  assert.equal(state.supplies, 1);
  assert.equal(unserved[0].need, need);
});

test('storm pauses dispatched work while staffing changes its completion time', () => {
  const storm = start(), staffed = start(), sparse = start();
  for (const state of [storm, staffed, sparse]) {
    const local = priority(state)[0]; ask(state, local);
    interactWithLocal(state, local.id, 'dispatch');
  }
  advance(storm, 10, { config: { storm: true, staff: 80 }, metrics: { completed: 0 } });
  assert.equal(storm.jobs[0].progress, 0);
  assert.ok(priority(storm)[0].need > 42);
  advance(staffed, 7, { config: { storm: false, staff: 160 }, metrics: { completed: 0 } });
  advance(sparse, 7, { config: { storm: false, staff: 20 }, metrics: { completed: 0 } });
  assert.equal(staffed.supported, 1);
  assert.equal(sparse.supported, 0);
  advance(storm, 10, { config: { storm: false, staff: 80 }, metrics: { completed: 0 } });
  assert.equal(storm.supported, 1);
});

test('delivery disruption earns bounded supplies from new economy completions, never past jobs', () => {
  const state = start('delivery');
  const economy = { config: { staff: 80, storm: false }, metrics: { completed: 300 } };
  advance(state, 1, economy);
  const stock = state.supplies;
  assert.equal(state.resupplied, 0);
  economy.metrics.completed += 25;
  advance(state, 1, economy);
  assert.equal(state.supplies, stock + 1);
  economy.metrics.completed += 10000;
  advance(state, 1, economy);
  assert.equal(state.resupplied, state.scenario.maxResupply);
  assert.equal(state.supplies, stock + state.scenario.maxResupply);
  economy.metrics.completed = 0;
  advance(state, 1, economy);
  assert.equal(state.supplies, stock + state.scenario.maxResupply);
  assert.notEqual(state.scenario.supplyRelief, start('heatwave').scenario.supplyRelief);
  assert.ok(start('storm').scenario.dispatchSeconds > start('heatwave').scenario.dispatchSeconds);
});

test('scenario reset invalidates pending jobs and reactions without reusing a stale generation', () => {
  const state = start(), local = priority(state)[0];
  ask(state, local); interactWithLocal(state, local.id, 'dispatch');
  const packet = snapshotForLocal(state, local.id, 'ask', 7), generation = state.generation;
  chooseCommunityScenario(state, 'storm');
  assert.ok(state.generation > generation);
  assert.equal(state.jobs.length, 0);
  assert.equal(state.elapsed, 0);
  assert.equal(state.running, false);
  const response = { schema_version: 1, tick: packet.tick, latency_ms: 4, decisions: [{ id: local.id, action: 'greet', source: 'jev' }] };
  assert.equal(applyLocalReaction(state, local.id, response, { generation, tick: packet.tick }), false);
  assert.ok(state.locals.every((item) => item.source === 'local_rules'));
});

test('resident reaction packets are bounded and response acceptance rejects stale, foreign and repeated answers', () => {
  const state = start(), local = priority(state)[0];
  const packet = snapshotForLocal(state, local.id, 'ask', 12);
  assert.equal(packet.agents.length, 1);
  assert.equal(packet.agents[0].kind, 'resident');
  assert.ok(packet.agents[0].activity.length <= 64);
  const context = { generation: state.generation, tick: packet.tick };
  const reply = { schema_version: 1, tick: 12, latency_ms: 5, decisions: [{ id: local.id, action: 'greet', source: 'jev' }] };
  const invalid = [null, { ...reply, tick: 11 }, { ...reply, decisions: [{ id: 'stranger', action: 'greet', source: 'jev' }] }, { ...reply, decisions: [{ id: local.id, action: 'plan', source: 'jev' }] }];
  for (const response of invalid) assert.equal(applyLocalReaction(state, local.id, response, context), false);
  const need = local.need, supplies = state.supplies;
  assert.equal(applyLocalReaction(state, local.id, reply, context), true);
  assert.equal(local.action, 'greet');
  assert.equal(local.source, 'jev');
  assert.equal(local.need, need);
  assert.equal(state.supplies, supplies);
  assert.equal(applyLocalReaction(state, local.id, reply, context), false);
  advance(state, 3);
  assert.equal(local.source, 'local_rules');
});

test('clock is deterministic, paused state freezes, and invalid or long deltas are bounded', () => {
  const fine = start(), coarse = start();
  advance(fine, 10, undefined, 60); advance(coarse, 10, undefined, 10);
  assert.equal(fine.elapsed, 600);
  assert.deepEqual(fine.locals, coarse.locals);
  fine.running = false;
  const before = JSON.stringify(fine);
  advance(fine, 1);
  assert.equal(JSON.stringify(fine), before);
  fine.running = true;
  stepCommunity(fine, 10000);
  assert.equal(fine.elapsed, 615);
  stepCommunity(fine, NaN); stepCommunity(fine, Infinity); stepCommunity(fine, -1);
  assert.equal(fine.elapsed, 615);
  assert.equal(interactWithLocal(fine, 'missing', 'ask').ok, false);
  assert.equal(interactWithLocal(fine, fine.locals[0].id, 'invented').ok, false);
});
