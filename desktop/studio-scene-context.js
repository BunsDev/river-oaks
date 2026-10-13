import { SPACE_KINDS, SPACE_FINISHES, SPACE_LIGHTING } from '../shared/studio-space-catalog.js';
// Rebuilds renderer-supplied scene context from an allowlist before it reaches a
// local agent prompt. Unknown keys are dropped, strings are bounded and cleaned,
// and numbers must be finite. Free text that remains (place and road names,
// labels) is the user's own scene data and stays labelled as untrusted in the prompt.
const LIMITS = { objects: 2048, roads: 256, points: 512, text: 64, id: 48 };
// Characters a reader cannot see but a model still receives: controls, format
// characters (bidi overrides, zero-width, U+E0000 tag characters), private-use and
// unassigned code points, line/paragraph separators and variation selectors.
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}\u{180B}-\u{180F}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}\u{115F}\u{1160}\u{3164}\u{FFA0}\u{2800}]/gu;
// Every other space character (no-break, em, ideographic …) becomes a plain space.
const SPACES = /\p{Zs}/gu;
// Region IDs are lowercase slugs (preview/src/region-draft.js); Studio adds @arrival.
const ID = /^(?:@arrival|@environment|[a-z0-9]+(?:-[a-z0-9]+)*)$/;

const finite = value => typeof value === 'number' && Number.isFinite(value);
// Cut by code point so a limit never splits a surrogate pair.
const cut = (value, max) => { const chars = [...value]; return chars.length > max ? chars.slice(0, max).join('') : value; };
// Single-line text: line breaks become spaces, hidden characters go, runs of spaces collapse.
const text = (value, max = LIMITS.text) => typeof value === 'string'
  ? cut(value.replace(/[\r\n\t]+/g, ' ').replace(HIDDEN, '').replace(SPACES, ' ').replace(/ {2,}/g, ' ').trim(), max) : undefined;
const id = value => typeof value === 'string' && value.length <= LIMITS.id && ID.test(value) ? value : undefined;
const kind = value => typeof value === 'string' && /^[a-z0-9_-]{1,32}$/.test(value) ? value : undefined;
const point = value => Array.isArray(value) && value.length === 2 && value.every(finite) ? [value[0], value[1]] : undefined;
const list = (value, max, map) => Array.isArray(value) ? value.slice(0, max).map(map).filter(Boolean) : [];
function pick(source, fields) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const out = {};
  for (const [key, clean] of Object.entries(fields)) { const value = clean(source[key]); if (value !== undefined) out[key] = value; }
  return out;
}
const num = value => finite(value) ? value : undefined;
const bounds = value => Array.isArray(value) && value.length === 4 && value.every(finite) ? [...value] : undefined;

const OBJECT = { id, type: value => ['arrival', 'building', 'tree', 'place', 'furnishing', 'environment'].includes(value) ? value : undefined,
  label: text, east: num, north: num, width: num, depth: num, height: num, radius: num, yaw: num, elevation:num, kind:v=>SPACE_KINDS.includes(v)?v:undefined, finish:v=>SPACE_FINISHES.includes(v)?v:undefined, lighting:v=>SPACE_LIGHTING.includes(v)?v:undefined };
const ROAD = { id, name: text, kind, width_m: num, points: value => list(value, LIMITS.points, point) };
const object = value => { const out = pick(value, OBJECT); return out?.id && out.type ? out : null; };
const road = value => { const out = pick(value, ROAD); return out?.id ? out : null; };
const keyed = fields => value => { const out = pick(value, fields); return out?.id ? out : null; };

// Editable region content only: parcels, ownership metadata, interiors and terrain
// heights are not needed to propose object edits and stay out of the prompt.
function region(value) {
  if (!value || typeof value !== 'object') return undefined;
  if(value.document_type==='studio-space')return {document_type:'studio-space',schema_version:1,name:text(value.name),lighting:SPACE_LIGHTING.includes(value.lighting)?value.lighting:undefined,bounds_m:bounds(value.bounds_m),spawn:point(value.spawn),objects:list(value.objects,160,v=>object({...v,type:'furnishing'}))};
  return {
    schema_version: num(value.schema_version), bounds_m: bounds(value.bounds_m), spawn: point(value.spawn),
    roads: list(value.roads, LIMITS.roads, road),
    buildings: list(value.buildings, LIMITS.objects, keyed({ id, kind, center: point,
      size: v => Array.isArray(v) && v.length === 3 && v.every(finite) ? [...v] : undefined, yaw_deg: num })),
    trees: list(value.trees, LIMITS.objects, keyed({ id, position: point, height_m: num, crown_radius_m: num })),
    places: list(value.places, LIMITS.objects, keyed({ id, name: text, position: point })),
  };
}

export function sanitizeSceneContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const out = { units: 'metres' };
  if(context.documentType==='studio-space')out.documentType='studio-space';
  if (finite(context.revision)) out.revision = context.revision;
  const box = bounds(context.bounds_m) ?? bounds(context.bounds);
  if (box) out.bounds_m = box;
  if (id(context.selectedId)) out.selectedId = context.selectedId;
  if (Array.isArray(context.objects)) out.objects = list(context.objects, LIMITS.objects, object);
  if (Array.isArray(context.roads)) out.roads = list(context.roads, LIMITS.roads, road);
  if (context.region) out.region = region(context.region);
  return out;
}

export const cleanText = text;
export const sceneId = id;

// Multi-line free text (a task or brief): hidden characters go, runs of spaces and
// blank lines collapse. Hosts send exactly this text and show exactly this text.
export function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').split('\n')
    .map(line => line.replace(HIDDEN, '').replace(SPACES, ' ').replace(/ {2,}/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Every free-text string in a sanitized context, so it can be shown before sending.
export function sceneText(context) {
  const names = new Set();
  if(context?.region?.name)names.add(context.region.name);
  for (const item of [...(context?.objects ?? []),...(context?.region?.objects ?? [])]) if (item.label && item.label !== item.id) names.add(item.label);
  for (const item of [...(context?.roads ?? []), ...(context?.region?.roads ?? []), ...(context?.region?.places ?? [])]) if (item.name) names.add(item.name);
  return [...names];
}
