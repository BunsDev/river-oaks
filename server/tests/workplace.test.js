import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createWorkplace, createMemoryWorkplaceStore, createRedisWorkplaceStore, fixtureEventPlan } from '../workplace.js';
import { validateWorkplaceRequest, validateEventPlan, companionPresentation, WORKPLACE_LIMITS } from '../../preview/src/workplace-contract.js';

const places = [
  {id: 'arrival', name: 'Arrival', kind: 'arrival'},
  {id: 'spot:garden', name: 'Quiet Garden', kind: 'spot'},
  {id: 'spot:terrace', name: 'Bookshop Terrace', kind: 'spot'},
  {id: 'spot:plaza', name: 'Fountain Plaza', kind: 'spot'},
  {id: 'shop:dior', name: 'Dior', kind: 'shop'},
];
const brief = {purpose: 'A small welcome for a new neighbour', guestOfHonor: 'Mina', preferences: [], constraints: ['quiet after nine'], startsAt: null, guests: 6};
const owner = {userId: 'owner-user', name: 'Owner'}, guest = {userId: 'guest-user', name: 'Guest'};
const STEP = 1000;

function harness(makeStore, limits = {}, options = {}) {
  let time = 1_000_000, ids = 0;
  const now = () => time, store = makeStore(now), timers = [];
  // Scheduled steps are collected, not run, so a test can fire the service timer itself.
  const workplace = createWorkplace({store, now, stepMs: STEP, limits, createId: () => `id-${String(++ids).padStart(6, '0')}`,
    schedule: fn => { timers.push(fn);return fn; }, cancel: () => {}, ...options});
  const fire = async () => { for (let i = 0; i < 8 && timers.length; i++) { time += STEP;await timers.shift()(); } };
  return {workplace, store, fire, tick: ms => { time += ms; }, get now() { return time; }};
}
async function ready(h, actor = owner) {
  assert.equal((await h.workplace.companion(actor, {name: 'Pip'})).ok, true);
  const granted = await h.workplace.grant(actor, {scope: 'event_plan'});assert.equal(granted.ok, true);
  return granted.state.grant;
}
async function runToEnd(h, actor = owner) {
  for (let i = 0; i < 8; i++) { h.tick(STEP);await h.workplace.advance(actor.userId); }
  return (await h.workplace.state(actor)).state;
}
const stores = [['memory', async () => now => createMemoryWorkplaceStore({now})]];
if (process.env.REDIS_URL) stores.push(['redis', async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const prefix = `{river-oaks:workplace-test:${randomUUID()}}`;
  t.after(async () => { const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const store = createRedisWorkplaceStore({redis, prefix});
  store.redis = redis;store.prefix = prefix;
  return () => store;
}]);

test('the contract rejects unknown actions, forged authority fields, bad ids and oversized text', () => {
  const now = 1_000_000;
  assert.equal(validateWorkplaceRequest('admin', {}, now).reason, 'unknown_action');
  assert.equal(validateWorkplaceRequest('__proto__', {}, now).reason, 'unknown_action');
  for (const forged of [{ownerId: 'jevica'}, {admin: true}, {userId: 'x'}, {grantIssuer: 'server'}])
    assert.equal(validateWorkplaceRequest('submit', {brief, requestId: 'request-0001', ...forged}, now).ok, false, JSON.stringify(forged));
  assert.equal(validateWorkplaceRequest('submit', {brief: {...brief, ownerId: 'jevica'}, requestId: 'request-0001'}, now).ok, false);
  assert.equal(validateWorkplaceRequest('submit', {brief: {...brief, tools: ['shell']}, requestId: 'request-0001'}, now).ok, false);
  assert.equal(validateWorkplaceRequest('submit', {brief: {...brief, purpose: 'x'.repeat(161)}, requestId: 'request-0001'}, now).ok, false);
  assert.equal(validateWorkplaceRequest('submit', {brief: {...brief, purpose: 'hi‮there'}, requestId: 'request-0001'}, now).ok, false);
  assert.equal(validateWorkplaceRequest('submit', {brief: {...brief, guests: Infinity}, requestId: 'request-0001'}, now).ok, false);
  assert.equal(validateWorkplaceRequest('submit', {brief: {...brief, startsAt: now - 1}, requestId: 'request-0001'}, now).ok, false);
  assert.equal(validateWorkplaceRequest('submit', {brief, requestId: '../../etc'}, now).ok, false);
  assert.equal(validateWorkplaceRequest('revoke', {grantId: 'id-000001', expectedRevision: 1.5}, now).ok, false);
  assert.equal(validateWorkplaceRequest('grant', {scope: 'publish'}, now).ok, false);
  assert.equal(validateWorkplaceRequest('presence', {mode: 'stationed', stationId: 'station-1'}, now).ok, false);
  assert.equal(validateWorkplaceRequest('state', [], now).ok, false);
  assert.equal(validateWorkplaceRequest('submit', {brief, requestId: 'request-0001'}, now).ok, true);
});

test('presentation never shows work the service has not recorded', () => {
  const stationed = {mode: 'stationed', stationId: 'station-1'};
  assert.equal(companionPresentation(stationed, null).working, false);
  assert.equal(companionPresentation(stationed, {status: 'running'}).working, true);
  assert.equal(companionPresentation(stationed, {status: 'running'}, 'stale').working, false, 'a lost heartbeat reads as stopped');
  for (const status of ['queued', 'paused', 'completed', 'failed', 'cancelled']) assert.equal(companionPresentation(stationed, {status}).working, false, status);
  assert.equal(companionPresentation({mode: 'offstage'}, {status: 'running'}).pose, 'offstage', 'presence is independent of task state');
});

test('the fixture plan is valid, inert, and asks about the person the brief forgot', () => {
  const plan = fixtureEventPlan(brief, places);
  assert.equal(validateEventPlan(plan), true);
  assert.equal(plan.options.every(option => !option.placeId.startsWith('shop:')), true, 'meeting points only, never a storefront or home');
  assert.match(plan.questions.join(' '), /What does Mina enjoy\?/);
  assert.match(plan.questions.join(' '), /does not invite anyone/);
  assert.equal(validateEventPlan({...plan, html: '<script>'}), false);
  assert.equal(validateEventPlan({...plan, sources: [{tool: 'web.fetch', id: 'x'}]}), false);
  assert.equal(fixtureEventPlan(brief, [{id: 'shop:dior', name: 'Dior', kind: 'shop'}]), null);
});

for (const [name, makeStore] of stores) {
  test(`${name}: an authorized companion saves one private plan with a real receipt and one notice`, async t => {
    const h = harness(await makeStore(t));
    assert.equal((await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places})).reason, 'companion_required');
    await h.workplace.companion(owner, {name: 'Pip'});
    assert.equal((await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places})).reason, 'grant_required', 'appearance and personality grant nothing');
    await h.workplace.grant(owner, {scope: 'event_plan'});
    const submitted = await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    assert.equal(submitted.ok, true);
    const repeat = await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    assert.equal(repeat.taskId, submitted.taskId, 'a resubmitted request is idempotent');
    assert.equal((await h.workplace.submit(owner, {brief, requestId: 'request-0002'}, {worldId: 'river-oaks', places})).reason, 'task_active');
    assert.equal(submitted.state.companion.presence.mode, 'stationed');
    // Many runners race every step; compare-and-set lets each step land once.
    for (let i = 0; i < 6; i++) { h.tick(STEP);await Promise.all(Array.from({length: 5}, () => h.workplace.advance(owner.userId))); }
    const {state} = await h.workplace.state(owner);
    const [task] = state.tasks;
    assert.equal(task.status, 'completed');
    assert.deepEqual(task.checkpoints.map(item => item.step), ['reading_brief', 'checking_places', 'drafting_plan', 'validating']);
    assert.equal(state.artifacts.length, 1);
    assert.deepEqual(state.notices.map(notice => notice.id), [`result:${task.id}`]);
    const {artifact} = await h.workplace.artifact(owner, {artifactId: task.artifactId});
    assert.equal(validateEventPlan(artifact.plan), true);
    assert.equal(artifact.receipt.externalWrites, 0);assert.equal(artifact.receipt.paidCalls, 0);
    assert.equal(artifact.receipt.toolCalls <= WORKPLACE_LIMITS.toolCalls && artifact.receipt.turns <= WORKPLACE_LIMITS.turns, true);
    assert.equal(artifact.receipt.grantRevision, state.grant.revision);
    // Another account sees neither the task nor the plan, and cannot fetch it by id.
    const other = (await h.workplace.state(guest)).state;
    assert.equal(other.tasks.length + other.artifacts.length + other.notices.length, 0);
    assert.equal((await h.workplace.artifact(guest, {artifactId: task.artifactId})).ok, false);
    assert.equal(JSON.stringify(await h.workplace.occupancy(guest)).includes(owner.userId), false, 'occupancy reveals no owner');
    assert.equal((await h.workplace.ack(owner, {noticeId: `result:${task.id}`})).state.notices.length, 0);
    assert.equal((await h.workplace.delete(owner, {artifactId: task.artifactId})).state.artifacts.length, 0);
    assert.equal((await h.workplace.artifact(owner, {artifactId: task.artifactId})).ok, false);
  });

  test(`${name}: revoking while running cancels the task and a stale writer cannot commit`, async t => {
    const h = harness(await makeStore(t));
    const grant = await ready(h);
    await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    for (let i = 0; i < 3; i++) { h.tick(STEP);await h.workplace.advance(owner.userId); }
    // A runner loaded the document, then the owner revoked before it saved.
    const key = `owner:${createHash('sha256').update(owner.userId).digest('hex')}`;
    const stale = await h.store.load(key);
    assert.equal((await h.workplace.revoke(owner, {grantId: grant.id, expectedRevision: grant.revision})).ok, true);
    stale.value.tasks[0].status = 'completed';
    assert.equal(await h.store.save(key, stale.revision, stale.value), false, 'the stale revision is refused');
    const state = await runToEnd(h);
    assert.equal(state.tasks[0].status, 'cancelled');assert.equal(state.tasks[0].reason, 'grant_revoked');
    assert.equal(state.artifacts.length, 0);assert.equal(state.grant.active, false);
    assert.equal((await h.workplace.submit(owner, {brief, requestId: 'request-0002'}, {worldId: 'river-oaks', places})).reason, 'grant_required');
    assert.equal((await h.workplace.revoke(owner, {grantId: grant.id, expectedRevision: grant.revision})).ok, true, 'a retried revoke is idempotent');
    assert.equal((await h.workplace.revoke(owner, {grantId: grant.id, expectedRevision: grant.revision + 5})).reason, 'grant_stale');
  });

  test(`${name}: a lost runner recovers from its checkpoint, then fails closed after three attempts`, async t => {
    const recovered = harness(await makeStore(t));
    await ready(recovered);
    await recovered.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    recovered.tick(STEP);await recovered.workplace.advance(owner.userId);
    recovered.tick(STEP + WORKPLACE_LIMITS.stepLeaseMs + 1);
    const done = await runToEnd(recovered);
    assert.equal(done.tasks[0].status, 'completed');assert.equal(done.tasks[0].attempts, 1);

    const lost = harness(await makeStore(t));
    await ready(lost);
    await lost.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    for (let i = 0; i < 6; i++) { lost.tick(STEP + WORKPLACE_LIMITS.stepLeaseMs + 1);await lost.workplace.advance(owner.userId); }
    const {state} = await lost.workplace.state(owner);
    assert.equal(state.tasks[0].status, 'failed');assert.equal(state.tasks[0].reason, 'worker_lost');
    assert.equal(state.artifacts.length, 0);
    assert.deepEqual(state.notices.map(notice => notice.kind), ['failed']);
  });

  test(`${name}: pause, resume, cancel, deadline and artifact limits are enforced in code`, async t => {
    const h = harness(await makeStore(t));
    await ready(h);
    let {taskId} = await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    h.tick(STEP);await h.workplace.advance(owner.userId);
    assert.equal((await h.workplace.pause(owner, {taskId})).ok, true);
    h.tick(10 * STEP);await h.workplace.advance(owner.userId);
    assert.equal((await h.workplace.state(owner)).state.tasks[0].step, 'reading_brief', 'a paused task makes no progress');
    assert.equal((await h.workplace.pause(guest, {taskId})).reason, 'task_missing', 'another account cannot control it');
    assert.equal((await h.workplace.resume(owner, {taskId})).ok, true);
    assert.equal((await runToEnd(h)).tasks.at(-1).status, 'completed');
    ({taskId} = await h.workplace.submit(owner, {brief, requestId: 'request-0002'}, {worldId: 'river-oaks', places}));
    assert.equal((await h.workplace.cancel(owner, {taskId})).ok, true);
    assert.equal((await runToEnd(h)).artifacts.length, 1, 'a cancelled task saves nothing');
    for (const requestId of ['request-0004', 'request-0005']) { await h.workplace.submit(owner, {brief, requestId}, {worldId: 'river-oaks', places });await runToEnd(h); }
    assert.equal((await h.workplace.state(owner)).state.artifacts.length, 3);
    assert.equal((await h.workplace.submit(owner, {brief, requestId: 'request-0006'}, {worldId: 'river-oaks', places})).reason, 'artifact_limit');
    h.tick(WORKPLACE_LIMITS.retentionMs + 1);
    assert.equal((await h.workplace.state(owner)).state.artifacts.length, 0, 'artifacts expire with the retention policy');
  });

  test(`${name}: workstations are exclusive leases and the offer advances only on a verified plan`, async t => {
    const h = harness(await makeStore(t));
    const third = {userId: 'third-user', name: 'Third'};
    for (const actor of [owner, guest, third]) await h.workplace.companion(actor, {name: 'Pip'});
    // Three simultaneous claims for two desks: any one of them may lose the race.
    const actors = [owner, guest, third];
    const claims = await Promise.all(actors.map(actor => h.workplace.presence(actor, {mode: 'stationed'})));
    assert.deepEqual(claims.map(claim => claim.ok).sort(), [false, true, true]);
    assert.equal(claims.find(claim => !claim.ok).reason, 'stations_full');
    const loser = actors[claims.findIndex(claim => !claim.ok)], leaving = actors[claims.findIndex(claim => claim.ok)];
    const occupancy = await h.workplace.occupancy(loser);
    assert.deepEqual(occupancy.stations.map(station => [station.occupied, station.mine]), [[true, false], [true, false]]);
    await h.workplace.presence(leaving, {mode: 'offstage'});
    assert.equal((await h.workplace.presence(loser, {mode: 'stationed'})).ok, true, 'leaving releases the station');
    h.tick(WORKPLACE_LIMITS.stationLeaseMs + 1);
    assert.equal((await h.workplace.occupancy(owner)).stations.every(station => !station.occupied), true, 'leases expire');
    // Declining costs nothing; accepting later still works.
    assert.equal((await h.workplace.offer(owner, {decision: 'decline'})).state.offer.state, 'declined');
    assert.equal((await h.workplace.offer(owner, {decision: 'accept'})).state.offer.state, 'accepted');
    await h.workplace.grant(owner, {scope: 'event_plan'});
    const {taskId} = await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    assert.equal((await h.workplace.state(owner)).state.offer.state, 'accepted', 'submitting is not a result');
    const done = await runToEnd(h);
    assert.equal(done.offer.state, 'plan_ready');
    assert.equal((await h.workplace.ack(owner, {noticeId: `result:${taskId}`})).state.offer.state, 'reviewed');
  });
}

for (const [name, makeStore] of stores) {
  test(`${name}: the deadline counts working time, and an expired grant is reported as expired`, async t => {
    const h = harness(await makeStore(t), {deadlineMs: 1500, grantMs: 10 * STEP});
    await ready(h);
    const {taskId} = await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    const state = await runToEnd(h);
    assert.equal(state.tasks.find(task => task.id === taskId).reason, 'deadline');
    const late = harness(await makeStore(t), {grantMs: 3 * STEP});
    await ready(late);
    await late.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    const after = await runToEnd(late);
    assert.equal(after.tasks[0].status, 'cancelled');assert.equal(after.tasks[0].reason, 'grant_expired');
  });

  test(`${name}: a reader returning after a long absence resumes the task instead of failing it`, async t => {
    const h = harness(await makeStore(t));
    await ready(h);
    await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    h.tick(STEP);await h.workplace.advance(owner.userId);
    h.tick(10 * 60_000);
    const state = await runToEnd(h);
    assert.equal(state.tasks[0].status, 'completed', 'ten minutes with nobody reading is one recovery, not a deadline');
    assert.equal(state.tasks[0].attempts, 1);
  });

  test(`${name}: deleting a draft forgets its brief and finished briefs follow retention`, async t => {
    const h = harness(await makeStore(t));
    await ready(h);
    await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    let state = await runToEnd(h);
    state = (await h.workplace.delete(owner, {artifactId: state.tasks[0].artifactId})).state;
    assert.equal(JSON.stringify(state).includes(brief.purpose), false, 'the brief goes with the draft');
    const {taskId} = await h.workplace.submit(owner, {brief, requestId: 'request-0002'}, {worldId: 'river-oaks', places});
    await h.workplace.cancel(owner, {taskId});
    h.tick(WORKPLACE_LIMITS.retentionMs + 1);
    state = (await h.workplace.state(owner)).state;
    assert.equal(state.tasks.length, 0, 'a cancelled brief expires too');
    if (h.store.redis) {
      const ttl = await h.store.redis.pttl(`${h.store.prefix}:workplace:v1:owner:${createHash('sha256').update(owner.userId).digest('hex')}`);
      assert.ok(ttl > 0 && ttl <= WORKPLACE_LIMITS.retentionMs, 'abandoned owner data expires in Redis');
    }
  });

  test(`${name}: desks follow the owner's choice even when writes race or fail`, async t => {
    const h = harness(await makeStore(t));
    await h.workplace.companion(owner, {name: 'Pip'});
    assert.equal((await h.workplace.presence(owner, {mode: 'stationed'})).state.companion.presence.stationId, 'station-1');
    // A racing write leaves the companion offstage while the desk is still held.
    const key = `owner:${createHash('sha256').update(owner.userId).digest('hex')}`;
    const loaded = await h.store.load(key);loaded.value.companion.presence = {mode: 'offstage'};
    assert.equal(await h.store.save(key, loaded.revision, loaded.value, 60_000), true);
    assert.equal((await h.workplace.occupancy(guest)).stations[0].occupied, true);
    await h.workplace.state(owner);
    assert.equal((await h.workplace.occupancy(guest)).stations.every(station => !station.occupied), true, 'the next read gives the desk back');
  });
}

for (const [name, makeStore] of stores) {
  test(`${name}: the service timer stops work for an owner who lost access`, async t => {
    let allowed = true;
    const h = harness(await makeStore(t), {}, {allowed: async userId => userId !== owner.userId || allowed});
    await ready(h);
    await ready(h, guest);
    await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    await h.workplace.submit(guest, {brief, requestId: 'request-0002'}, {worldId: 'river-oaks', places});
    // Banned, or waitlist approval ended, after admission. Nobody reads again; only timers run.
    allowed = false;
    await h.fire();
    const {state} = await h.workplace.state(owner);
    assert.equal(state.tasks[0].status, 'cancelled');assert.equal(state.tasks[0].reason, 'access_revoked');
    assert.equal(state.grant.active, false);assert.equal(state.artifacts.length, 0);
    assert.equal((await h.workplace.state(guest)).state.tasks[0].status, 'completed', 'another owner is unaffected');
  });

  test(`${name}: a failing access check stops the step instead of running it`, async t => {
    const h = harness(await makeStore(t), {}, {allowed: async () => { throw new Error('moderation store down'); }});
    await ready(h);
    await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    const key = `owner:${createHash('sha256').update(owner.userId).digest('hex')}`;
    const before = await h.store.load(key);
    await h.fire();
    const after = await h.store.load(key);
    assert.equal(after.revision, before.revision, 'no unattended step wrote');
    assert.equal(after.value.tasks[0].checkpoints.length, 0);
  });

  test(`${name}: a paused task whose grant expired never blocks a new grant`, async t => {
    const h = harness(await makeStore(t), {grantMs: 3 * STEP});
    await ready(h);
    const {taskId} = await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    assert.equal((await h.workplace.pause(owner, {taskId})).ok, true);
    h.tick(4 * STEP);
    // Re-granting without an intervening read still settles the old task.
    const regranted = await h.workplace.grant(owner, {scope: 'event_plan'});
    const old = regranted.state.tasks.find(task => task.id === taskId);
    assert.equal(old.status, 'cancelled');assert.equal(old.reason, 'grant_expired');
    assert.equal((await h.workplace.submit(owner, {brief, requestId: 'request-0002'}, {worldId: 'river-oaks', places})).ok, true);
    // And a read alone reports a paused task under an expired grant as expired.
    const read = harness(await makeStore(t), {grantMs: 3 * STEP});
    await ready(read);
    const paused = await read.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    await read.workplace.pause(owner, {taskId: paused.taskId});
    read.tick(4 * STEP);
    const [task] = (await read.workplace.state(owner)).state.tasks;
    assert.equal(task.status, 'cancelled');assert.equal(task.reason, 'grant_expired');
  });
}

test('a desk write that keeps losing is reported as busy, never as a reserved desk', async () => {
  const inner = createMemoryWorkplaceStore();
  const store = {load: key => inner.load(key), save: (key, ...rest) => key === 'stations' ? false : inner.save(key, ...rest)};
  const workplace = createWorkplace({store, stepMs: 0, schedule: () => null, cancel: () => {}});
  await workplace.companion(owner, {name: 'Pip'});
  const result = await workplace.presence(owner, {mode: 'stationed'});
  assert.equal(result.ok, false);assert.equal(result.reason, 'workplace_busy');
  const state = (await workplace.state(owner)).state;
  assert.equal(state.companion.presence.stationId, null);
  assert.notEqual(state.companion.presence.mode, 'stationed');
});
