import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryLandmarks } from '../landmarks.js';
import { createWorldLandmarks } from '../world-landmarks.js';

test('account directory exposes each private landmark with its original world', async () => {
  const entries = [
    { id: 'river-oaks', title: 'River Oaks District' },
    { id: 'moon-garden', title: 'Moon Garden' },
  ];
  const catalog = { list: async () => entries, get: async id => entries.find(world => world.id === id) };
  const stores = new Map(entries.map(world => [world.id, createMemoryLandmarks({ now: () => world.id === 'river-oaks' ? 1 : 2 })]));
  const storeFor = id => stores.get(id);
  const river = createWorldLandmarks({ catalog, storeFor, worldId: 'river-oaks' });
  const moon = createWorldLandmarks({ catalog, storeFor, worldId: 'moon-garden' });
  const first = (await river.add('alice', { name: 'First', position: [1, 2], yaw: 0 })).landmark;
  const second = (await moon.add('alice', { name: 'Second', position: [3, 4], yaw: 1 })).landmark;
  assert.deepEqual((await river.list('alice')).map(item => item.id), [first.id], 'older tabs see only their current world');
  assert.deepEqual((await river.list('alice', true)).map(item => item.id), [second.id, first.id]);
  assert.deepEqual(await moon.list('alice', true), await river.list('alice', true));
  assert.equal((await river.list('bob')).length, 0);
  assert.equal(await river.remove('bob', second.id, 'moon-garden'), false);
  assert.equal(await river.remove('alice', second.id, 'missing-world'), false);
  assert.equal(await river.remove('alice', second.id, 'moon-garden'), true);
  assert.deepEqual((await moon.list('alice', true)).map(item => item.id), [first.id]);
  assert.deepEqual((await stores.get('river-oaks').list('alice'))[0].worldId, undefined, 'existing records remain in their original format');
});
