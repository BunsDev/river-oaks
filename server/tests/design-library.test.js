import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryDesignLibrary, createRedisDesignLibrary } from '../design-library.js';
import { accountDesignCommand } from '../design-commands.js';

test('account designs cross worlds while older room designs remain available', async () => {
  const library = createMemoryDesignLibrary({ now: () => 1234 });
  const local = [{ id: 'design-7', kind: 'seat', finish: 'rose', createdAt: 100 }];
  const room = {
    worldId: 'river-oaks',
    async request(operation) {
      if (operation.type === 'heartbeat') return { ok: true };
      if (operation.message?.action === 'list') return { ok: true, items: structuredClone(local) };
      if (operation.message?.action === 'remove') {
        const index = local.findIndex(item => item.id === operation.message.id);
        if (index < 0) return { ok: false, error: 'unknown_design' };
        local.splice(index, 1); return { ok: true, items: structuredClone(local) };
      }
      throw new Error('Unexpected room request');
    },
    async read() { return { snapshot: { builds: [{ id: 'build-1', ownerId: 'jevica', kind: 'lamp', finish: 'brass' }] } }; },
  };
  const security = { async allow() { return true; } };
  const run = (command, worldId = 'river-oaks', userId = 'jevica', target = room) => accountDesignCommand({
    command, userId, connectionId: 'current', worldId, room: target, library, security, isAdmin: id => id === 'jevica',
  });
  assert.equal((await run({ type: 'inventory', action: 'list' }, 'river-oaks', 'guest')).result.error, 'admin_only');
  const saved = (await run({ type: 'inventory', action: 'save', buildId: 'build-1' })).result;
  assert.equal(saved.ok, true);
  assert.match(saved.item.id, /^design-global-/);
  assert.equal(saved.item.scope, 'account');
  assert.deepEqual(saved.items.map(item => item.scope), ['account', 'world']);
  const otherRoom = { ...room, async request(operation) {
    if (operation.type === 'heartbeat') return { ok: true };
    if (operation.message?.action === 'list') return { ok: true, items: [] };
    throw new Error('Unexpected room request');
  } };
  const across = (await run({ type: 'inventory', action: 'list' }, 'moon-garden', 'jevica', otherRoom)).result;
  assert.deepEqual(across.items.map(item => item.id), [saved.item.id]);
  const placed = await run({ type: 'build', action: 'place', templateId: saved.item.id, position: [1, 2], yaw: 0 }, 'moon-garden', 'jevica', otherRoom);
  assert.deepEqual(placed.command, { type: 'build', action: 'place', kind: 'lamp', finish: 'brass', position: [1, 2], yaw: 0 });
  assert.equal((await run({ type: 'build', action: 'place', templateId: saved.item.id, position: [1, 2], yaw: 0 }, 'moon-garden', 'guest', otherRoom)).result.error, 'admin_only');
  const copied = (await run({ type: 'inventory', action: 'copy', id: 'design-7' })).result;
  assert.equal(copied.ok, true);
  assert.deepEqual(copied.item.source, { worldId: 'river-oaks', designId: 'design-7' });
  assert.equal(copied.items.some(item => item.id === 'design-7'), false, 'portable copy hides the retained room original');
  assert.equal((await run({ type: 'inventory', action: 'copy', id: 'design-7' })).result.item.id, copied.item.id);
  const removed = (await run({ type: 'inventory', action: 'remove', id: copied.item.id })).result;
  assert.equal(removed.ok, true);
  assert.equal(removed.items.some(item => item.id === 'design-7'), true, 'deleting a copy reveals the original room design');
  assert.equal((await run({ type: 'inventory', action: 'remove', id: saved.item.id })).result.ok, true);
  assert.equal((await run({ type: 'inventory', action: 'list' }, 'moon-garden', 'jevica', otherRoom)).result.items.length, 0);
  const stale = { ...room, async request() { return { ok: false, error: 'stale_connection' }; } };
  assert.equal((await run({ type: 'inventory', action: 'list' }, 'river-oaks', 'jevica', stale)).result.error, 'stale_connection');
});

test('account library isolates owners, validates records, and enforces its 48-design limit', async () => {
  const library = createMemoryDesignLibrary();
  assert.equal((await library.save('a', { kind: 'unknown', finish: 'rose' })).error, 'invalid_inventory');
  for (let index = 0; index < 48; index++) assert.equal((await library.save('a', { kind: 'seat', finish: 'rose' })).ok, true);
  assert.equal((await library.save('a', { kind: 'seat', finish: 'rose' })).error, 'inventory_limit');
  assert.deepEqual(await library.list('b'), []);
  const first = (await library.list('a'))[0];
  assert.equal(await library.get('b', first.id), null);
  assert.equal((await library.remove('b', first.id)).error, 'unknown_design');
  assert.equal((await library.remove('a', first.id)).ok, true);
  assert.equal((await library.save('a', { kind: 'armchair', finish: 'teal' })).ok, true);
});

test('Redis design library serializes concurrent worlds and survives replacement', { skip: !process.env.REDIS_URL }, async () => {
  const redis = new Redis(process.env.REDIS_URL); redis.on('error', () => {});
  const prefix = `{river-oaks:design-library-test:${randomUUID()}}`;
  const first = createRedisDesignLibrary({ redis, prefix }), second = createRedisDesignLibrary({ redis, prefix });
  try {
    const saved = await Promise.all(Array.from({ length: 16 }, (_, index) => (index % 2 ? first : second)
      .save('jevica', { kind: 'side-table', finish: 'slate' })));
    assert.equal(saved.every(result => result.ok), true);
    const items = await second.list('jevica');
    assert.equal(items.length, 16);
    assert.equal(new Set(items.map(item => item.id)).size, 16);
    const source = { worldId: 'moon-garden', designId: 'design-12' };
    const copied = await Promise.all([first.save('jevica', { kind: 'seat', finish: 'rose', source }),
      second.save('jevica', { kind: 'seat', finish: 'rose', source })]);
    assert.equal(copied[0].item.id, copied[1].item.id);
    assert.equal((await first.list('jevica')).length, 17);
    assert.equal((await second.remove('jevica', copied[0].item.id)).ok, true);
    assert.equal(await first.get('jevica', copied[0].item.id), null);
    assert.deepEqual(await second.list('other'), []);
    const corruptId = createHash('sha256').update('corrupt').digest('hex');
    await redis.hset(`${prefix}:design-library:v1`, corruptId, JSON.stringify({ version: 1, items: [{ id: 'forged' }] }));
    await assert.rejects(first.list('corrupt'), /Invalid design library record/);
  } finally {
    await redis.del(`${prefix}:design-library:v1`);
    await redis.quit();
  }
});
