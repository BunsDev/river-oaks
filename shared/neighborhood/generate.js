import { STREET } from '../../preview/src/street-profile.js';
import { hash, order, round, overlaps } from './format.js';
import { normalizeReference, generateReferenceNeighborhood } from './reference.js';
import {normalizeArchitecture,architectureFor} from './architecture.js';

const record = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const finite = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
const id = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,11}$/.test(value);
const text = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 200 && !/[\x00-\x1f]/.test(value);
const bounds = value => Array.isArray(value) && value.length === 4 && value.every(x => finite(x, -10000, 10000)) && value[2] > value[0] && value[3] > value[1];
const invalid = message => { throw new Error(`Invalid neighborhood recipe: ${message}`); };

export function normalizeRecipe(input) {
  if (!keys(input, ['schema_version', 'id', 'title', 'seed', 'frame', 'bounds_m', 'spawn', 'streets', 'constraints', 'templates', 'reserved', 'reference', 'architecture'])
    || input.schema_version !== 1 || typeof input.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(input.id) || !text(input.title) || input.title.length > 64 || !text(input.seed)
    || !bounds(input.bounds_m)) invalid('version, identity, seed or bounds');
  const [w, s, e, n] = input.bounds_m;
  if (input.spawn !== undefined && (!Array.isArray(input.spawn) || input.spawn.length !== 2
    || !finite(input.spawn[0],w+1,e-1) || !finite(input.spawn[1],s+1,n-1))) invalid('arrival spawn must be an east/north pair at least 1 m inside the bounds');
  if (![e - w, n - s].every(size => finite(size, 40, 512))) invalid('region must span 40–512 metres');
  const f = input.frame;
  if (!keys(f, ['crs', 'origin', 'source']) || !['LOCAL:METRES', 'EPSG:32615'].includes(f.crs)
    || !text(f.source) || !Array.isArray(f.origin) || f.origin.length !== 2
    || !finite(f.origin[0], -180, 180) || !finite(f.origin[1], -90, 90)) invalid('explicit coordinate frame and source required');
  const c = input.constraints;
  if (!keys(c, ['frontage_m', 'setback_m', 'max_coverage', 'max_height_m'])
    || !finite(c.frontage_m, 12, 80) || !finite(c.setback_m, 1, 15)
    || !finite(c.max_coverage, .1, .8) || !finite(c.max_height_m, 5.5, 50)) invalid('art constraints');
  if (!Array.isArray(input.streets) || input.streets.length > 12 || (input.reference ? input.streets.length !== 0 : input.streets.length < 4)) invalid('street budget: 4–12 guides, or an empty list with geographic references');
  const ids = new Set();
  for (const street of input.streets) {
    if (!keys(street, ['id', 'axis', 'at_m', 'width_m']) || !id(street.id) || ids.has(street.id)
      || !['north', 'east'].includes(street.axis) || !finite(street.width_m, 8.4, 16)) invalid('street identity, axis or width');
    const margin = street.width_m / 2 + STREET.sidewalkWidth + STREET.curbWidth + 1;
    if (!finite(street.at_m, (street.axis === 'north' ? w : s) + margin, (street.axis === 'north' ? e : n) - margin)) invalid(`street ${street.id} exceeds bounds`);
    ids.add(street.id);
  }
  for (const axis of input.reference ? [] : ['north', 'east']) {
    const streets = input.streets.filter(item => item.axis === axis).sort((a, b) => a.at_m - b.at_m);
    if (streets.length < 2 || streets.some((item, i) => i && item.at_m <= streets[i - 1].at_m)) invalid('two distinct streets required per axis');
  }
  if (!Array.isArray(input.templates) || input.templates.length < 1 || input.templates.length > 32) invalid('template budget: 1–32');
  ids.clear();
  for (const template of input.templates) {
    if (!keys(template, ['id', 'kind', 'size']) || !id(template.id) || ids.has(template.id)
      || !['retail', 'residential', 'parking'].includes(template.kind) || !Array.isArray(template.size) || template.size.length !== 3
      || !template.size.slice(0, 2).every(size => finite(size, 4, 80)) || !finite(template.size[2], 5.5, c.max_height_m)) invalid('template size, height or identity');
    ids.add(template.id);
  }
  if (!Array.isArray(input.reserved) || input.reserved.length > 32) invalid('reserved-area budget');
  ids.clear();
  for (const area of input.reserved) {
    if (!keys(area, ['id', 'bounds_m', 'reason']) || !id(area.id) || ids.has(area.id) || !text(area.reason)
      || !bounds(area.bounds_m) || area.bounds_m[0] < w || area.bounds_m[1] < s || area.bounds_m[2] > e || area.bounds_m[3] > n) invalid('reserved area');
    ids.add(area.id);
  }
  const recipe = {...structuredClone(input), streets: structuredClone(input.streets).sort(order), templates: structuredClone(input.templates).sort(order), reserved: structuredClone(input.reserved).sort(order)};
  if(recipe.architecture)recipe.architecture=normalizeArchitecture(recipe.architecture,recipe.templates);
  if (recipe.reference) recipe.reference = normalizeReference(recipe);
  return recipe;
}

/** Generate a bounded authored lattice; never modifies input, existing world data or files. */
export function generateNeighborhood(input) {
  const recipe = normalizeRecipe(input), [w, s, e, n] = recipe.bounds_m, c = recipe.constraints;
  if (recipe.reference) return generateReferenceNeighborhood(recipe);
  const vertical = recipe.streets.filter(x => x.axis === 'north').sort((a, b) => a.at_m - b.at_m);
  const horizontal = recipe.streets.filter(x => x.axis === 'east').sort((a, b) => a.at_m - b.at_m);
  const region = {schema_version: 1, bounds_m: [...recipe.bounds_m], terrain: {width: 5, height: 5, heights_m: Array(25).fill(0)},
    spawn: recipe.spawn ? [...recipe.spawn] : [w + 2, s + 2], roads: [], parcels: [], buildings: [], trees: [], places: []};
  for (const street of recipe.streets) {
    const north = street.axis === 'north', cross = north ? horizontal : vertical;
    const margin = street.width_m / 2 + STREET.sidewalkWidth + STREET.curbWidth;
    const corridor = north ? [street.at_m - margin, cross[0].at_m - margin, street.at_m + margin, cross.at(-1).at_m + margin]
      : [cross[0].at_m - margin, street.at_m - margin, cross.at(-1).at_m + margin, street.at_m + margin];
    const conflict = recipe.reserved.find(area => overlaps(corridor, area.bounds_m));
    if (conflict) invalid(`road ${street.id} conflicts with reserved area ${conflict.id}`);
    region.roads.push({id: `road-${street.id}`, name: street.id, kind: 'residential', width_m: street.width_m,
      points: cross.map(other => north ? [street.at_m, other.at_m] : [other.at_m, street.at_m])});
  }
  const blocks = [], placements = [], diagnostics = [];
  const edge = street => street.width_m / 2 + STREET.sidewalkWidth + STREET.curbWidth;
  for (let x = 0; x < vertical.length - 1; x++) for (let y = 0; y < horizontal.length - 1; y++) {
    const left = vertical[x], right = vertical[x + 1], bottom = horizontal[y], top = horizontal[y + 1];
    const block = {id: `b-${left.id}-${bottom.id}`, bounds_m: [left.at_m + edge(left), bottom.at_m + edge(bottom), right.at_m - edge(right), top.at_m - edge(top)].map(round),
      roadIds: [left, right, bottom, top].map(item => `road-${item.id}`)};
    const [bw, bs, be, bn] = block.bounds_m, width = be - bw, depth = (bn - bs) / 2;
    if (width < c.frontage_m || depth < 6 + 2 * c.setback_m) invalid(`block ${block.id} cannot fit frontage/depth and setbacks`);
    const columns = Math.floor(width / c.frontage_m), frontage = width / columns;
    blocks.push(block);
    if (blocks.length > 16) invalid('block budget: 16');
    for (const row of [0, 1]) for (let column = 0; column < columns; column++) {
      const parcel = {id: `p-${left.id}-${bottom.id}-${row}-${column}`, name: `Parcel ${left.id} ${bottom.id} ${row + 1}.${column + 1}`,
        bounds_m: [bw + column * frontage, bs + row * depth, bw + (column + 1) * frontage, bs + (row + 1) * depth].map(round)};
      const reserved = recipe.reserved.find(area => overlaps(area.bounds_m, parcel.bounds_m));
      if (reserved) { diagnostics.push({severity: 'info', code: 'reserved', id: parcel.id, message: `Retained empty for ${reserved.id}: ${reserved.reason}`}); continue; }
      if (region.parcels.length >= 32) invalid('parcel budget: 32; increase frontage or reduce streets');
      region.parcels.push(parcel);
      const candidates = recipe.templates.filter(template => template.size[0] <= frontage - 2 * c.setback_m
        && template.size[1] <= depth - 2 * c.setback_m && template.size[0] * template.size[1] <= frontage * depth * c.max_coverage);
      if (!candidates.length) invalid(`parcel ${parcel.id} cannot fit any template within setbacks and coverage`);
      const buildingId = `h-${left.id}-${bottom.id}-${row}-${column}`;
      const choice = parseInt(hash([recipe.seed, buildingId]).slice(0, 8), 16) % candidates.length;
      const template = candidates[choice];
      region.buildings.push({id: buildingId, kind: template.kind, size: [...template.size], yaw_deg: 0,
        center: [round(bw + (column + .5) * frontage), round(row ? bn - c.setback_m - template.size[1] / 2 : bs + c.setback_m + template.size[1] / 2)]});
      placements.push({id: buildingId, parcelId: parcel.id, blockId: block.id, templateId: template.id, frontageRoadId: `road-${row ? top.id : bottom.id}`,...architectureFor(recipe,template.id,row?180:0)});
    }
  }
  region.places = [[w + 3, s + 3], [e - 3, s + 3], [e - 3, n - 3], [w + 3, n - 3]]
    .map((position, i) => ({id: `arrival-${i + 1}`, name: `Garden arrival ${i + 1}`, position:i===0&&recipe.spawn?[...recipe.spawn]:position}));
  for (const key of ['roads', 'parcels', 'buildings', 'places']) region[key].sort(order);
  return {region, blocks: blocks.sort(order), placements: placements.sort(order), diagnostics: diagnostics.sort(order)};
}
