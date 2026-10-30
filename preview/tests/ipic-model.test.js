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

test('the escalator well and landing stone never shares a plane with their plaster, nor the lobby sign its wall', async () => {
  const [{ buildIpicInterior }, { findDepthFights }] = await Promise.all([import('../src/ipic-interior.js'), import('../src/depth-layer-audit.js')]);
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  const room = planStoreRooms(world).find(r => r.interior);
  const group = buildIpicInterior(room, { textures: false, local: true });
  group.updateMatrixWorld(true);
  // Run walls, header and fascias rose into the well's ceiling slab, the bay ceilings ran flush with
  // their front walls, and the sign hung 2 cm off the timber (2026-10-30, after the well opened).
  const fights = findDepthFights(group).filter(fight => /taupe-stacked-stone.*warm-plaster|warm-plaster.*taupe-stacked-stone|TUCK ROOM/.test(`${fight.a} ${fight.b}`));
  assert.deepEqual(fights.map(fight => `${fight.a} × ${fight.b} at ${fight.at.map(v => v.toFixed(2))}`), []);
  group.userData.dispose?.();
});

test('the lift doors, mural, back-bar wall and wine fridges stand clear of what is behind them', async () => {
  const [{ buildIpicInterior }, { findDepthFights }] = await Promise.all([import('../src/ipic-interior.js'), import('../src/depth-layer-audit.js')]);
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  const room = planStoreRooms(world).find(r => r.interior);
  const group = buildIpicInterior(room, { textures: false, local: true });
  group.updateMatrixWorld(true);
  // Each stood 5 mm to 4.75 cm off its backing (2026-10-30): the fridge glass on its cabinet, the burgundy
  // wall on the lounge's timber, the mural on its black wall and the bronze lift doors on their surround.
  const fights = findDepthFights(group).filter(fight => /wine-fridge|burgundy-booths|book-spine-mural|ipic-bronze/.test(`${fight.a} ${fight.b}`));
  assert.deepEqual(fights.map(fight => `${fight.a} × ${fight.b} at ${fight.at.map(v => v.toFixed(2))}`), []);
  group.userData.dispose?.();
});
