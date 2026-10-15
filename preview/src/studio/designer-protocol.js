import { createStudioEditPreview, MAX_REGION_BYTES } from './document.js';

export const DESIGNER_PROTOCOL = 1;
export const DESIGNER_CAPABILITIES = ['objects.update', 'objects.remove', 'objects.add'];
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const after = (value, next) => value?.then ? value.then(next) : next(value);
const fail = message => { throw new Error(message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedString = (value, max = 4000) => typeof value === 'string' && value.length > 0 && value.length <= max;
// The exact serialized base is also checked locally. This hash labels context; it is not an authentication primitive.
export function documentHash(value) {
  const text = JSON.stringify(value); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function finiteJson(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) fail('Proposal contains a nonfinite number.');
  if (value && typeof value === 'object') for (const child of Object.values(value)) finiteJson(child);
}
function exactKeys(value, allowed) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('Unsupported proposal property.');
}
export function createDesignerSession(doc) {
  let connection = null, active = null, pending = null;
  let previewGeneration = 0;
  const cancel = () => { active?.controller.abort(); active = null; pending = null; previewGeneration++; };
  const assertActive = () => {
    if (!connection || !active) fail('No active design request.');
    if (doc.revision !== active.request.baseRevision || doc.serialize() !== active.serialized) fail('The document changed; request a fresh proposal.');
  };
  return {
    connect(value) {
      if (!plain(value) || !['id', 'projectId', 'packVersion'].every(key => boundedString(value[key], 200)) || !Array.isArray(value.capabilities)) fail('Invalid designer connection.');
      cancel(); connection = structuredClone(value);
    },
    disconnect() { cancel(); connection = null; },
    cancel,
    begin({ brief, scope = 'selection', selectedIds = [], projectBrief = '' }) {
      cancel();
      if (!connection) fail('Connect a designer first.');
      // The desktop confirmation shows the whole task and brief, so both stay short enough to read.
      if (!boundedString(brief, 1000) || typeof projectBrief !== 'string' || projectBrief.length > 2000) fail('Keep the task within 1,000 characters and project brief within 2,000.');
      if (!['selection', 'region'].includes(scope)) fail('Choose a context scope.');
      const items = doc.items, ids = [...new Set(selectedIds)];
      if (scope === 'selection' && (!ids.length || ids.some(id => !items.some(item => item.id === id)))) fail('Select an object to share, or choose the whole region.');
      const region = doc.value;
      const request = {
        protocol: DESIGNER_PROTOCOL, requestId: globalThis.crypto.randomUUID(), connectionId: connection.id,
        projectId: connection.projectId, baseRevision: doc.revision, baseHash: documentHash(region),
        packVersion: connection.packVersion, capabilities: connection.capabilities.filter(cap => DESIGNER_CAPABILITIES.includes(cap)),
        brief, projectBrief, scope, selectedIds: scope === 'selection' ? ids : [],
        context: { documentType: region.document_type??'region', units: 'metres', axes: 'east,north; Three.js east,up,-north', bounds: region.bounds_m,
          ...(scope === 'region' ? { region } : { objects: items.filter(item => ids.includes(item.id)) }) },
      };
      active = { request: structuredClone(request), serialized: doc.serialize(), controller: new AbortController() };
      return request;
    },
    preview(value) {
      pending = null; assertActive(); const generation = ++previewGeneration;
      finiteJson(value);
      if (!plain(value) || bytes(value) > MAX_REGION_BYTES) fail('Proposal exceeds 128 KiB.');
      exactKeys(value, ['protocol','requestId','connectionId','projectId','baseRevision','baseHash','packVersion','rationale','assumptions','skillsUsed','requiredCapabilities','affectedIds','operations']);
      const request = active.request;
      for (const key of ['protocol','requestId','connectionId','projectId','baseRevision','baseHash','packVersion']) if (value[key] !== request[key]) fail('Stale request or mismatched proposal identity.');
      if (!boundedString(value.rationale) || !Array.isArray(value.assumptions) || value.assumptions.length > 32 || value.assumptions.some(s => !boundedString(s,1000))) fail('Include bounded rationale and assumptions.');
      if (!Array.isArray(value.skillsUsed) || value.skillsUsed.length > 32 || value.skillsUsed.some(s => !boundedString(s,100))) fail('Invalid skills-used evidence.');
      if (!Array.isArray(value.requiredCapabilities) || value.requiredCapabilities.some(cap => !request.capabilities.includes(cap))) fail('This proposal needs unsupported capabilities.');
      if (!Array.isArray(value.operations) || !value.operations.length || value.operations.length > 64) fail('Use 1–64 operations.');
      if (!Array.isArray(value.affectedIds) || value.affectedIds.some(id => !boundedString(id,100))) fail('Invalid affected object IDs.');
      const candidate = createStudioEditPreview(doc.value), affected = new Set(), changes = [];
      for (const op of value.operations) {
        if (!plain(op) || !['update','remove','add'].includes(op.op) || !value.requiredCapabilities.includes(`objects.${op.op}`)) fail('Unsupported or undeclared operation capability.');
        const before = candidate.value;
        if (op.op === 'add') {
          exactKeys(op, ['op','type','patch']);
          if (request.scope !== 'region') fail('Adding objects requires whole-region scope.');
          if (!['building','tree','place','furnishing'].includes(op.type) || !plain(op.patch)) fail('Invalid object addition.');
          const id = candidate.insert(op.type, op.patch); affected.add(id);
          changes.push({ op: op.op, id, before: null, after: candidate.items.find(item => item.id === id) });
        } else {
          exactKeys(op, op.op === 'update' ? ['op','id','patch'] : ['op','id']);
          if (!boundedString(op.id,100)) fail('Invalid object ID.');
          if (request.scope === 'selection' && !request.selectedIds.includes(op.id)) fail('Proposal exceeds selected context scope.');
          const original = candidate.items.find(item => item.id === op.id);
          if (op.op === 'update') {
            if (!plain(op.patch) || !Object.keys(op.patch).length) fail('Include properties to update.');
            candidate.update(op.id, op.patch);
          } else candidate.remove(op.id);
          affected.add(op.id); changes.push({ op: op.op, id: op.id, before: original, after: candidate.items.find(item => item.id === op.id) ?? null });
        }
        if (JSON.stringify(before) === JSON.stringify(candidate.value)) fail('Proposal contains an unchanged operation.');
      }
      if (affected.size !== new Set(value.affectedIds).size || [...affected].some(id => !value.affectedIds.includes(id))) fail('Affected IDs do not match the proposed operations.');
      return after(doc.assessCandidate(candidate.value, { baseRevision: request.baseRevision, signal: active.controller.signal }), () => {
        assertActive();
        if (active.request !== request || generation !== previewGeneration) fail('Stale assessment response.');
        pending = { region: candidate.value, changes, rationale: value.rationale, assumptions: value.assumptions, skillsUsed: value.skillsUsed };
        return structuredClone(pending);
      });
    },
    apply() {
      assertActive(); if (!pending) fail('Preview a valid proposal first.');
      return after(doc.commitCandidate(pending.region, { baseRevision: active.request.baseRevision, signal: active.controller.signal }), result => { cancel(); return result; });
    },
  };
}
