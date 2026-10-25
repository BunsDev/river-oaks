import { createSpace, spaceRouteProfile } from './space-templates.js';
import { assessSpace, normalizeAssessmentContext } from './space-assessment.js';
import { isSpaceDocument, validateSpace, spaceItems, mutateSpace } from './space-document.js';
import { blankRegion, editableRegion, nextRegionId } from '../region-draft.js';
import { assertStudioBudget } from './limits.js';
import { previewBuildingInteriorPlan } from './interior-plan.js';
import { validateAuthoringArtifact } from '../../../shared/neighborhood/preserve.js';

export const STORAGE_KEY = 'river-oaks-world-studio-v1';
export const MAX_REGION_BYTES = 128 * 1024;
const clone = value => structuredClone(value);
const encode = value => JSON.stringify(value);
const after = (value, next) => value?.then ? value.then(next) : next(value);
const validate = region => {
  // JSON round-tripping rejects sparse/nonfinite input the same way a file does.
  const text = encode(region);
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_REGION_BYTES
    || (!isSpaceDocument(region) && !editableRegion(JSON.parse(text)))) throw new Error('Use a valid Studio JSON, within 128 KiB and the document bounds.');
  const parsed=JSON.parse(text);if(isSpaceDocument(parsed))return validateSpace(parsed);assertStudioBudget(parsed);
  for (const building of parsed.buildings) if (building.interior?.generation) previewBuildingInteriorPlan(parsed, building.id);
  return parsed;
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
export function createStudioDocument(initial = blankRegion(), { historyLimit = 80, assessmentContext = null, routeBudget, assessmentRunner } = {}) {
  let region = validate(initial), context = isSpaceDocument(region) ? normalizeAssessmentContext(assessmentContext) : null;
  let neighborhood = null;
  const snapshot = () => ({ region, context, ...(neighborhood ? {neighborhood} : {}) });
  let past = [], future = [], saved = encode(snapshot()), savedRecord = null, revision = 0, assessment = null, rejected = null;
  const jobs = new Set();
  let refreshing = null;
  const cancelled = () => new DOMException('Assessment cancelled. The draft is unchanged.', 'AbortError');
  const invalidate = () => { for (const controller of jobs) controller.abort(); assessment = null; rejected = null; refreshing = null; };
  const checkRevision = (baseRevision, signal) => {
    if (signal?.aborted) throw cancelled();
    if (baseRevision !== revision) throw Error('The document changed; start a fresh edit.');
  };
  const assess = (next, { baseRevision = revision, signal } = {}) => {
    if (!assessmentRunner || !isSpaceDocument(next) || !context) return assessSpace(next, context, { revision: baseRevision, maxWork: routeBudget });
    const controller = new AbortController(), profile = clone(context);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    jobs.add(controller);
    return Promise.resolve().then(() => {
      checkRevision(baseRevision, controller.signal);
      return assessmentRunner(next, profile, { revision: baseRevision, maxWork: routeBudget, signal: controller.signal });
    }).then(result => {
      checkRevision(baseRevision, controller.signal);
      if (result.revision !== baseRevision || encode(result.context) !== encode(profile)) throw Error('Stale assessment response.');
      return result;
    }).finally(() => { jobs.delete(controller); signal?.removeEventListener('abort', abort); });
  };
  const assertCandidate = (next, { baseRevision = revision, signal } = {}) => {
    checkRevision(baseRevision, signal);
    next = validate(next);
    return after(assess(next, { baseRevision, signal }), result => {
      checkRevision(baseRevision, signal);
      if (context && result.status !== 'passed') {
        const changed = next.objects?.filter(item => encode(item) !== encode(region.objects?.find(old => old.id === item.id))).map(item => item.id) ?? [];
        for (const finding of result.findings) finding.objectIds = [...new Set([...changed, ...finding.objectIds])];
        rejected = result;
        const error = Error(result.findings[0]?.message ?? 'Template version is not assessed. Select a supported program before editing.');
        error.assessment = clone(result); throw error;
      }
      return { next, result };
    });
  };
  const commit = (next, nextContext, result = null, nextNeighborhood = neighborhood) => {
    if (encode(next) === encode(region) && encode(nextContext) === encode(context) && encode(nextNeighborhood) === encode(neighborhood)) return false;
    past.push(snapshot()); if (past.length > historyLimit) past.shift();
    invalidate(); region = next; context = nextContext; neighborhood = nextNeighborhood; future = []; revision++; assessment = result ? { ...result, revision } : null; rejected = null; return true;
  };
  const transact = (next, options) => {
    return after(assertCandidate(next, options), checked => commit(checked.next, context, checked.result));
  };
  const api = {
    get value() { return clone(region); },
    get revision() { return revision; },
    get neighborhood() { return clone(neighborhood); },
    openNeighborhood(artifact, {baseRevision = revision} = {}) {
      checkRevision(baseRevision);
      const checked = validateAuthoringArtifact(artifact), next = validate(checked.region);
      return commit(next, null, null, checked);
    },
    get assessmentContext() { return clone(context); },
    get assessment() {
      if (assessment) return clone(assessment);
      if (!assessmentRunner || !context || !isSpaceDocument(region)) return clone(assessment ??= assess(region));
      return { ...assessSpace(region, null, { revision }), context: clone(context), status: 'pending' };
    },
    refreshAssessment() {
      if (assessment) return Promise.resolve(clone(assessment));
      if (refreshing?.revision === revision) return refreshing.promise;
      const baseRevision = revision;
      const promise = Promise.resolve(assess(region, { baseRevision })).then(result => {
        checkRevision(baseRevision); assessment = result; return clone(result);
      }).finally(() => { if(refreshing?.promise===promise)refreshing=null; });
      refreshing = { revision: baseRevision, promise }; return promise;
    },
    restoreRequiredRoles() {
      const profile = spaceRouteProfile(context);
      if (!isSpaceDocument(region) || !profile) throw Error('Select a supported assessment program first.');
      const next = clone(region), stock = createSpace(profile.templateId);
      for (const target of profile.targets) {
        const item = next.objects.find(o => o.id === target.objectId);
        if (item) item.kind = target.kind;
        else next.objects.push(stock.objects.find(o => o.id === target.objectId));
      }
      return transact(next);
    },
    cancelPendingAssessments() { for (const controller of jobs) controller.abort(); refreshing=null; },
    dispose() { invalidate(); },
    get rejectedAssessment() { return clone(rejected); },
    assessCandidate(next, options) { return after(assertCandidate(next, options), checked => clone(checked.result)); },
    commitCandidate(next, options) { return transact(next, options); },
    selectAssessmentContext(value) {
      if (!isSpaceDocument(region)) throw Error('Choose a furnished space first.');
      return commit(region, normalizeAssessmentContext(value));
    },
    open(next, { assessmentContext = null } = {}) {
      next = validate(next);
      const nextContext = isSpaceDocument(next) ? normalizeAssessmentContext(assessmentContext) : null;
      const changed = commit(next, nextContext, null, null);
      if (!changed) { invalidate(); revision++; }
      return changed;
    },
    get items() { return studioItems(region); },
    get dirty() { return encode(snapshot()) !== saved; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    serialize() { return JSON.stringify(region, null, 2); },
    replace(next) { return after(transact(next), changed => { if (!changed) { invalidate(); revision++; } return changed; }); },
    previewBuildingInterior(id, interior) {
      if (isSpaceDocument(region)) throw new Error('Furnished spaces keep their existing document format.');
      const next = clone(region), building = next.buildings.find(item => item.id === id);
      if (!building) throw new Error('Select a building.');
      building.interior = clone(interior);
      validate(next);
      return interior?.generation ? previewBuildingInteriorPlan(next, id) : null;
    },
    setBuildingInterior(id, interior) {
      api.previewBuildingInterior(id, interior);
      const next = clone(region);
      next.buildings.find(item => item.id === id).interior = clone(interior);
      return transact(next);
    },
    add(type) {
      if(isSpaceDocument(region)){
        const [w,s,e,n]=region.bounds_m;
        for(let y=s+2;y<n-2;y+=2)for(let x=w+2;x<e-2;x+=2){
          if(region.objects.some(item=>Math.hypot(item.east-x,item.north-y)<2))continue;
          try{const next=mutateSpace(region,'add',type,{east:x,north:y});return after(transact(next.value), () => next.id);}catch(error){ if(error.assessment)throw error; /* Try the next structurally valid position. */ }
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
      if(isSpaceDocument(region)){const next=mutateSpace(region,'add',type,patch);return after(transact(next.value), () => next.id);}
      const allowed = { building: ['east','north','width','depth','height','yaw'], tree: ['east','north','height','radius'], place: ['east','north','label'] }[type];
      if (!allowed || !patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !allowed.includes(key))) throw Error('Invalid object properties.');
      const value = { east: 0, north: 0, width: 12, depth: 10, height: type === 'building' ? 7 : 6, yaw: 0, radius: 2.5, label: 'New place', ...patch };
      const next = clone(region), id = nextRegionId(next, type);
      if (type === 'building') next.buildings.push({ id, kind: 'retail', center: [value.east,value.north], size: [value.width,value.depth,value.height], yaw_deg: value.yaw });
      else if (type === 'tree') next.trees.push({ id, position: [value.east,value.north], height_m: value.height, crown_radius_m: value.radius });
      else next.places.push({ id, name: value.label, position: [value.east,value.north] });
      transact(next); return id;
    },
    update(id, patch, options) {
      if(isSpaceDocument(region))return transact(mutateSpace(region,'update',id,patch).value, options);
      const item = api.items.find(value => value.id === id);
      if (!item) throw new Error('Select an existing object.');
      const allowed = { arrival: ['east','north'], building: ['east','north','width','depth','height','yaw'], tree: ['east','north','height','radius'], place: ['east','north','label'] }[item.type];
      if (Object.keys(patch).some(key => !allowed.includes(key))) throw new Error('That property cannot be edited.');
      const value = { ...item, ...patch }, next = clone(region);
      if (item.type === 'arrival') next.spawn = [value.east, value.north];
      else if (item.type === 'building') Object.assign(next.buildings.find(b => b.id === id), { center: [value.east,value.north], size: [value.width,value.depth,value.height], yaw_deg: value.yaw });
      else if (item.type === 'tree') Object.assign(next.trees.find(t => t.id === id), { position: [value.east,value.north], height_m: value.height, crown_radius_m: value.radius });
      else Object.assign(next.places.find(p => p.id === id), { position: [value.east,value.north], name: value.label });
      return transact(next, options);
    },
    remove(id) {
      if(isSpaceDocument(region))return transact(mutateSpace(region,'remove',id).value);
      const item = api.items.find(value => value.id === id);
      if (!item || item.type === 'arrival') throw new Error('The arrival point must stay in the region.');
      const next = clone(region), key = { building:'buildings', tree:'trees', place:'places' }[item.type];
      next[key] = next[key].filter(value => value.id !== id);return transact(next);
    },
    undo() { if (!past.length) return false;future.push(snapshot());invalidate();({ region, context, neighborhood = null } = past.pop());revision++;return true; },
    redo() { if (!future.length) return false;past.push(snapshot());invalidate();({ region, context, neighborhood = null } = future.pop());revision++;return true; },
    restore(storage) {
      const raw = storage.getItem(STORAGE_KEY);
      savedRecord = raw;
      if (raw === null) return false;
      const entry = JSON.parse(raw);
      if (typeof entry?.revision !== 'string') throw new Error('Saved draft is invalid. Import a Studio file to recover.');
      const candidate = validate(entry.region);
      const nextContext = isSpaceDocument(candidate) ? normalizeAssessmentContext(entry.assessmentContext) : null;
      const nextNeighborhood = entry.neighborhood ? validateAuthoringArtifact(entry.neighborhood) : null;
      if (nextNeighborhood && (isSpaceDocument(candidate) || encode(candidate.bounds_m) !== encode(nextNeighborhood.region.bounds_m))) throw Error('Saved neighborhood does not match this draft. Open its authoring file to recover.');
      invalidate(); region = candidate; context = nextContext; neighborhood = nextNeighborhood; revision++;
      saved = encode(snapshot()); past = []; future = [];return true;
    },
    save(storage) {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw !== savedRecord) throw new Error('A draft changed in another tab. Export your work, then reopen the saved draft.');
      const next = globalThis.crypto.randomUUID();
      const record = encode({ revision:next,region, ...(context ? { assessmentContext: context } : {}), ...(neighborhood ? {neighborhood} : {}) });
      storage.setItem(STORAGE_KEY, record);
      savedRecord = record;saved = encode(snapshot());
    },
  };
  return api;
}

// Detached, bounded-operation preview only: no save, history or accepted-state
// mutation. The designer validates the final candidate through the live document.
export function createStudioEditPreview(initial) {
  if (!isSpaceDocument(initial)) return createStudioDocument(initial);
  let region = validate(initial), operations = 0;
  const apply = (op, id, patch) => {
    if (++operations > 64) throw Error('Use at most 64 preview operations.');
    const next = mutateSpace(region, op, id, patch, { validateResult: false });
    region = next.value; return next.id;
  };
  return {
    get value() { return clone(region); },
    get items() { return studioItems(region); },
    update(id, patch) { apply('update', id, patch); },
    remove(id) { apply('remove', id); },
    insert(type, patch) { return apply('add', type, patch); },
  };
}
