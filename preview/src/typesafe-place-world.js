import { commonsCollisionRings } from '../../shared/east-garden-commons-layout.js';
import { WOODLAND_REVISION } from '../../shared/woodland-heights-layout.js';
import { composeTypeSafePlace, woodlandBaseLayout, TYPESAFE_ENTRY, TYPESAFE_ID, TYPESAFE_REVISION } from '../../shared/typesafe-place.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { validateWorldManifest } from './world-manifest.js';

export function validateTypeSafeRegistration(registration, layout) {
  const location = validateWorldManifest(registration).locations.find(item => item.id === TYPESAFE_ID);
  const { bounds, entry, revision } = layout.typesafe;
  if (location?.status !== 'authored' || location.content_revision !== revision
    || !location.translation_m.every(value => value === 0)
    || JSON.stringify(location.bounds_m) !== JSON.stringify(bounds)
    || !location.adjacent.includes(layout.woodland.id)
    || !location.entries.some(item => item.id === TYPESAFE_ENTRY && item.position_m[0] === bounds[0] && item.position_m[1] === entry[1]
      && Math.abs(item.position_m[2] - entry[2]) < .001)) {
    throw new Error('TypeSafe Place manifest differs from its authored layout');
  }
  return layout;
}

// Replace three composed fields in place: key order, and so the world fingerprint, stays exact.
const replaced = (world, values) => Object.fromEntries(Object.entries(world).map(([key, value]) => [key, Object.hasOwn(values, key) ? values[key] : value]));

/** Compose TypeSafe Place after Woodland Heights; walking, ground and collision read the extended layout. */
export function attachTypeSafePlace(world) {
  const woodland = world.eastGardenCommons;
  if (woodland?.revision !== WOODLAND_REVISION || woodland.typesafe) throw new Error('TypeSafe Place needs the composed Woodland Heights');
  const layout = validateTypeSafeRegistration(manifest, composeTypeSafePlace(woodland));
  const added = layout.solids.slice(layout.typesafe.solidStart);
  // Composed solids' rings close the collision list in solid order: Woodland's opened hedges leave it too.
  const first = world.collisionPolygons.length - woodland.solids.length, rings = [...world.collisionPolygons];
  for (const { index, solid } of [...layout.typesafe.openings].reverse()) {
    if (JSON.stringify(rings[first + index]) !== JSON.stringify(commonsCollisionRings({ solids: [solid] })[0])) throw new Error('TypeSafe Place could not open a Woodland street end');
    rings.splice(first + index, 1);
  }
  return replaced(world, { bounds_m: [...layout.bounds], eastGardenCommons: layout,
    collisionPolygons: [...rings, ...commonsCollisionRings({ solids: added })] });
}

/** Exact inverse for validated content migration back to the Woodland Heights revision. */
export function detachTypeSafePlace(world) {
  const layout = world.eastGardenCommons;
  if (layout?.revision !== TYPESAFE_REVISION) throw new Error('Unsupported TypeSafe Place revision');
  const woodland = woodlandBaseLayout(layout), added = layout.solids.length - layout.typesafe.solidStart;
  const rings = added ? world.collisionPolygons.slice(0, -added) : [...world.collisionPolygons], first = rings.length - layout.typesafe.solidStart;
  for (const { index, solid } of layout.typesafe.openings) rings.splice(first + index, 0, commonsCollisionRings({ solids: [solid] })[0]);
  const base = replaced(world, { bounds_m: [...woodland.bounds], eastGardenCommons: woodland, collisionPolygons: rings });
  if (JSON.stringify(attachTypeSafePlace(base)) !== JSON.stringify(world)) throw new Error('TypeSafe Place differs from its source contract');
  return base;
}
