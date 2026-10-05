import { buildMatureTrees } from './landscape-models.js';

export function buildObservedFoliage(world) {
  return buildMatureTrees(world);
}

// Mapped tree positions; branch, crown and leaf forms are explicitly interpreted.
export function buildFoliage(world) {
  return buildMatureTrees(world);
}
