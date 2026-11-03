import { commonsCollisionRings, COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { composeBayouHeights, commonsBaseLayout, HEIGHTS_ENTRY, HEIGHTS_ID, HEIGHTS_REVISION } from '../../shared/bayou-heights.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { validateWorldManifest } from './world-manifest.js';

export function validateHeightsRegistration(registration, layout) {
  const location = validateWorldManifest(registration).locations.find(item => item.id === HEIGHTS_ID);
  const { bounds, entry, revision } = layout.heights;
  if (location?.status !== 'authored' || location.content_revision !== revision
    || !location.translation_m.every(value => value === 0)
    || JSON.stringify(location.bounds_m) !== JSON.stringify(bounds)
    || !location.adjacent.includes(layout.id)
    || !location.entries.some(item => item.id === HEIGHTS_ENTRY && item.position_m[0] === entry[0] && item.position_m[1] === entry[1]
      && Math.abs(item.position_m[2] - entry[2]) < .001)) {
    throw new Error('Bayou Heights manifest differs from its authored layout');
  }
  return layout;
}

// Replace three composed fields in place: key order, and so the world fingerprint, stays exact.
const replaced = (world, values) => Object.fromEntries(Object.entries(world).map(([key, value]) => [key, Object.hasOwn(values, key) ? values[key] : value]));

/** Compose Bayou Heights after the Commons overlay; walking, ground and collision read the extended Commons layout. */
export function attachBayouHeights(world) {
  const commons = world.eastGardenCommons;
  if (commons?.revision !== COMMONS_REVISION || commons.heights) throw new Error('Bayou Heights needs the composed Commons');
  const layout = validateHeightsRegistration(manifest, composeBayouHeights(commons));
  const added = layout.solids.slice(layout.heights.solidStart);
  return replaced(world, { bounds_m: [...layout.bounds], eastGardenCommons: layout,
    collisionPolygons: [...world.collisionPolygons, ...commonsCollisionRings({ solids: added })] });
}

/** Exact inverse for validated content migration back to the Commons revision. */
export function detachBayouHeights(world) {
  const layout = world.eastGardenCommons;
  if (layout?.revision !== HEIGHTS_REVISION) throw new Error('Unsupported Bayou Heights revision');
  const commons = commonsBaseLayout(layout), added = layout.solids.length - layout.heights.solidStart;
  const base = replaced(world, { bounds_m: [...commons.bounds], eastGardenCommons: commons, collisionPolygons: world.collisionPolygons.slice(0, -added) });
  if (JSON.stringify(attachBayouHeights(base)) !== JSON.stringify(world)) throw new Error('Bayou Heights differs from its source contract');
  return base;
}
