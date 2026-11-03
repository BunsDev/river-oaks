import { commonsCollisionRings } from '../../shared/east-garden-commons-layout.js';
import { STUDEWOOD_REVISION } from '../../shared/studewood-layout.js';
import { composeBayouTerraces, studewoodBaseLayout, TERRACE_ENTRIES, TERRACE_LOCATIONS, TERRACES_REVISION } from '../../shared/bayou-terraces.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { validateWorldManifest } from './world-manifest.js';

export function validateTerracesRegistration(registration, layout) {
  const locations = validateWorldManifest(registration).locations, { bounds, entries, revision } = layout.terraces;
  for (const [index, id] of TERRACE_LOCATIONS.entries()) {
    const location = locations.find(item => item.id === id), entry = entries[index];
    if (location?.status !== 'authored' || location.content_revision !== revision
      || !location.translation_m.every(value => value === 0)
      || JSON.stringify(location.bounds_m) !== JSON.stringify(bounds[index])
      || !location.adjacent.includes(layout.heights.id)
      || !location.entries.some(item => item.id === TERRACE_ENTRIES[id] && item.position_m[0] === bounds[index][2] && item.position_m[1] === entry[1]
        && Math.abs(item.position_m[2] - entry[2]) < .001)) {
      throw new Error('Bayou Terraces manifest differs from its authored layout');
    }
  }
  return layout;
}

// Replace three composed fields in place: key order, and so the world fingerprint, stays exact.
const replaced = (world, values) => Object.fromEntries(Object.entries(world).map(([key, value]) => [key, Object.hasOwn(values, key) ? values[key] : value]));

/** Compose the Bayou Terraces after Studewood; walking, ground and collision read the extended layout. */
export function attachBayouTerraces(world) {
  const studewood = world.eastGardenCommons;
  if (studewood?.revision !== STUDEWOOD_REVISION || studewood.terraces) throw new Error('The Bayou Terraces need the composed Studewood');
  const layout = validateTerracesRegistration(manifest, composeBayouTerraces(studewood));
  const added = layout.solids.slice(layout.terraces.solidStart);
  return replaced(world, { bounds_m: [...layout.bounds], eastGardenCommons: layout,
    collisionPolygons: [...world.collisionPolygons, ...commonsCollisionRings({ solids: added })] });
}

/** Exact inverse for validated content migration back to the Studewood revision. */
export function detachBayouTerraces(world) {
  const layout = world.eastGardenCommons;
  if (layout?.revision !== TERRACES_REVISION) throw new Error('Unsupported Bayou Terraces revision');
  const studewood = studewoodBaseLayout(layout), added = layout.solids.length - layout.terraces.solidStart;
  const base = replaced(world, { bounds_m: [...studewood.bounds], eastGardenCommons: studewood, collisionPolygons: added ? world.collisionPolygons.slice(0, -added) : world.collisionPolygons });
  if (JSON.stringify(attachBayouTerraces(base)) !== JSON.stringify(world)) throw new Error('Bayou Terraces differ from their source contract');
  return base;
}
