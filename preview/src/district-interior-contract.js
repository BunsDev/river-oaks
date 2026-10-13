import { generateBuildingInteriorPlan } from './building-interiors-plan.js';
import { planStoreRooms } from './store-rooms.js';

export const DISTRICT_GALLERY_PLAN_SHA256 = '0706ae539093c276d02cc7da210499b298fd1bd76b7b76444af27c8a2d3b27c0';
const GALLERY_STORE_ID = 'osm-node-8172494977';
const GALLERY_BUILDING_ID = 'osm-way-625333006';

/** Attach one reviewed plan to the original district without changing the fixture file. */
export function attachDistrictGalleryPlan(world, approved) {
  const store = world?.stores?.find(item => item.id === GALLERY_STORE_ID);
  const building = world?.buildings?.find(item => item.id === GALLERY_BUILDING_ID);
  if (!store || store.building_id !== building?.id || world.buildingInteriors
    || approved?.approvedSha256 !== DISTRICT_GALLERY_PLAN_SHA256
    || approved?.worldId !== 'river-oaks' || approved?.buildingId !== building.id
    || approved?.levels?.length !== 1) throw new Error('Unapproved district gallery plan');
  const rooms = planStoreRooms(world).filter(room => room.buildingId === building.id);
  const legacy = rooms.find(room => room.storeId === store.id);
  if (!legacy) throw new Error('Gallery entrance is unavailable');
  const regenerated = generateBuildingInteriorPlan({
    worldId: 'river-oaks', building,
    entrance: { id: store.id, position: store.facade, outward: store.outward },
    seed: building.id, levels: 1, baseElevation: legacy.floor,
    reservedFootprints: rooms.filter(room => room !== legacy).map(room => room.footprint),
  });
  const { approvedSha256: _digest, ...plan } = approved;
  if (JSON.stringify(plan) !== JSON.stringify(JSON.parse(JSON.stringify(regenerated)))) {
    throw new Error('District gallery plan differs from its approved inputs');
  }
  return { ...world, buildingInteriors: [structuredClone(approved)] };
}
