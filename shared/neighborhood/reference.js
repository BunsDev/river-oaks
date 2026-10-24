import { canonical, hash, order } from './format.js';
import {architectureFor,architectureFacing} from './architecture.js';
import { validPolygon, containsWithSetback, footprint } from './polygon.js';

const fail = message => { throw new Error(`Invalid geographic reference: ${message}`); };
const pair = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const id = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 48;
const same = (a, b) => canonical(a) === canonical(b);

export function normalizeReference(recipe) {
  const ref = recipe.reference;
  if (!ref || ref.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(ref.source_sha256 ?? '') || !same(ref.frame, recipe.frame)) fail('version, source hash or frame');
  const controls = Object.fromEntries(['bounds_m', 'constraints', 'templates', 'reserved'].map(key => [key, recipe[key]]));
  if (!same(ref.controls, controls)) fail('fit controls changed; recompile the reference from its source world before generating');
  const limits = {roads: 64, parcels: 32, blocks: 64, slots: 32, protected: 128};
  for (const [name, limit] of Object.entries(limits)) {
    if (!Array.isArray(ref[name]) || ref[name].length > limit || ['roads', 'parcels'].includes(name) && ref[name].length === 0
      || ref[name].some(item => !item || !id(item.id)) || new Set(ref[name].map(item => item.id)).size !== ref[name].length) fail(`${name} identity or budget`);
  }
  for (const item of [...ref.parcels, ...ref.blocks, ...ref.protected]) if (!validPolygon(item)) fail(`invalid polygon ${item.id}`);
  const [w, s, e, n] = recipe.bounds_m;
  for (const item of [...ref.parcels, ...ref.protected]) if (!item.ring.every(([x, y]) => x >= w && x <= e && y >= s && y <= n)) fail(`polygon outside bounds: ${item.id}`);
  for (const parcel of ref.parcels) if (parcel.bounds_m) {
    const [left, bottom, right, top] = parcel.bounds_m;
    const rectangle = [[left, bottom], [right, bottom], [right, top], [left, top]];
    if (!Array.isArray(parcel.bounds_m) || parcel.bounds_m.length !== 4 || !parcel.bounds_m.every(Number.isFinite) || right - left < 6 || top - bottom < 6
      || parcel.holes.length || parcel.ring.length !== 5 || !parcel.ring.every(point => rectangle.some(corner => same(corner, point)))) fail(`parcel ${parcel.id} is not an exact Studio rectangle`);
  }
  for (const slot of ref.slots) {
    const parcel = ref.parcels.find(item => item.id === slot.parcelId);
    const block = ref.blocks.find(item => item.id === slot.blockId);
    if (!parcel || !block || !ref.roads.some(item => item.id === slot.frontageRoadId)
      || !Array.isArray(slot.options) || slot.options.length < 1 || slot.options.length > recipe.templates.length
      || new Set(slot.options.map(item => item.templateId)).size !== slot.options.length) fail(`slot ${slot.id} topology`);
    for (const option of slot.options) {
      const template = recipe.templates.find(item => item.id === option.templateId);
      if (!template || !same(option.size, template.size) || !pair(option.center) || !Number.isFinite(option.yaw_deg) || Math.abs(option.yaw_deg) > 180
        || !containsWithSetback(parcel, footprint(option), recipe.constraints.setback_m)
        || !containsWithSetback(block, footprint(option), 0)) fail(`slot ${slot.id} template fit`);
    }
  }
  if (!Array.isArray(ref.diagnostics) || ref.diagnostics.length > 2048 || ref.diagnostics.some(item => !item || !['info', 'warning'].includes(item.severity) || typeof item.code !== 'string' || typeof item.id !== 'string' || typeof item.message !== 'string')) fail('diagnostics');
  return {...structuredClone(ref), ...Object.fromEntries(Object.keys(limits).map(name => [name, structuredClone(ref[name]).sort(order)]))};
}

export function generateReferenceNeighborhood(recipe) {
  const ref = recipe.reference, [w, s, e, n] = recipe.bounds_m;
  const region = {schema_version: 1, bounds_m: [...recipe.bounds_m], terrain: structuredClone(ref.terrain), spawn: recipe.spawn ? [...recipe.spawn] : [w + 2, s + 2],
    roads: ref.roads.map(({source_id: _source, ...road}) => structuredClone(road)),
    parcels: ref.parcels.filter(item => item.bounds_m).map(item => ({id: item.id, name: item.source_id.slice(0, 64), bounds_m: [...item.bounds_m]})), buildings: [], trees: [],
    places: [[w + 3, s + 3], [e - 3, s + 3], [e - 3, n - 3], [w + 3, n - 3]].map((position, i) => ({id: `arrival-${i + 1}`, name: `Reference arrival ${i + 1}`, position:i===0&&recipe.spawn?[...recipe.spawn]:position}))};
  const placements = [];
  for (const slot of ref.slots) {
    const options = [...slot.options].sort((a, b) => a.templateId < b.templateId ? -1 : 1);
    const option = options[parseInt(hash([recipe.seed, slot.id]).slice(0, 8), 16) % options.length];
    const template = recipe.templates.find(item => item.id === option.templateId);
    const {templateId, ...geometry} = option;
    region.buildings.push({id: slot.id, kind: template.kind, ...structuredClone(geometry)});
    placements.push({id: slot.id, parcelId: slot.parcelId, blockId: slot.blockId, frontageRoadId: slot.frontageRoadId, templateId,...architectureFor(recipe,templateId,architectureFacing(geometry,ref.roads.find(r=>r.id===slot.frontageRoadId)))});
  }
  return {region, blocks: structuredClone(ref.blocks), placements, diagnostics: [...structuredClone(ref.diagnostics),
    {severity: 'info', code: 'reference-preview', id: recipe.id, message: 'Irregular parcels and existing protected buildings remain source-reference overlays, not replacement creator geometry. The mapped source world is unchanged.'}]};
}
