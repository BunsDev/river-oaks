import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DEFAULT_WORLD_ID, WORLD_PROTOCOL_VERSION, validateWorldId, worldIdFromSearch } from '../../preview/src/world-contract.js';
import { createSharedWorld } from '../world.js';

const data = { scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-12, 0, 0], collisionPolygons: [], stores: [], buildings: [],
  communityLocations: [{ id: 'a', name: 'Garden', position: [-12, 0, 0] }] };
const sign = envelope => ({ ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') });

test('world ids are canonical slugs and the default has a stable protocol', () => {
  assert.equal(DEFAULT_WORLD_ID, 'river-oaks');
  assert.equal(WORLD_PROTOCOL_VERSION, 1);
  assert.equal(validateWorldId('garden-2'), 'garden-2');
  for (const bad of ['', 'Garden', '-garden', 'garden-', 'a/b', 'a'.repeat(49)]) assert.throws(() => validateWorldId(bad));
  assert.equal(worldIdFromSearch('?place=arrival'),DEFAULT_WORLD_ID);
  assert.equal(worldIdFromSearch('?world=garden-2&place=arrival'),'garden-2');
  assert.throws(() => worldIdFromSearch('?world=garden-2&world=river-oaks'));
});

test('two worlds with the same geography have distinct snapshots and reject each others checkpoints', () => {
  const first = createSharedWorld(data, { worldId: 'river-oaks' });
  const second = createSharedWorld(data, { worldId: 'garden-2' });
  first.join({ userId: 'alice', name: 'Alice' });
  second.join({ userId: 'bob', name: 'Bob' });
  assert.equal(first.snapshot().worldId, 'river-oaks');
  assert.equal(second.snapshot().worldId, 'garden-2');
  assert.equal(first.snapshot().protocolVersion, WORLD_PROTOCOL_VERSION);
  assert.deepEqual(first.snapshot().players.map(player => player.id), ['alice']);
  assert.deepEqual(second.snapshot().players.map(player => player.id), ['bob']);
  assert.equal(second.restore(first.checkpoint()).ok, false);
  assert.equal(first.restore(second.checkpoint()).ok, false);
  assert.deepEqual(second.snapshot().players.map(player => player.id), ['bob']);
});

test('only the default world accepts a correctly signed legacy checkpoint', () => {
  const original = createSharedWorld(data);
  original.join({ userId: 'alice', name: 'Alice' });
  const { checksum: _checksum, worldId: _worldId, ...legacy } = original.checkpoint();
  legacy.version = 1;
  const saved = sign(legacy);
  const defaultWorld = createSharedWorld(data);
  assert.deepEqual(defaultWorld.restore(saved), { ok: true });
  assert.equal(defaultWorld.snapshot().players[0].id, 'alice');
  assert.equal(createSharedWorld(data, { worldId: 'garden-2' }).restore(saved).ok, false);
});
