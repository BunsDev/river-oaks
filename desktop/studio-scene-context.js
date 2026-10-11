// Rebuilds renderer-supplied scene context from an allowlist before it reaches a
// local agent prompt. Unknown keys are dropped, strings are bounded and cleaned,
// and numbers must be finite. Free text that remains (labels, names) is the
// user's own scene data and stays labelled as untrusted in the prompt.
const LIMITS = { objects: 2048, roads: 256, points: 512, text: 64, id: 100 };
// C0/C1 controls and bidirectional overrides can hide text from the reviewer.
const HIDDEN = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = (value, max = LIMITS.text) => typeof value === 'string' ? value.replace(HIDDEN, '').slice(0, max) : undefined;
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

const OBJECT = { id: value => text(value, LIMITS.id), type: value => ['arrival', 'building', 'tree', 'place'].includes(value) ? value : undefined,
  label: text, east: num, north: num, width: num, depth: num, height: num, radius: num, yaw: num };
const ROAD = { id: value => text(value, LIMITS.id), name: text, kind: text, width_m: num, points: value => list(value, LIMITS.points, point) };
const object = value => { const out = pick(value, OBJECT); return out?.id && out.type ? out : null; };
const road = value => pick(value, ROAD);

// Editable region content only: parcels, ownership metadata, interiors and terrain
// heights are not needed to propose object edits and stay out of the prompt.
function region(value) {
  if (!value || typeof value !== 'object') return undefined;
  return {
    schema_version: num(value.schema_version), bounds_m: bounds(value.bounds_m), spawn: point(value.spawn),
    roads: list(value.roads, LIMITS.roads, road),
    buildings: list(value.buildings, LIMITS.objects, b => pick(b, { id: v => text(v, LIMITS.id), kind: text, center: point,
      size: v => Array.isArray(v) && v.length === 3 && v.every(finite) ? [...v] : undefined, yaw_deg: num })),
    trees: list(value.trees, LIMITS.objects, t => pick(t, { id: v => text(v, LIMITS.id), position: point, height_m: num, crown_radius_m: num })),
    places: list(value.places, LIMITS.objects, p => pick(p, { id: v => text(v, LIMITS.id), name: text, position: point })),
  };
}

export function sanitizeSceneContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const out = { units: 'metres' };
  if (finite(context.revision)) out.revision = context.revision;
  const box = bounds(context.bounds_m) ?? bounds(context.bounds);
  if (box) out.bounds_m = box;
  if (typeof context.selectedId === 'string') out.selectedId = text(context.selectedId, LIMITS.id);
  if (Array.isArray(context.objects)) out.objects = list(context.objects, LIMITS.objects, object);
  if (Array.isArray(context.roads)) out.roads = list(context.roads, LIMITS.roads, road);
  if (context.region) out.region = region(context.region);
  return out;
}

export const cleanText = text;
