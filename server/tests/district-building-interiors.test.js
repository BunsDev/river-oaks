import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateBuildingInteriorPlan } from '../../preview/src/building-interiors-plan.js';
import { attachDistrictGalleryPlan } from '../../preview/src/district-interior-contract.js';
import { planStoreRooms, storeRoomsFor } from '../../preview/src/store-rooms.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { loadDistrictData } from '../district-data.js';
import { recoverDistrictInteriorCheckpoint } from '../district-interior-checkpoint-migration.js';
import { createSharedWorld } from '../world.js';

const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const approved = JSON.parse(readFileSync(new URL('../../preview/public/data/building-interiors/river-oaks-gallery-v1.json', import.meta.url)));
const approvedLevels = JSON.parse(readFileSync(new URL('../../preview/public/data/building-interiors/river-oaks-gallery-v2.json', import.meta.url)));

test('the district gallery has one reproducible server-approved plan without claiming other storefronts', () => {
  const store = district.stores.find(item => item.name === 'Laura Rathe Fine Art');
  const building = district.buildings.find(item => item.id === store.building_id);
  const buildingRooms = planStoreRooms(district).filter(room => room.buildingId === building.id);
  const legacyGallery = buildingRooms.find(room => room.storeId === store.id);
  const otherRooms = buildingRooms.filter(room => room.storeId !== store.id);
  assert.equal(Object.hasOwn(district, 'buildingInteriors'), false, 'checkpoint fingerprint stays unchanged until migration');
  assert.equal(approved.buildingId, building.id);
  assert.equal(approved.levels.length, 1);
  assert.equal(approved.levels[0].floorElevation, legacyGallery.floor, 'the entrance keeps its existing walkable datum');
  const { approvedSha256, ...plan } = approved;
  assert.equal(approvedSha256, createHash('sha256').update(JSON.stringify(plan)).digest('hex'));
  const regenerated = generateBuildingInteriorPlan({
    worldId: 'river-oaks', building,
    entrance: { id: store.id, position: store.facade, outward: store.outward },
    seed: building.id, levels: 1, baseElevation: legacyGallery.floor,
    reservedFootprints: otherRooms.map(room => room.footprint),
  });
  assert.deepEqual(plan, JSON.parse(JSON.stringify(regenerated)));
  const room = plan.levels[0].rooms[0];
  for (const neighbor of otherRooms) {
    assert.equal(neighbor.contains(...room.footprint[0]), false, `${neighbor.name} is clear`);
    assert.equal(neighbor.contains(...room.footprint[2]), false, `${neighbor.name} is clear`);
  }
});

test('the previous gallery revision preserves a validated town checkpoint for chained migration', async () => {
  const oldData = structuredClone(district);
  oldData.vegetation = JSON.parse(readFileSync(new URL('../../preview/public/data/district-vegetation.json', import.meta.url)));
  const newData = attachDistrictGalleryPlan(oldData, approved);
  assert.deepEqual(await loadDistrictData(), attachDistrictGalleryPlan(oldData, approvedLevels));
  const options = { now: () => 100000 };
  const oldWorld = createSharedWorld(oldData, options);
  assert.equal(oldWorld.join({ userId: 'gallery-visitor', name: 'Visitor' }).ok, true);
  assert.equal(oldWorld.command('gallery-visitor', { type: 'chat', text: 'Keep the town.' }).ok, true);
  const checkpoint = oldWorld.checkpoint();
  assert.equal(createSharedWorld(newData, options).restore(checkpoint).ok, false);
  const result = recoverDistrictInteriorCheckpoint({ worldData: newData, checkpoint, ...options });
  assert.equal(result.ok, true);
  assert.equal(result.from, 'previous_district');
  assert.deepEqual(oldWorld.checkpoint(), checkpoint, 'migration keeps the source checkpoint unchanged');
  const before = structuredClone(checkpoint.payload), after = structuredClone(result.checkpoint.payload);
  for (const [index, local] of after.state.locals.entries()) {
    if (local.storeId !== 'osm-node-8172494977') continue;
    const environment = createWalkingEnvironment(newData);
    assert.equal(environment.roomAt(local.position[0], -local.position[1])?.storeId, local.storeId);
    assert.equal(environment.isFree(local.position[0], -local.position[1]), true);
    delete local.position; delete before.state.locals[index].position;
    delete local.life.routeVersion; delete before.state.locals[index].life.routeVersion;
  }
  assert.deepEqual(after, before, 'account and town state survive except necessary gallery standing positions');
  const restored = createSharedWorld(newData, options);
  assert.equal(restored.restore(result.checkpoint).ok, true);
  assert.deepEqual(restored.checkpoint(), result.checkpoint);
  const corrupt = { ...checkpoint, checksum: 'broken' };
  assert.equal(recoverDistrictInteriorCheckpoint({ worldData: newData, checkpoint: corrupt, ...options }).ok, false);
  assert.equal(recoverDistrictInteriorCheckpoint({ worldData: newData, checkpoint, worldId: 'other-world', ...options }).ok, false);
  const modified = structuredClone(newData);
  modified.buildingInteriors[0].levels[0].floorElevation += 1;
  assert.equal(recoverDistrictInteriorCheckpoint({ worldData: modified, checkpoint, ...options }).ok, false);

  const legacyRoom = planStoreRooms(oldData).find(room => room.storeId === 'osm-node-8172494977');
  const [east, north] = legacyRoom.toWorld(-6.4, 4);
  const oldEnvironment = createWalkingEnvironment(oldData);
  assert.equal(oldEnvironment.isFree(east, -north), true);
  assert.equal(createWalkingEnvironment(newData).isFree(east, -north), false);
  const occupied = structuredClone(checkpoint);
  occupied.payload.players[0].position = [east, north, oldEnvironment.groundAt(east, -north)];
  const { checksum: _oldChecksum, ...oldEnvelope } = occupied;
  occupied.checksum = createHash('sha256').update(JSON.stringify(oldEnvelope)).digest('hex');
  assert.equal(createSharedWorld(oldData, options).restore(occupied).ok, true);
  const relocated = recoverDistrictInteriorCheckpoint({ worldData: newData, checkpoint: occupied, ...options });
  assert.equal(relocated.ok, true);
  const [arrivalEast, arrivalNorth] = relocated.checkpoint.payload.players[0].position;
  const newEnvironment = createWalkingEnvironment(newData);
  assert.equal(newEnvironment.isFree(arrivalEast, -arrivalNorth), true);
  assert.equal(newEnvironment.roomAt(arrivalEast, -arrivalNorth), null, 'an invalid legacy room position returns outside');
  assert.equal(createSharedWorld(newData, options).restore(relocated.checkpoint).ok, true);
});

test('the approved gallery footprint and fixture govern shared walking while neighbor rooms stay legacy', async () => {
  const active = await loadDistrictData(), rooms = storeRoomsFor(active);
  const store = active.stores.find(item => item.name === 'Laura Rathe Fine Art');
  const room = rooms.find(item => item.storeId === store.id);
  const approvedLevel = active.buildingInteriors[0].levels[0];
  assert.equal(room.planId, approvedLevel.id);
  assert.deepEqual(room.footprint, approvedLevel.rooms[0].footprint);
  const legacy = planStoreRooms(active);
  for (const neighbor of rooms.filter(item => item.buildingId === store.building_id && item.storeId !== store.id)) {
    assert.equal(neighbor.generatedPlan, undefined);
    assert.deepEqual(neighbor.footprint, legacy.find(item => item.storeId === neighbor.storeId).footprint);
  }
  const environment = createWalkingEnvironment(active);
  const [fixture] = approvedLevel.layers.fixtures;
  const center = polygon => polygon.reduce(([x, y], point) => [x + point[0] / polygon.length, y + point[1] / polygon.length], [0, 0]);
  const [fx, fy] = center(fixture.footprint);
  assert.equal(environment.roomAt(fx, -fy)?.storeId, store.id);
  assert.equal(environment.isFree(fx, -fy), false, 'the approved display blocks the player');
  const [ox, oy] = store.outward;
  for (const d of [-1, -0.25, 0.25, 0.75, 1.5, 2.5]) {
    const east = store.facade[0] - ox * d, north = store.facade[1] - oy * d;
    assert.equal(environment.roomAt(east, -north)?.storeId, store.id, `entrance at depth ${d}`);
    assert.equal(environment.isFree(east, -north), true, `clear route at depth ${d}`);
  }
  assert.equal(environment.groundAt(...[store.facade[0], -store.facade[1]]), room.floor);
});
