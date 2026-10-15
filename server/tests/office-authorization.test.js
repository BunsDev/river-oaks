import test from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createMemoryOfficeWorkspaces, createRedisOfficeWorkspaces } from '../office-workspaces.js';
import { workspaceContext, reconcileOfficeVisits } from '../office-workspace-visits.js';
import { officeRedis } from './helpers/office-redis.js';

test('visit authorization never calls task read and reconciliation fails closed', async () => {
  const store = createMemoryOfficeWorkspaces(), { id } = await store.provision('owner');
  store.read = () => { throw Error('Task documents must not be read by movement'); };
  assert.deepEqual(await workspaceContext(store, 'owner', { type: 'office', action: 'move', officeId: id }), { id, ownerId: 'owner', role: 'owner' });
  assert.equal(await workspaceContext(store, 'guest', { type: 'office', action: 'enter', officeId: id }), null);
  await store.invite('owner', id, 'guest'); await store.accept('guest', id);
  assert.equal((await workspaceContext(store, 'guest', { type: 'office', action: 'enter', officeId: id })).role, 'accepted');
  await store.revoke('owner', id, 'guest');
  assert.equal(await workspaceContext(store, 'guest', { type: 'office', action: 'move', officeId: id }), null);
  const ended = [], world = { players: new Map([['owner',{}],['guest',{}]]), officeVisit: () => ({ id }), endOfficeVisit: user => ended.push(user) };
  await reconcileOfficeVisits(world, store); assert.deepEqual(ended, ['guest']);
  ended.length = 0; store.authorize = async () => { throw Error('Storage unavailable'); };
  await reconcileOfficeVisits(world, store); assert.deepEqual(ended.sort(), ['guest','owner']);
  await assert.rejects(workspaceContext(store, 'owner', { type: 'office', action: 'move', officeId: id }));
});

const available = spawnSync('redis-server', ['--version']).status === 0;
test('Redis metadata reads exclude content and reject unsupported authorization records', { skip: !available && !process.env.REDIS_URL }, async t => {
  assert.ok(available, 'Install redis-server for the full metadata gate');
  const fixture = await officeRedis(); t.after(() => fixture.close());
  const redis = await fixture.start(), prefix = '{office-metadata}', store = createRedisOfficeWorkspaces({ redis, prefix });
  const { id } = await store.provision('owner');
  const marker = 'Synthetic secret body';
  await store.save('owner', id, { expectedVersion: 0, operationId: 'save', task: { id: 'task', title: 'Test', notes: marker.repeat(100), result: '', links: [], status: 'open' } });
  const outputs = [], original = redis.eval.bind(redis);
  redis.eval = async (...args) => { const value = await original(...args); outputs.push(value); return value; };
  assert.equal((await store.authorize('owner', id)).ok, true);
  assert.equal((await store.list('owner')).length, 1);
  assert.equal((await store.provision('owner')).id, id);
  assert.equal(outputs.length, 3);
  for (const raw of outputs) { const value = JSON.parse(raw); assert.equal('desk' in value, false); assert.equal('receipts' in value, false); assert.equal(raw.includes(marker), false); }
  const key = `${prefix}:office-workspaces:v1`, raw = await redis.hget(key,id), record = JSON.parse(raw);
  for (const bad of [{ ...record, schemaVersion: 999 }, { ...record, members: [{ userId: 'guest', status: 'accepted', epoch: null }] }, { ...record, ownerId: 'different' }]) {
    await redis.hset(key, id, JSON.stringify(bad));
    await assert.rejects(store.authorize('owner', id));
  }
  await redis.hset(key, id, raw);
  assert.equal((await store.authorize('guest', id)).ok, false);
});
