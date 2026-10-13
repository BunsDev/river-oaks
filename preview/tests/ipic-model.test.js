import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planStoreRooms } from '../src/store-rooms.js';

test('the reusable IPIC asset has finite geometry, all zones, and a disposable lifecycle', async () => {
  const { buildIpicInterior } = await import('../src/ipic-interior.js');
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  const room = planStoreRooms(world).find(r => r.interior);
  const group = buildIpicInterior(room, { textures: false, local: true });
  for (const name of ['Reception', 'Escalators', 'Mural landing', 'Upper lounge', 'Tuck Room', 'Cinema corridor', 'Auditorium']) assert.ok(group.getObjectByName(name), name);
  let meshes = 0, triangles = 0;
  group.traverse(item => {
    if (!item.isMesh) return;
    meshes++; const p = item.geometry.getAttribute('position');
    assert.ok(Array.from(p.array).every(Number.isFinite), item.name);
    triangles += (item.geometry.index?.count ?? p.count) / 3;
  });
  assert.ok(meshes > 20 && triangles < 200000, `${meshes} meshes, ${triangles} triangles`);
  await group.userData.ready;
  group.userData.dispose(); assert.equal(group.children.length, 0);
});
