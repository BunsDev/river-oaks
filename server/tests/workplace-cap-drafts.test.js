// When the finished-task cap drops an old task, its draft goes with it. Before,
// the task and its private brief were dropped but the draft's metadata stayed:
// hidden from the panel, impossible to delete, and still counted against the
// draft limit until it expired, so new tasks were refused with artifact_limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createWorkplace, createMemoryWorkplaceStore, createRedisWorkplaceStore } from '../workplace.js';

const STEP = 1000;
const places = [{id: 'arrival', name: 'Arrival', kind: 'arrival'}, {id: 'spot:garden', name: 'Quiet Garden', kind: 'spot'}];
const brief = {purpose: 'Welcome for Mina', guestOfHonor: 'Mina', preferences: ['garden'], constraints: [], startsAt: null, guests: 6};
const owner = {userId: 'owner-user', name: 'Owner'};

const stores = [['memory', async () => now => createMemoryWorkplaceStore({now})]];
if (process.env.REDIS_URL) stores.push(['redis', async t => {
  const redis = new Redis(process.env.REDIS_URL); redis.on('error', () => {});
  const prefix = `{river-oaks:workplace-cap:${randomUUID()}}`;
  t.after(async () => { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  const store = createRedisWorkplaceStore({redis, prefix});
  return () => store;
}]);

for (const [name, makeStore] of stores) test(`${name}: a task dropped by the finished-task cap takes its draft with it`, async t => {
  let time = 1_000_000, ids = 0;
  const now = () => time, store = (await makeStore(t))(now);
  const workplace = createWorkplace({store, now, stepMs: STEP, limits: {keptTasks: 1, artifacts: 2},
    createId: () => `id-${String(++ids).padStart(6, '0')}`, schedule: () => null, cancel: () => {}});
  await workplace.companion(owner, {name: 'Pip'}); await workplace.grant(owner, {scope: 'event_plan'});
  const finishOne = async requestId => {
    const submitted = await workplace.submit(owner, {brief, requestId}, {worldId: 'river-oaks', places});
    assert.equal(submitted.ok, true, `${requestId}: ${submitted.reason}`);
    for (let i = 0; i < 12; i++) { time += STEP; await workplace.advance(owner.userId); }
    return submitted.taskId;
  };
  await finishOne('request-0001');
  await finishOne('request-0002');
  // Only one finished task is kept, so the first was dropped, with its draft.
  const {state} = await workplace.state(owner);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.artifacts.length, 1, 'one visible draft');
  // A third task fits under the two-draft limit; a hidden leftover used to refuse it.
  const third = await workplace.submit(owner, {brief, requestId: 'request-0003'}, {worldId: 'river-oaks', places});
  assert.equal(third.ok, true, third.reason);
});
