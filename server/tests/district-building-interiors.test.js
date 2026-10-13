import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateBuildingInteriorPlan } from '../../preview/src/building-interiors-plan.js';
import { planStoreRooms } from '../../preview/src/store-rooms.js';

const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const approved = JSON.parse(readFileSync(new URL('../../preview/public/data/building-interiors/river-oaks-gallery-v1.json', import.meta.url)));

test('the district gallery has one reproducible server-approved plan without claiming other storefronts', () => {
  const store = district.stores.find(item => item.name === 'Laura Rathe Fine Art');
  const building = district.buildings.find(item => item.id === store.building_id);
  const otherRooms = planStoreRooms(district).filter(room => room.buildingId === building.id && room.storeId !== store.id);
  assert.equal(Object.hasOwn(district, 'buildingInteriors'), false, 'checkpoint fingerprint stays unchanged until migration');
  assert.equal(approved.buildingId, building.id);
  assert.equal(approved.levels.length, 1);
  const { approvedSha256, ...plan } = approved;
  assert.equal(approvedSha256, createHash('sha256').update(JSON.stringify(plan)).digest('hex'));
  const regenerated = generateBuildingInteriorPlan({
    worldId: 'river-oaks', building,
    entrance: { id: store.id, position: store.facade, outward: store.outward },
    seed: building.id, levels: 1, baseElevation: store.facade[2],
    reservedFootprints: otherRooms.map(room => room.footprint),
  });
  assert.deepEqual(plan, JSON.parse(JSON.stringify(regenerated)));
  const room = plan.levels[0].rooms[0];
  for (const neighbor of otherRooms) {
    assert.equal(neighbor.contains(...room.footprint[0]), false, `${neighbor.name} is clear`);
    assert.equal(neighbor.contains(...room.footprint[2]), false, `${neighbor.name} is clear`);
  }
});
