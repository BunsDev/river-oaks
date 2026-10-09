// Photo-based corrections for Hopdoddy's south frontage, June 2024 Street View
// (user screenshot 2026-10-08 12.48.26). Coordinates are local east/north metres,
// fitted to the mapped facade and curb, NOT surveyed trunk positions. Keep the
// original LiDAR interpretations intact and use this selector for every consumer.
const corrections = new Map([
  ['-2803,-1233', { id: 'hopdoddy-west', position: [-2800, -1224.7], height_m: 7.5, radius_m: 2.1 }],
  ['-2795,-1233', { id: 'hopdoddy-middle', position: [-2790, -1224.9], height_m: 7.5, radius_m: 2.1 }],
  ['-2781,-1233', { id: 'hopdoddy-corner', position: [-2777.5, -1225.1], height_m: 10, radius_m: 3.2 }],
  ['-2787,-1233', null], // Duplicate inferred canopy support between the pictured stems.
]);
const cache = new WeakMap();
export function treeSupports(world) {
  const source = world?.vegetation?.branch_supports?.length ? world.vegetation.branch_supports : world?.trees ?? [];
  const hopdoddy=world?.buildings?.some(building=>building.id==='osm-way-625333009');
  const winston=world?.stores?.some(store=>store.name==='Harry Winston' && store.building_id==='osm-way-625330792');
  if (!hopdoddy && !winston) return source;
  if (cache.has(world)) return cache.get(world);
  const result = source.flatMap(tree => {
    const key = tree.position.join(',');
    if (winston) {
      // 2025 Street View and the official 2016 exterior: one larger right-hand
      // tree, left tree beyond the windows. This middle support is an inferred
      // canopy duplicate, not an OSM survey tree. Preserve the source records.
      if (key==='-2761,-1355') return [];
      if (key==='-2761,-1365') return [{...tree,id:'winston-south',height_m:12,radius_m:2.6,referencePlacement:true,endpoints:[],basis:'REF-HW-01/02 photo-estimated crown; original inferred stem retained'}];
    }
    if (!hopdoddy || !corrections.has(key)) return [tree];
    const replacement = corrections.get(key);
    return replacement ? [{ ...tree, ...replacement, basis: 'Street View placement estimate, June 2024', referencePlacement: true, endpoints: [] }] : [];
  });
  cache.set(world, result);
  return result;
}
