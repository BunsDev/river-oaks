import { isSpaceDocument, validateSpace, spaceItems, mutateSpace } from './space-document.js';
import { blankRegion, editableRegion, nextRegionId } from '../region-draft.js';
import { assertStudioBudget } from './limits.js';

export const STORAGE_KEY = 'river-oaks-world-studio-v1';
export const MAX_REGION_BYTES = 128 * 1024;
const clone = value => structuredClone(value);
const encode = value => JSON.stringify(value);
const validate = region => {
  // JSON round-tripping rejects sparse/nonfinite input the same way a file does.
  const text = encode(region);
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_REGION_BYTES
    || (!isSpaceDocument(region) && !editableRegion(JSON.parse(text)))) throw new Error('Use a valid Studio JSON, within 128 KiB and the document bounds.');
  const parsed=JSON.parse(text);if(isSpaceDocument(parsed))return validateSpace(parsed);assertStudioBudget(parsed);return parsed;
};
export function parseRegion(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_REGION_BYTES) throw new Error('Studio files must be at most 128 KiB.');
  return validate(JSON.parse(text));
}
export function studioItems(region) {
  if(isSpaceDocument(region))return spaceItems(region);
  return [
    { id: '@arrival', type: 'arrival', label: 'Arrival', east: region.spawn[0], north: region.spawn[1] },
    ...region.buildings.map(b => ({ id: b.id, type: 'building', label: b.id, east: b.center[0], north: b.center[1], width: b.size[0], depth: b.size[1], height: b.size[2], yaw: b.yaw_deg })),
    ...region.trees.map(t => ({ id: t.id, type: 'tree', label: t.id, east: t.position[0], north: t.position[1], height: t.height_m, radius: t.crown_radius_m })),
    ...region.places.map(p => ({ id: p.id, type: 'place', label: p.name, east: p.position[0], north: p.position[1] })),
  ];
}
export function createStudioDocument(initial = blankRegion(), { historyLimit = 80 } = {}) {
  let region = validate(initial), past = [], future = [], saved = encode(region), savedRecord = null, revision = 0;
  const transact = next => {
    next = validate(next);
    if (encode(next) === encode(region)) return false;
    past.push(region); if (past.length > historyLimit) past.shift();
    region = next; future = []; revision++; return true;
  };
  const api = {
    get value() { return clone(region); },
    get revision() { return revision; },
    get items() { return studioItems(region); },
    get dirty() { return encode(region) !== saved; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    serialize() { return JSON.stringify(region, null, 2); },
    replace(next) { const changed = transact(next); if (!changed) revision++; return changed; },
    add(type) {
      if(isSpaceDocument(region)){
        const [w,s,e,n]=region.bounds_m;
        for(let y=s+2;y<n-2;y+=2)for(let x=w+2;x<e-2;x+=2){
          if(region.objects.some(item=>Math.hypot(item.east-x,item.north-y)<2))continue;
          try{const next=mutateSpace(region,'add',type,{east:x,north:y});transact(next.value);return next.id;}catch{ /* Try the next bounded position. */ }
        }
        throw Error('No clear insertion point remains.');
      }
      const next = clone(region), id = nextRegionId(next, type);
      // Search a bounded grid for a legal insertion; never overwrite a user's item.
      const [west, south, east, north] = next.bounds_m;
      const positions = [[-24, 12]];
      for (let y = south + 12; y < north - 12; y += 12) for (let x = west + 12; x < east - 12; x += 12) positions.push([x, y]);
      for (const position of positions) {
        const candidate = clone(next);
        if (type === 'building') candidate.buildings.push({ id, kind: 'retail', center: position, size: [12, 10, 7], yaw_deg: 0 });
        else if (type === 'tree') candidate.trees.push({ id, position, height_m: 6, crown_radius_m: 2.5 });
        else if (type === 'place') candidate.places.push({ id, name: 'New place', position });
        else throw new Error('Choose a building, tree or place.');
        const occupied = studioItems(region).some(item => Math.hypot(item.east-position[0], item.north-position[1]) < 12);
        if (!occupied && editableRegion(candidate)) { transact(candidate); return id; }
      }
      throw new Error('No clear insertion point remains, or the region object limit was reached.');
    },
    insert(type, patch) {
      if(isSpaceDocument(region)){const next=mutateSpace(region,'add',type,patch);transact(next.value);return next.id;}
      const allowed = { building: ['east','north','width','depth','height','yaw'], tree: ['east','north','height','radius'], place: ['east','north','label'] }[type];
      if (!allowed || !patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !allowed.includes(key))) throw Error('Invalid object properties.');
      const value = { east: 0, north: 0, width: 12, depth: 10, height: type === 'building' ? 7 : 6, yaw: 0, radius: 2.5, label: 'New place', ...patch };
      const next = clone(region), id = nextRegionId(next, type);
      if (type === 'building') next.buildings.push({ id, kind: 'retail', center: [value.east,value.north], size: [value.width,value.depth,value.height], yaw_deg: value.yaw });
      else if (type === 'tree') next.trees.push({ id, position: [value.east,value.north], height_m: value.height, crown_radius_m: value.radius });
      else next.places.push({ id, name: value.label, position: [value.east,value.north] });
      transact(next); return id;
    },
    update(id, patch) {
      if(isSpaceDocument(region))return transact(mutateSpace(region,'update',id,patch).value);
      const item = api.items.find(value => value.id === id);
      if (!item) throw new Error('Select an existing object.');
      const allowed = { arrival: ['east','north'], building: ['east','north','width','depth','height','yaw'], tree: ['east','north','height','radius'], place: ['east','north','label'] }[item.type];
      if (Object.keys(patch).some(key => !allowed.includes(key))) throw new Error('That property cannot be edited.');
      const value = { ...item, ...patch }, next = clone(region);
      if (item.type === 'arrival') next.spawn = [value.east, value.north];
      else if (item.type === 'building') Object.assign(next.buildings.find(b => b.id === id), { center: [value.east,value.north], size: [value.width,value.depth,value.height], yaw_deg: value.yaw });
      else if (item.type === 'tree') Object.assign(next.trees.find(t => t.id === id), { position: [value.east,value.north], height_m: value.height, crown_radius_m: value.radius });
      else Object.assign(next.places.find(p => p.id === id), { position: [value.east,value.north], name: value.label });
      return transact(next);
    },
    remove(id) {
      if(isSpaceDocument(region))return transact(mutateSpace(region,'remove',id).value);
      const item = api.items.find(value => value.id === id);
      if (!item || item.type === 'arrival') throw new Error('The arrival point must stay in the region.');
      const next = clone(region), key = { building:'buildings', tree:'trees', place:'places' }[item.type];
      next[key] = next[key].filter(value => value.id !== id);return transact(next);
    },
    undo() { if (!past.length) return false;future.push(region);region = past.pop();revision++;return true; },
    redo() { if (!future.length) return false;past.push(region);region = future.pop();revision++;return true; },
    restore(storage) {
      const raw = storage.getItem(STORAGE_KEY);
      savedRecord = raw;
      if (raw === null) return false;
      const entry = JSON.parse(raw);
      if (typeof entry?.revision !== 'string') throw new Error('Saved draft is invalid. Import a Studio file to recover.');
      const candidate = validate(entry.region);
      region = candidate; revision++; saved = encode(region); past = []; future = [];return true;
    },
    save(storage) {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw !== savedRecord) throw new Error('A draft changed in another tab. Export your work, then reopen the saved draft.');
      const next = globalThis.crypto.randomUUID();
      const record = encode({ revision:next,region });
      storage.setItem(STORAGE_KEY, record);
      savedRecord = record;saved = encode(region);
    },
  };
  return api;
}
