import { generateBuildingInteriorPlan } from './building-interiors-plan.js';
import { planStoreRooms } from './store-rooms.js';

export const DISTRICT_GALLERY_PLAN_SHA256 = '0706ae539093c276d02cc7da210499b298fd1bd76b7b76444af27c8a2d3b27c0';
export const DISTRICT_GALLERY_LEVELS_SHA256 = '59df1b259bbb2d7d0e47b296a333be9b938145f13ae1319fe78863d4377af4b5';
const GALLERY_STORE_ID = 'osm-node-8172494977';
const GALLERY_BUILDING_ID = 'osm-way-625333006';

/** Attach one reviewed plan revision to the original district without changing the fixture file. */
export function attachDistrictGalleryPlan(world, approved) {
  const store = world?.stores?.find(item => item.id === GALLERY_STORE_ID);
  const building = world?.buildings?.find(item => item.id === GALLERY_BUILDING_ID);
  const levelCount = approved?.levels?.length;
  const expectedSha256 = levelCount === 1 ? DISTRICT_GALLERY_PLAN_SHA256
    : levelCount === 2 ? DISTRICT_GALLERY_LEVELS_SHA256 : null;
  if (!store || store.building_id !== building?.id || world.buildingInteriors
    || !expectedSha256 || approved?.approvedSha256 !== expectedSha256
    || approved?.worldId !== 'river-oaks' || approved?.buildingId !== building.id
  ) throw new Error('Unapproved district gallery plan');
  const rooms = planStoreRooms(world).filter(room => room.buildingId === building.id);
  const legacy = rooms.find(room => room.storeId === store.id);
  if (!legacy) throw new Error('Gallery entrance is unavailable');
  const regenerated = generateBuildingInteriorPlan({
    worldId: 'river-oaks', building,
    entrance: { id: store.id, position: store.facade, outward: store.outward },
    seed: building.id, levels: levelCount, baseElevation: legacy.floor,
    reservedFootprints: rooms.filter(room => room !== legacy).map(room => room.footprint),
  });
  const { approvedSha256: _digest, ...plan } = approved;
  if (JSON.stringify(plan) !== JSON.stringify(JSON.parse(JSON.stringify(regenerated)))) {
    throw new Error('District gallery plan differs from its approved inputs');
  }
  return { ...world, buildingInteriors: [structuredClone(approved)] };
}
