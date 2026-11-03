import { commonsCollisionRings } from '../../shared/east-garden-commons-layout.js';
import { TERRACES_REVISION } from '../../shared/bayou-terraces-layout.js';
import { composeWoodlandHeights, terracesBaseLayout, WOODLAND_ENTRY, WOODLAND_ID, WOODLAND_REVISION } from '../../shared/woodland-heights.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { validateWorldManifest } from './world-manifest.js';

export function validateWoodlandRegistration(registration, layout) {
  const location = validateWorldManifest(registration).locations.find(item => item.id === WOODLAND_ID);
  const { bounds, entry, revision } = layout.woodland;
  if (location?.status !== 'authored' || location.content_revision !== revision
    || !location.translation_m.every(value => value === 0)
    || JSON.stringify(location.bounds_m) !== JSON.stringify(bounds)
    || !location.adjacent.includes(layout.studewood.id)
    || !location.entries.some(item => item.id === WOODLAND_ENTRY && item.position_m[0] === bounds[0] && item.position_m[1] === entry[1]
      && Math.abs(item.position_m[2] - entry[2]) < .001)) {
    throw new Error('Woodland Heights manifest differs from its authored layout');
  }
  return layout;
}

// Replace three composed fields in place: key order, and so the world fingerprint, stays exact.
const replaced = (world, values) => Object.fromEntries(Object.entries(world).map(([key, value]) => [key, Object.hasOwn(values, key) ? values[key] : value]));

/** Compose Woodland Heights after the Bayou Terraces; walking, ground and collision read the extended layout. */
export function attachWoodlandHeights(world) {
  const terraces = world.eastGardenCommons;
  if (terraces?.revision !== TERRACES_REVISION || terraces.woodland) throw new Error('Woodland Heights needs the composed Bayou Terraces');
  const layout = validateWoodlandRegistration(manifest, composeWoodlandHeights(terraces));
  const added = layout.solids.slice(layout.woodland.solidStart);
  return replaced(world, { bounds_m: [...layout.bounds], eastGardenCommons: layout,
    collisionPolygons: [...world.collisionPolygons, ...commonsCollisionRings({ solids: added })] });
}

/** Exact inverse for validated content migration back to the Bayou Terraces revision. */
export function detachWoodlandHeights(world) {
  const layout = world.eastGardenCommons;
  if (layout?.revision !== WOODLAND_REVISION) throw new Error('Unsupported Woodland Heights revision');
  const terraces = terracesBaseLayout(layout), added = layout.solids.length - layout.woodland.solidStart;
  const base = replaced(world, { bounds_m: [...terraces.bounds], eastGardenCommons: terraces, collisionPolygons: added ? world.collisionPolygons.slice(0, -added) : world.collisionPolygons });
  if (JSON.stringify(attachWoodlandHeights(base)) !== JSON.stringify(world)) throw new Error('Woodland Heights differs from its source contract');
  return base;
}
