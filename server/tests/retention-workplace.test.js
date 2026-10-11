// Retention at rest (#221 gap): a brief, its draft and its receipt live in their
// own key whose expiry is exact. The owner document holds only metadata, so
// an unrelated write never extends how long private text is stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createWorkplace, createMemoryWorkplaceStore, createRedisWorkplaceStore } from '../workplace.js';
import { WORKPLACE_LIMITS, validateWorkplaceRequest } from '../../preview/src/workplace-contract.js';

const DAY = 86_400_000, STEP = 1000, RETENTION = WORKPLACE_LIMITS.retentionMs;
const places = [{id: 'arrival', name: 'Arrival', kind: 'arrival'}, {id: 'spot:garden', name: 'Quiet Garden', kind: 'spot'}];
const brief = {purpose: 'Secret welcome for Mina', guestOfHonor: 'Mina', preferences: ['garden'], constraints: ['quiet after nine'], startsAt: null, guests: 6};
const owner = {userId: 'owner-user', name: 'Owner'}, guest = {userId: 'guest-user', name: 'Guest'};
const hash = value => createHash('sha256').update(value).digest('hex');
const ownerKey = `owner:${hash(owner.userId)}`, workKey = taskId => `work:${hash(owner.userId)}:${taskId}`;

const stores = [['memory', async () => now => createMemoryWorkplaceStore({now})]];
if (process.env.REDIS_URL) stores.push(['redis', async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const prefix = `{river-oaks:workplace-retention:${randomUUID()}}`;
  t.after(async () => { const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const store = createRedisWorkplaceStore({redis, prefix});
  store.ttl = key => redis.pttl(`${prefix}:workplace:v1:${key}`);
  return () => store;
}]);

function harness(makeStore, limits = {}) {
  let time = 1_000_000, ids = 0;
  const now = () => time, store = makeStore(now);
  const workplace = createWorkplace({store, now, stepMs: STEP, limits, createId: () => `id-${String(++ids).padStart(6, '0')}`, schedule: () => null, cancel: () => {}});
  return {workplace, store, tick: ms => { time += ms; }};
}
async function ready(h, actor = owner) {
  await h.workplace.companion(actor, {name: 'Pip'});await h.workplace.grant(actor, {scope: 'event_plan'});
}
async function complete(h, requestId = 'request-0001') {
  const {taskId} = await h.workplace.submit(owner, {brief, requestId}, {worldId: 'river-oaks', places});
  for (let i = 0; i < 8; i++) { h.tick(STEP);await h.workplace.advance(owner.userId); }
  return taskId;
}
const raw = async (h, key) => { const loaded = await h.store.load(key);return JSON.stringify(loaded.value ?? null); };

test('the contract accepts forget for one task id and nothing else', () => {
  assert.equal(validateWorkplaceRequest('forget', {taskId: 'task-000001'}).ok, true);
  assert.equal(validateWorkplaceRequest('forget', {taskId: '../x'}).ok, false);
  assert.equal(validateWorkplaceRequest('forget', {taskId: 'task-000001', all: true}).ok, false);
});

for (const [name, makeStore] of stores) {
  test(`${name}: briefs, drafts and receipts never sit in the owner document`, async t => {
    const h = harness(await makeStore(t));
    await ready(h);
    const taskId = await complete(h);
    const {state} = await h.workplace.state(owner);
    assert.equal(state.tasks[0].status, 'completed');
    assert.equal(state.tasks[0].brief.purpose, brief.purpose, 'the owner still sees the brief');
    assert.match(state.artifacts[0].title, /Secret welcome/);
    const document = await raw(h, ownerKey);
    // Public place names may stay (they are world data); the owner's own words may not.
    for (const secret of ['Secret welcome', 'Mina', 'quiet after nine']) assert.equal(document.includes(secret), false, `owner document holds "${secret}"`);
    const work = await h.store.read(workKey(taskId));
    assert.equal(work.brief.purpose, brief.purpose);assert.equal(work.plan.kind, 'event_plan');assert.equal(work.receipt.taskId, taskId);
    const {artifact} = await h.workplace.artifact(owner, {artifactId: state.tasks[0].artifactId});
    assert.equal(artifact.plan.title, work.plan.title);assert.equal(artifact.receipt.externalWrites, 0);
  });

  test(`${name}: a draft's storage ends at its retention even when the owner keeps writing`, async t => {
    const h = harness(await makeStore(t));
    await ready(h);
    const taskId = await complete(h);
    const first = h.store.ttl ? await h.store.ttl(workKey(taskId)) : null;
    h.tick(RETENTION - DAY);
    // Unrelated writes on day 29 refresh the owner document, never the draft.
    assert.equal((await h.workplace.offer(owner, {decision: 'defer'})).ok, true);
    assert.equal((await h.workplace.presence(owner, {mode: 'offstage'})).ok, true);
    if (h.store.ttl) {
      const later = await h.store.ttl(workKey(taskId));
      assert.ok(first > RETENTION - 60_000 && first <= RETENTION, `first ttl ${first}`);
      assert.ok(later <= first, 'an unrelated write does not extend the draft');
      assert.ok(await h.store.ttl(ownerKey) > RETENTION - 60_000, 'the owner document still lives a full period from its last write');
    } else {
      h.tick(DAY + 1);
      assert.equal(await h.store.read(workKey(taskId)), null, 'nobody read, yet the draft is gone from storage');
      assert.equal((await h.store.load(ownerKey)).value.companion.name, 'Pip', 'the companion is kept');
    }
  });

  test(`${name}: a cancelled brief is stored for exactly the retention period from cancellation`, async t => {
    const h = harness(await makeStore(t));
    await ready(h);
    const {taskId} = await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    h.tick(5 * DAY);
    assert.equal((await h.workplace.cancel(owner, {taskId})).ok, true);
    if (h.store.ttl) {
      const ttl = await h.store.ttl(workKey(taskId));
      assert.ok(ttl > RETENTION - 60_000 && ttl <= RETENTION, `ttl ${ttl}`);
    } else {
      h.tick(RETENTION - 1);
      assert.notEqual(await h.store.read(workKey(taskId)), null);
      h.tick(2);
      assert.equal(await h.store.read(workKey(taskId)), null);
    }
  });

  test(`${name}: an owner can forget any finished brief, and only their own`, async t => {
    const h = harness(await makeStore(t));
    await ready(h);
    const {taskId} = await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    assert.equal((await h.workplace.forget(owner, {taskId})).reason, 'task_state', 'active work is cancelled, not forgotten');
    await h.workplace.cancel(owner, {taskId});
    assert.equal((await h.workplace.forget(guest, {taskId})).reason, 'task_missing');
    const forgotten = await h.workplace.forget(owner, {taskId});
    assert.equal(forgotten.ok, true);
    assert.equal(forgotten.state.tasks.length, 0);
    assert.equal(await h.store.read(workKey(taskId)), null, 'the brief is deleted from storage');
    const done = await complete(h, 'request-0002');
    const completed = (await h.workplace.state(owner)).state;
    assert.equal(completed.artifacts.length, 1);
    const after = (await h.workplace.forget(owner, {taskId: done})).state;
    assert.equal(after.artifacts.length + after.tasks.length, 0, 'forgetting a completed task deletes its draft too');
    assert.equal(await h.store.read(workKey(done)), null);
    assert.equal((await raw(h, ownerKey)).includes(done), false, 'no trace of the task id remains');
  });

  test(`${name}: deleting a draft deletes its key, and a replayed submit leaves no orphan`, async t => {
    const h = harness(await makeStore(t));
    await ready(h);
    const taskId = await complete(h);
    const {state} = await h.workplace.state(owner);
    assert.equal((await h.workplace.delete(owner, {artifactId: state.tasks[0].artifactId})).ok, true);
    assert.equal(await h.store.read(workKey(taskId)), null);
    const again = await h.workplace.submit(owner, {brief, requestId: 'request-0009'}, {worldId: 'river-oaks', places});
    const replay = await h.workplace.submit(owner, {brief, requestId: 'request-0009'}, {worldId: 'river-oaks', places});
    assert.equal(replay.taskId, again.taskId);
    // The replay generated a fresh id before finding the original; nothing was stored under it.
    for (let n = 1; n <= 20; n++) {
      const id = `id-${String(n).padStart(6, '0')}`;
      if (id !== again.taskId && id !== taskId) assert.equal(await h.store.read(workKey(id)), null, id);
    }
  });

  test(`${name}: a paused task outliving its brief fails closed instead of running without it`, async t => {
    // A short retention with a longer grant, so the brief lapses while permission still holds.
    const short = 20 * STEP, h = harness(await makeStore(t), {retentionMs: short, grantMs: 10 * short});
    await ready(h);
    const {taskId} = await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    await h.workplace.pause(owner, {taskId});
    if (h.store.ttl) {
      const ttl = await h.store.ttl(workKey(taskId));
      assert.ok(ttl > 0 && ttl <= short, `an active brief is bounded too (${ttl})`);
      return;
    }
    h.tick(short / 2);await h.workplace.offer(owner, {decision: 'defer'});
    h.tick(short / 2 + 1);
    assert.equal(await h.store.read(workKey(taskId)), null);
    assert.equal((await h.workplace.resume(owner, {taskId})).ok, true);
    for (let i = 0; i < 8; i++) { h.tick(STEP);await h.workplace.advance(owner.userId); }
    const {state} = await h.workplace.state(owner);
    const task = state.tasks.find(item => item.id === taskId);
    assert.equal(task.status, 'failed');assert.equal(task.reason, 'brief_expired');assert.equal(task.brief, null);
    assert.equal(state.artifacts.length, 0, 'nothing is drafted without the brief');
  });
}
