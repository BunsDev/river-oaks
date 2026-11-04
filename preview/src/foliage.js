import { buildMatureTrees, matureTreePlacements, TREE_SHADOW_TILE_M } from './landscape-models.js';

export function buildObservedFoliage(world) {
  return buildMatureTrees(world, matureTreePlacements(world), { shadowTile: TREE_SHADOW_TILE_M });
}

// Mapped tree positions; branch, crown and leaf forms are explicitly interpreted.
export function buildFoliage(world) {
  return buildMatureTrees(world, matureTreePlacements(world), { shadowTile: TREE_SHADOW_TILE_M });
}
