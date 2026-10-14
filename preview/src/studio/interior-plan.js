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
    baseElevation: terrainHeight(terrain, ...door) });
}
