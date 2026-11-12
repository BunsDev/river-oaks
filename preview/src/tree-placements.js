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
// The main Ribbon spine (#740, 11-04 closeout; Val's goal: bounded moves that keep IDs). Each pit
// that stood in the 2.4 m walk or under a post moves the least distance that clears the walk, every
// post and every other site zone (docs/design/five-rooms/spine-boundary.md). Trees are never added
// or removed here, so tree-<index> and tree-pit-<index> keep their meaning. These are design
// corrections, not surveys: district-vegetation.json keeps the LiDAR positions and branch ends.
const SPINE_LANE = 'osm-way-583333526-0';
// The canopy top is 4.0 m (3.6 m clear + 0.4 m slab). `lift` is the crown underside over the walk;
// ribbon-crown-clearance.js makes the drawn crown honour it, at every level of detail.
const SPINE_CROWN = 4.05;
const spineCorrections = new Map([
  ['-2759,-1205', { position: [-2759.8, -1205] }], // tree-28, pit 27
  ['-2761,-1263', { lift: SPINE_CROWN }], // tree-37: its pit was already clear
  ['-2761,-1273', { position: [-2761.05, -1272.75], lift: SPINE_CROWN }], // tree-77, pit 76
  ['-2759,-1199', { position: [-2759.7, -1198.85], lift: SPINE_CROWN }], // tree-84, pit 83
  ['-2759,-1257', { position: [-2760.8, -1257], lift: SPINE_CROWN }], // tree-85, pit 84
  ['-2761,-1279', { position: [-2761.15, -1278.65], lift: SPINE_CROWN }], // tree-104, pit 103
  ['-2759,-1219', { position: [-2760.15, -1219], lift: SPINE_CROWN }], // tree-127, pit 126
  ['-2759,-1251', { position: [-2760.7, -1251.85], lift: SPINE_CROWN }], // tree-153, pit 152
  ['-2757,-1267', { position: [-2756.9, -1266.9] }], // tree-172, pit 171
]);
function spineCorrected(tree, { position = tree.position, lift = 0 }) {
  const dx = position[0] - tree.position[0], dy = position[1] - tree.position[1];
  const endpoints = (tree.endpoints ?? []).map(([x, y, z]) => [x + dx, y + dy, Math.max(z, lift)]);
  // Keyed lookups by stem no longer find a moved tree, so it carries its own crown base.
  return { ...tree, position, endpoints, crownBase: Math.min(...endpoints.map(point => point[2])), spineCorrection: true };
}
const cache = new WeakMap();
export function treeSupports(world) {
  const source = world?.vegetation?.branch_supports?.length ? world.vegetation.branch_supports : world?.trees ?? [];
  const hopdoddy=world?.buildings?.some(building=>building.id==='osm-way-625333009');
  const winston=world?.stores?.some(store=>store.name==='Harry Winston' && store.building_id==='osm-way-625330792');
  const spine=world?.roads?.some(road=>road.id===SPINE_LANE);
  if (!hopdoddy && !winston && !spine) return source;
  if (cache.has(world)) return cache.get(world);
  const result = source.flatMap(tree => {
    const key = tree.position.join(',');
    if (spine && spineCorrections.has(key)) return [spineCorrected(tree, spineCorrections.get(key))];
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
