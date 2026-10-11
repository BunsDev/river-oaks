// "Erase my workplace" (#221 gap): one owner action removes every stored trace
// (companion, grant, tasks, briefs, drafts, receipts, notices, the due entry
// and any desk) atomically, and nothing a racing runner does brings it back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createWorkplace, createMemoryWorkplaceStore, createRedisWorkplaceStore } from '../workplace.js';
import { validateWorkplaceRequest } from '../../preview/src/workplace-contract.js';

const STEP = 1000;
const places = [{id: 'arrival', name: 'Arrival', kind: 'arrival'}, {id: 'spot:garden', name: 'Quiet Garden', kind: 'spot'}];
const brief = {purpose: 'Secret welcome for Mina', guestOfHonor: 'Mina', preferences: ['garden'], constraints: [], startsAt: null, guests: 6};
const owner = {userId: 'owner-user', name: 'Owner'}, guest = {userId: 'guest-user', name: 'Guest'};
const hash = value => createHash('sha256').update(value).digest('hex');
const ownerKey = user => `owner:${hash(user.userId)}`, workKey = (user, taskId) => `work:${hash(user.userId)}:${taskId}`;

const stores = [['memory', async () => now => createMemoryWorkplaceStore({now})]];
if (process.env.REDIS_URL) stores.push(['redis', async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const prefix = `{river-oaks:workplace-erase:${randomUUID()}}`;
  t.after(async () => { const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const store = createRedisWorkplaceStore({redis, prefix});
  store.keys = async () => (await redis.keys(`${prefix}*`)).map(key => key.slice(`${prefix}:workplace:v1:`.length));
  return () => store;
}]);

function harness(makeStore) {
  let time = 1_000_000, ids = 0;
  const now = () => time, store = makeStore(now);
  const workplace = createWorkplace({store, now, stepMs: STEP, createId: () => `id-${String(++ids).padStart(6, '0')}`, schedule: () => null, cancel: () => {}});
  return {workplace, store, tick: ms => { time += ms; }};
}
async function busyOwner(h, actor = owner) {
  await h.workplace.companion(actor, {name: 'Pip'});await h.workplace.grant(actor, {scope: 'event_plan'});
  const first = await h.workplace.submit(actor, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
  for (let i = 0; i < 8; i++) { h.tick(STEP);await h.workplace.advance(actor.userId); }
  const second = await h.workplace.submit(actor, {brief, requestId: 'request-0002'}, {worldId: 'river-oaks', places});
  await h.workplace.presence(actor, {mode: 'stationed'});
  return [first.taskId, second.taskId];
}

test('erase needs an explicit confirmation and nothing else', () => {
  assert.equal(validateWorkplaceRequest('erase', {confirm: 'erase'}).ok, true);
  for (const body of [{}, {confirm: true}, {confirm: 'yes'}, {confirm: 'erase', userId: 'other'}]) assert.equal(validateWorkplaceRequest('erase', body).ok, false, JSON.stringify(body));
});

for (const [name, makeStore] of stores) {
  test(`${name}: erase removes every stored trace of the owner, and only theirs`, async t => {
    const h = harness(await makeStore(t));
    const [done, running] = await busyOwner(h);
    const [neighbourDone] = await busyOwner(h, guest);
    assert.equal((await h.workplace.occupancy(owner)).stations.filter(station => station.occupied).length, 2);
    const result = await h.workplace.erase(owner, {confirm: 'erase'});
    assert.equal(result.ok, true);
    assert.equal(result.state.companion, null);assert.equal(result.state.grant, null);
    assert.equal(result.state.tasks.length + result.state.artifacts.length + result.state.notices.length, 0);
    assert.equal((await h.store.load(ownerKey(owner))).value, null, 'the owner document is gone');
    for (const taskId of [done, running]) assert.equal(await h.store.read(workKey(owner, taskId)), null, `brief ${taskId} is gone`);
    assert.deepEqual((await h.store.due('due', Infinity, 10)).map(entry => entry.member), [guest.userId], 'only the neighbour is still due');
    const stations = (await h.workplace.occupancy(guest)).stations;
    assert.equal(stations.filter(station => station.occupied).length, 1, 'the owner\'s desk is free');
    assert.equal(stations.some(station => station.mine), true, 'the neighbour keeps theirs');
    if (h.store.keys) assert.equal((await h.store.keys()).some(key => key.includes(hash(owner.userId))), false, 'no key names the owner');
    // The neighbour is untouched.
    assert.notEqual(await h.store.read(workKey(guest, neighbourDone)), null);
    assert.equal((await h.workplace.state(guest)).state.companion.name, 'Pip');
    // The owner can start over.
    assert.equal((await h.workplace.companion(owner, {name: 'Juniper'})).ok, true);
  });

  test(`${name}: a runner racing the erase cannot bring anything back`, async t => {
    const h = harness(await makeStore(t));
    await h.workplace.companion(owner, {name: 'Pip'});await h.workplace.grant(owner, {scope: 'event_plan'});
    const {taskId} = await h.workplace.submit(owner, {brief, requestId: 'request-0001'}, {worldId: 'river-oaks', places});
    // A runner loaded the document, then the owner erased before it saved.
    const stale = await h.store.load(ownerKey(owner));
    await h.workplace.erase(owner, {confirm: 'erase'});
    stale.value.tasks[0].status = 'completed';
    assert.equal(await h.store.save(ownerKey(owner), stale.revision, stale.value, 60_000, [{key: workKey(owner, taskId), op: 'set', value: {brief}, ttlMs: 60_000}]), false);
    for (let i = 0; i < 6; i++) { h.tick(STEP);await h.workplace.advance(owner.userId); }
    assert.equal((await h.store.load(ownerKey(owner))).value, null);
    assert.equal(await h.store.read(workKey(owner, taskId)), null);
    assert.equal((await h.workplace.erase(owner, {confirm: 'erase'})).ok, true, 'erasing an empty workplace is fine');
  });
}
