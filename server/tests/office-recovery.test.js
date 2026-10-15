import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { officeRedis } from './helpers/office-redis.js';
import { createRedisOfficeWorkspaces } from '../office-workspaces.js';
import { createRedisOfficeDesk } from '../office-desk.js';
import { workspaceContext, reconcileOfficeVisit } from '../office-workspace-visits.js';

const available = spawnSync('redis-server', ['--version']).status === 0;
const task = (id = 'task') => ({ id, title: 'Synthetic recovery', notes: 'Private content', result: '', links: [], status: 'open' });
test('owned Redis AOF crash recovery and RDB backup restore preserve office fences', { skip: !available && !process.env.REDIS_URL }, async t => {
  assert.ok(available, 'Install redis-server for the full recovery gate');
  const fixture = await officeRedis(), restore = await officeRedis();
  t.after(async () => { await fixture.close(); await restore.close(); });
  const prefix = '{office-recovery}', now = () => 100;
  let redis = await fixture.start();
  const connect = () => ({ shared: createRedisOfficeWorkspaces({ redis, prefix, now }), private: createRedisOfficeDesk({ redis, prefix, now }) });
  let app = connect();
  const { id } = await app.shared.provision('owner');
  await app.shared.invite('owner', id, 'guest'); await app.shared.accept('guest', id);
  await app.shared.invite('owner', id, 'pending');
  const sharedSave = { expectedVersion: 0, operationId: 'shared-save', task: task() };
  const privateSave = { expectedVersion: 0, operationId: 'private-save', task: task('private') };
  // Drop the successful responses; replacement must retry the exact operations.
  assert.equal((await app.shared.save('guest', id, sharedSave)).ok, true);
  assert.equal((await app.private.save('owner', privateSave)).ok, true);
  const before = { shared: await app.shared.read('owner', id), private: await app.private.read('owner'), discovery: await app.shared.list('guest') };
  async function verifyRestored() {
    assert.deepEqual(await app.shared.read('owner', id), before.shared);
    assert.deepEqual(await app.private.read('owner'), before.private);
    assert.deepEqual(await app.shared.list('guest'), before.discovery);
    assert.equal((await app.shared.authorize('pending', id)).ok, false);
    assert.deepEqual((await app.private.read('guest')).tasks, []);
    assert.equal((await app.shared.save('guest', id, sharedSave)).desk.version, 1);
    assert.equal((await app.private.save('owner', privateSave)).desk.version, 1);
    assert.equal((await workspaceContext(app.shared, 'guest', { type: 'office', action: 'enter', officeId: id })).role, 'accepted');
  }
  app = connect(); await verifyRestored(); // Application/store replacement, Redis stays alive.
  await fixture.stop({ crash: true }); redis = await fixture.start(); app = connect();
  await verifyRestored(); // No graceful SAVE: acknowledged writes survived AOF replay.
  await redis.save(); // Consistent synthetic snapshot, copied into a fresh owned instance.
  await copyFile(join(fixture.directory, 'dump.rdb'), join(restore.directory, 'dump.rdb'));
  redis = await restore.start({ aof: false }); app = connect(); await verifyRestored();
  const race = await Promise.all(['owner','guest'].map((user,i) => app.shared.save(user, id, { expectedVersion: 1, operationId: `race-${i}`, task: { ...task(), result: user } })));
  assert.equal(race.filter(r => r.ok).length, 1); assert.equal(race.find(r => !r.ok).reason, 'desk_conflict');
  const privateRace = await Promise.all([0,1].map(i => app.private.save('owner', { expectedVersion: 1, operationId: `private-race-${i}`, task: { ...task('private'), result: String(i) } })));
  assert.equal(privateRace.filter(r => r.ok).length, 1);
  const removal = { expectedVersion: 2, operationId: 'remove', id: 'task' };
  const privateRemoval = { expectedVersion: 2, operationId: 'remove-private', id: 'private' };
  assert.equal((await app.shared.remove('owner', id, removal)).ok, true);
  assert.equal((await app.private.remove('owner', privateRemoval)).ok, true);
  await app.shared.revoke('owner', id, 'guest');
  await redis.save(); await restore.stop(); redis = await restore.start({ aof: false }); app = connect();
  assert.equal((await app.shared.save('guest', id, sharedSave)).reason, 'office_access_denied');
  assert.equal((await app.shared.read('guest', id)).ok, false);
  let ended = false;
  await reconcileOfficeVisit({ officeVisit: () => ({ id }), endOfficeVisit() { ended = true; } }, app.shared, 'guest');
  assert.equal(ended, true, 'restored revoked visit is removed before reconnect publication');
  assert.deepEqual((await app.shared.list('guest')), []);
  assert.equal((await app.shared.remove('owner', id, removal)).desk.version, 3);
  assert.equal((await app.private.remove('owner', privateRemoval)).desk.version, 3);
  assert.deepEqual((await app.private.save('owner', privateSave)).desk.tasks, [], 'old successful receipt never resurrects deleted private content');
  await app.shared.invite('owner', id, 'guest');
  assert.equal((await app.shared.read('guest', id)).ok, false, 'reinvite still needs acceptance');
  await app.shared.accept('guest', id);
  assert.equal((await app.shared.save('guest', id, sharedSave)).reason, 'desk_conflict', 'old membership epoch cannot replay');
  assert.deepEqual((await app.shared.read('owner', id)).desk.tasks, []);
  // Evict receipts through bounded edits, then retry stale writes after replacement.
  for (let i = 0; i < 33; i++) {
    assert.equal((await app.shared.save('owner', id, { expectedVersion: 3+i, operationId: `roll-${i}`, task: task('new') })).ok, true);
    assert.equal((await app.private.save('owner', { expectedVersion: 3+i, operationId: `roll-${i}`, task: task('new-private') })).ok, true);
  }
  app = connect();
  assert.equal((await app.shared.remove('owner', id, removal)).reason, 'desk_conflict');
  assert.equal((await app.private.save('owner', privateSave)).reason, 'desk_conflict');
  assert.equal((await app.shared.read('owner', id)).desk.tasks.some(t => t.id === 'task'), false);
  assert.equal((await app.private.read('owner')).tasks.some(t => t.id === 'private'), false);
});
