import { commonsCollisionRings } from '../../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION } from '../../shared/bayou-heights-layout.js';
import { composeStudewood, heightsBaseLayout, STUDEWOOD_ENTRY, STUDEWOOD_ID, STUDEWOOD_REVISION } from '../../shared/studewood.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { validateWorldManifest } from './world-manifest.js';

export function validateStudewoodRegistration(registration, layout) {
  const location = validateWorldManifest(registration).locations.find(item => item.id === STUDEWOOD_ID);
  const { bounds, entry, revision } = layout.studewood;
  if (location?.status !== 'authored' || location.content_revision !== revision
    || !location.translation_m.every(value => value === 0)
    || JSON.stringify(location.bounds_m) !== JSON.stringify(bounds)
    || !location.adjacent.includes(layout.heights.id)
    || !location.entries.some(item => item.id === STUDEWOOD_ENTRY && item.position_m[0] === bounds[0] && item.position_m[1] === entry[1]
      && Math.abs(item.position_m[2] - entry[2]) < .001)) {
    throw new Error('Studewood manifest differs from its authored layout');
  }
  return layout;
}

// Replace three composed fields in place: key order, and so the world fingerprint, stays exact.
const replaced = (world, values) => Object.fromEntries(Object.entries(world).map(([key, value]) => [key, Object.hasOwn(values, key) ? values[key] : value]));

/** Compose Studewood after Bayou Heights; walking, ground and collision read the extended layout. */
export function attachStudewood(world) {
  const heights = world.eastGardenCommons;
  if (heights?.revision !== HEIGHTS_REVISION || heights.studewood) throw new Error('Studewood needs the composed Bayou Heights');
  const layout = validateStudewoodRegistration(manifest, composeStudewood(heights));
  const added = layout.solids.slice(layout.studewood.solidStart);
  return replaced(world, { bounds_m: [...layout.bounds], eastGardenCommons: layout,
    collisionPolygons: [...world.collisionPolygons, ...commonsCollisionRings({ solids: added })] });
}

/** Exact inverse for validated content migration back to the Heights revision. */
export function detachStudewood(world) {
  const layout = world.eastGardenCommons;
  if (layout?.revision !== STUDEWOOD_REVISION) throw new Error('Unsupported Studewood revision');
  const heights = heightsBaseLayout(layout), added = layout.solids.length - layout.studewood.solidStart;
  const base = replaced(world, { bounds_m: [...heights.bounds], eastGardenCommons: heights, collisionPolygons: added ? world.collisionPolygons.slice(0, -added) : world.collisionPolygons });
  if (JSON.stringify(attachStudewood(base)) !== JSON.stringify(world)) throw new Error('Studewood differs from its source contract');
  return base;
}
