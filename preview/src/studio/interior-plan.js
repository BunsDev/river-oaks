import { terrainHeight } from '../geometry.js';
import { generateBuildingInteriorPlan } from '../building-interiors-plan.js';

const ENTRANCE_EDGES = { south: 0, east: 1, north: 2, west: 3 };

/** Preview a creator building through the same primitive and entrance contract the server compiles. */
export function previewBuildingInteriorPlan(region, buildingId, worldId = 'studio-preview') {
  const building = region.buildings.find(item => item.id === buildingId);
  if (!building?.interior?.generation) throw new Error('Select a building with a generated interior.');
  const [west, south, east, north] = region.bounds_m;
  const terrain = { ...region.terrain, grid_origin_m: [west, south],
    spacing_m: [(east - west) / (region.terrain.width - 1), (north - south) / (region.terrain.height - 1)] };
  const [x, y] = building.center, [width, depth] = building.size;
  const angle = building.yaw_deg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const ring = [[-width / 2, -depth / 2], [width / 2, -depth / 2],
    [width / 2, depth / 2], [-width / 2, depth / 2]]
    .map(([dx, dy]) => [x + dx * c - dy * s, y + dx * s + dy * c]);
  ring.push([...ring[0]]);
  const edge = ENTRANCE_EDGES[building.interior.entrance];
  if (edge === undefined) throw new Error('Choose a valid building entrance.');
  const a = ring[edge], b = ring[edge + 1];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const door = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const generation = building.interior.generation;
  return generateBuildingInteriorPlan({ worldId,
    building: { ...building, center: [x, y, terrainHeight(terrain, x, y)], ring },
    entrance: { id: `venue-${building.id}`, position: door,
      outward: [(b[1] - a[1]) / length, -(b[0] - a[0]) / length] },
    seed: generation.seed ?? building.id, levels: generation.levels,
    levelSeeds: generation.levelSeeds, overrides: generation.overrides,
    baseElevation: terrainHeight(terrain, ...door) });
}

/** Replace one stable slot's override without touching other authored levels. */
export function withInteriorOverride(interior, override) {
  const next = structuredClone(interior);
  next.generation.overrides = [...(next.generation.overrides ?? []).filter(item => item.targetId !== override.targetId),
    { ...(next.generation.overrides ?? []).find(item => item.targetId === override.targetId), ...structuredClone(override) }]
    .sort((a, b) => a.targetId.localeCompare(b.targetId));
  return next;
}

/** Reroll one untouched level, retaining the anchor, stable slots and other level seeds. */
export function previewInteriorLevelRegeneration(region, buildingId, levelIndex) {
  const before = previewBuildingInteriorPlan(region, buildingId);
  const level = before.levels[levelIndex];
  if (!level) throw new Error('Choose a generated level.');
  if (level.layers.authoredOverrides.length) throw new Error('This level has authored edits. Regenerate an untouched level.');
  const interior = structuredClone(region.buildings.find(item => item.id === buildingId).interior);
  const generation = interior.generation;
  const current = generation.levelSeeds?.[levelIndex] ?? '';
  const parsed = /^studio-reroll-\d+$/.test(current) ? Number(current.slice(14)) : 0;
  const revision = Number.isSafeInteger(parsed) && parsed < Number.MAX_SAFE_INTEGER - 16 ? parsed : 0;
  // Choose a visibly different palette, not just a new variation hash.
  for (let attempt = 1; attempt <= 16; attempt++) {
    generation.levelSeeds = { ...generation.levelSeeds, [levelIndex]: `studio-reroll-${revision + attempt}` };
    const draft = { ...region, buildings: region.buildings.map(item => item.id === buildingId ? { ...item, interior } : item) };
    const plan = previewBuildingInteriorPlan(draft, buildingId);
    if (plan.levels[levelIndex].layers.finishes[0].material !== level.layers.finishes[0].material) {
      const finish = plan.levels[levelIndex].layers.finishes[0];
      return { interior, plan, changes: [{ id: finish.id, before: level.layers.finishes[0].material, after: finish.material }],
        preservedLevelIds: plan.levels.filter(item => item.index !== levelIndex).map(item => item.id) };
    }
  }
  throw new Error('No different finish was found. The saved level is unchanged.');
}
