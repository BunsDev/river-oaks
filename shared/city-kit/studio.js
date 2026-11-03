// A city-kit plan as a World Studio region (#585 follow-through, increment 3).
// Studio opens schema-v1 creator regions (preview/src/region-draft.js validates
// them; server/region-package.js publishes them). This writes a built plan in
// that form so a designer can open it with **Open JSON**, see its streets,
// massing, trees and places on the map, walk through it, and mark places
// without touching the recipe. It is a review view, not a second source:
// Studio's boxes stand in for the kit's facades, and edits made in Studio go
// back into the recipe as overrides by stable piece ID, never into this file.
import { KIT_CONVENTIONS } from './catalog.js';

const mm = value => Math.round(value * 1000) / 1000;
const fail = reason => { throw new Error(`Studio region: ${reason}`); };
const slug = text => String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const label = text => { const value = String(text).trim().replace(/[\x00-\x1f\x7f‪-‮⁦-⁩]/gu, ''); return [...value].slice(0, 64).join('') || 'Untitled'; };
const centre = rect => [mm((rect[0] + rect[2]) / 2), mm((rect[1] + rect[3]) / 2)];

// Studio's limits, repeated here so the exporter refuses with the reason instead of writing a file Studio rejects.
export const STUDIO_LIMITS = Object.freeze({ site: [40, 512], roads: 64, buildings: 80, trees: 256, places: [4, 64], parcels: 32, segments: 256, roadMetres: 8192, bytes: 128 * 1024,
  footway: [2, 8], residential: [6, 16], building: { side: [4, 80], height: [5.5, 50] }, tree: { height: [2, 35], crown: [0.5, 10] } });

// `recipe` supplies the streets and plazas the plan was built from; `plan` is assembleNeighborhood's output.
// The region's bounds pad the site by `margin` metres, because Studio keeps every
// building, road point and place 1 m inside its bounds while kit shells stand flush
// with the site edge.
export function studioRegion(recipe, plan, { title = null, spawn = null, margin = 2 } = {}) {
  const [west, south, east, north] = plan.site.map((value, i) => mm(i < 2 ? value - margin : value + margin)), width = east - west, height = north - south;
  for (const span of [width, height]) if (span < STUDIO_LIMITS.site[0] || span > STUDIO_LIMITS.site[1]) fail(`the region must span ${STUDIO_LIMITS.site[0]}–${STUDIO_LIMITS.site[1]} m each way (${width} × ${height} with the ${margin} m margin)`);
  const ids = new Set();
  const id = (text, fallback) => { let base = slug(text) || fallback, value = base, n = 1; while (ids.has(value)) value = `${base}-${++n}`; ids.add(value); return value; };
  const inside = ([x, y], margin = 1) => x >= west + margin && x <= east - margin && y >= south + margin && y <= north - margin;
  // Streets: one road each, the lane width within Studio's range for its kind. Kit streets are straight.
  const roads = (recipe.streets ?? []).map(street => {
    const kind = street.lane >= STUDIO_LIMITS.residential[0] ? 'residential' : 'footway', range = STUDIO_LIMITS[kind];
    const clip = ([x, y]) => [mm(Math.min(east - 1, Math.max(west + 1, x))), mm(Math.min(north - 1, Math.max(south + 1, y)))];
    return { id: id(street.id, 'street'), name: label(street.name ?? street.id.replace(/-/g, ' ')), kind, width_m: mm(Math.min(range[1], Math.max(range[0], street.lane))), points: [clip(street.from), clip(street.to)] };
  });
  if (roads.length < 1) fail('a region needs at least one street');
  if (roads.length > STUDIO_LIMITS.roads) fail(`${roads.length} streets exceed Studio's ${STUDIO_LIMITS.roads}`);
  // Buildings: each shell as a box of its footprint and height, 1 m inside the bounds as Studio requires.
  // Studio boxes are at least 4 m a side; thinner kit pieces (rear wings) are listed as omitted, never widened.
  // Context massings are the neighbours' buildings; they show when they fit inside the region and are left out otherwise.
  const [low, high] = STUDIO_LIMITS.building.side, omitted = [];
  const shells = plan.pieces.filter(piece => piece.piece.startsWith('building/')).filter(piece => {
    const thin = piece.rect[2] - piece.rect[0] < low || piece.rect[3] - piece.rect[1] < low;
    const outside = piece.piece === 'building/context' && !(inside([piece.rect[0], piece.rect[1]]) && inside([piece.rect[2], piece.rect[3]]));
    if (thin || outside) omitted.push({ id: piece.id, size: [mm(piece.rect[2] - piece.rect[0]), mm(piece.rect[3] - piece.rect[1])], reason: thin ? `under ${low} m a side` : 'context beyond the region' });
    return !thin && !outside;
  });
  if (shells.length > STUDIO_LIMITS.buildings) fail(`${shells.length} buildings exceed Studio's ${STUDIO_LIMITS.buildings}; split the recipe`);
  const buildings = shells.map(piece => {
    const size = [mm(piece.rect[2] - piece.rect[0]), mm(piece.rect[3] - piece.rect[1]), mm(piece.height ?? KIT_CONVENTIONS.storey.ground)];
    if (size[0] > high || size[1] > high) fail(`${piece.id} is ${size[0]} × ${size[1]} m; Studio boxes are at most ${high} m a side`);
    size[2] = Math.min(STUDIO_LIMITS.building.height[1], Math.max(STUDIO_LIMITS.building.height[0], size[2]));
    const at = centre(piece.rect);
    if (!inside([piece.rect[0], piece.rect[1]]) || !inside([piece.rect[2], piece.rect[3]])) fail(`${piece.id} touches the site edge; Studio keeps buildings 1 m inside`);
    return { id: id(piece.id.split('/').slice(1).join('-'), 'building'), center: at, size, yaw_deg: 0, kind: piece.style?.includes('court') || piece.style?.includes('luxe') ? 'residential' : 'retail' };
  });
  // Trees: street and plaza trees with their crowns.
  const trees = plan.pieces.filter(piece => piece.piece === 'landscape/street-tree').filter(piece => inside(piece.at)).map(piece => ({
    id: id(piece.id.split('/').slice(1).join('-'), 'tree'), position: [mm(piece.at[0]), mm(piece.at[1])],
    height_m: mm(Math.min(STUDIO_LIMITS.tree.height[1], Math.max(STUDIO_LIMITS.tree.height[0], piece.height ?? 8))), crown_radius_m: mm(Math.min(STUDIO_LIMITS.tree.crown[1], Math.max(STUDIO_LIMITS.tree.crown[0], piece.radius ?? 3))) }));
  if (trees.length > STUDIO_LIMITS.trees) fail(`${trees.length} trees exceed Studio's ${STUDIO_LIMITS.trees}`);
  // Places: landmarks by name, plazas by id, then streets, so a map has at least four marks to review by.
  const places = [];
  const place = (text, name, at) => { if (inside(at)) places.push({ id: id(text, 'place'), name: label(name), position: [mm(at[0]), mm(at[1])] }); };
  for (const piece of plan.pieces.filter(piece => piece.piece.startsWith('landmark/'))) place(piece.id.split('/').slice(1).join('-'), piece.name ?? piece.id, piece.at);
  for (const plaza of recipe.plazas ?? []) place(plaza.id, plaza.name ?? plaza.id.replace(/-/g, ' '), centre(plaza.rect));
  // A street's place stands a quarter of the way along it, so two crossing streets do not mark the same spot.
  for (const street of recipe.streets ?? []) place(`${street.id}-street`, street.name ?? street.id.replace(/-/g, ' '), [street.from[0] + (street.to[0] - street.from[0]) / 4, street.from[1] + (street.to[1] - street.from[1]) / 4]);
  const blocks = [...(recipe.blocks ?? []), ...(plan.provenance?.layout?.blocks ?? [])];
  for (const block of blocks) if (places.length < STUDIO_LIMITS.places[0]) place(`${block.id}-block-place`, block.id.replace(/-/g, ' '), centre(block.rect));
  for (const surface of plan.surfaces ?? []) if (places.length < STUDIO_LIMITS.places[0]) place(`${surface.id.split('/').slice(1).join('-')}-ground`, surface.id.split('/').slice(1).join(' ').replace(/-/g, ' '), centre(surface.rect));
  if (places.length < STUDIO_LIMITS.places[0]) fail(`Studio needs ${STUDIO_LIMITS.places[0]} places; this plan offers ${places.length} (landmarks, plazas, streets, blocks, ground)`);
  places.length = Math.min(places.length, STUDIO_LIMITS.places[1]);
  // Parcels: the blocks, authored and derived, as named ground.
  const parcels = blocks.filter(block => block.rect[2] - block.rect[0] >= 6 && block.rect[3] - block.rect[1] >= 6 && inside([block.rect[0], block.rect[1]]) && inside([block.rect[2], block.rect[3]]))
    .map(block => ({ id: id(`${block.id}-block`, 'block'), name: label(block.id.replace(/-/g, ' ')), bounds_m: block.rect.map(mm) }));
  if (parcels.length > STUDIO_LIMITS.parcels) fail(`${parcels.length} blocks exceed Studio's ${STUDIO_LIMITS.parcels} parcels`);
  // Arrival: a given spawn, else the middle of the widest street's first sidewalk edge, clear of every box.
  const arrival = spawn ?? sidewalkSpawn(recipe, plan.site);
  if (!inside(arrival)) fail(`the arrival ${arrival.join(',')} is not 1 m inside the site`);
  for (const building of buildings) {
    const dx = Math.abs(arrival[0] - building.center[0]), dy = Math.abs(arrival[1] - building.center[1]);
    if (dx < building.size[0] / 2 + 0.35 && dy < building.size[1] / 2 + 0.35) fail(`the arrival ${arrival.join(',')} stands inside ${building.id}`);
  }
  const region = {
    schema_version: 1, bounds_m: [west, south, east, north],
    terrain: { width: 5, height: 5, heights_m: new Array(25).fill(0) },
    spawn: arrival.map(mm), roads, buildings, trees, parcels, places,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(region)).length;
  if (bytes > STUDIO_LIMITS.bytes) fail(`${bytes} bytes exceed Studio's ${STUDIO_LIMITS.bytes}`);
  return { region, title: label(title ?? plan.id), bytes, omitted, summary: { roads: roads.length, buildings: buildings.length, omitted: omitted.length, trees: trees.length, places: places.length, parcels: parcels.length, spawn: region.spawn } };
}

// The widest street's sidewalk, a quarter of the way along, just outside its lane: kit sidewalks are walkable ground.
function sidewalkSpawn(recipe, site) {
  const streets = [...(recipe.streets ?? [])].sort((a, b) => b.lane - a.lane || (a.id < b.id ? -1 : 1));
  if (!streets.length) fail('no street for an arrival');
  const street = streets[0], eastRunning = street.from[1] === street.to[1];
  const along = eastRunning ? [street.from[0], street.to[0]] : [street.from[1], street.to[1]], across = eastRunning ? street.from[1] : street.from[0];
  const offset = across + street.lane / 2 + street.sidewalk / 2, position = Math.min(along[0], along[1]) + Math.abs(along[1] - along[0]) / 4;
  const spawn = eastRunning ? [position, offset] : [offset, position];
  return [Math.min(site[2] - 1.5, Math.max(site[0] + 1.5, spawn[0])), Math.min(site[3] - 1.5, Math.max(site[1] + 1.5, spawn[1]))];
}
