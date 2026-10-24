import { createCommonsLayout, commonsCollisionRings, COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { groundSurfaceHeight } from './world-surface.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { validateWorldManifest } from './world-manifest.js';
import { composeCommonsDestination } from '../../shared/commons-destination.js';

export function validateCommonsRegistration(registration, layout) {
  const location = validateWorldManifest(registration).locations.find(item => item.id === layout.id);
  const plaza = layout.surfaces[1].rect;
  const bounds = [layout.edge, plaza[1], plaza[2], plaza[3]];
  if (location?.status !== 'authored' || location.content_revision !== layout.revision
    || !location.translation_m.every(value => value === 0)
    || JSON.stringify(location.bounds_m) !== JSON.stringify(bounds)
    || !location.entries.some(entry => entry.id === 'district-promenade'
      && entry.position_m[0] === layout.edge && entry.position_m[1] === -1335
      && Math.abs(entry.position_m[2] - layout.edgeHeights[6]) < .001)) {
    throw new Error('Commons manifest differs from its authored layout');
  }
  return layout;
}

/** Compose the approved first slice after existing District/gallery/Gardens overlays. */
export function attachEastGardenCommons(world) {
  if (world.eastGardenCommons || world.scene !== 'district' || !world.stores?.some(store=>store.id==='osm-node-8172494977')) throw new Error('Commons needs an unexpanded District');
  const edgeHeights = Array.from({length:13},(_,i)=>groundSurfaceHeight(world,world.bounds_m[2],-(-1338+i*.5)));
  const layout = composeCommonsDestination(createCommonsLayout({districtBounds:world.bounds_m,edgeHeights}));
  validateCommonsRegistration(manifest, layout);
  return {...world,bounds_m:[...layout.bounds],eastGardenCommons:layout,
    collisionPolygons:[...(world.collisionPolygons??[]),...commonsCollisionRings(layout)]};
}

/** Exact inverse for validated content migration; unrelated overlays remain intact. */
export function detachEastGardenCommons(world) {
  const { eastGardenCommons: layout, ...base } = world;
  if (layout?.revision !== COMMONS_REVISION) throw new Error('Unsupported commons revision');
  base.bounds_m = [...layout.districtBounds];
  base.collisionPolygons = world.collisionPolygons.slice(0,-layout.solids.length);
  if (JSON.stringify(attachEastGardenCommons(base)) !== JSON.stringify(world)) throw new Error('Commons differs from its source contract');
  return base;
}
