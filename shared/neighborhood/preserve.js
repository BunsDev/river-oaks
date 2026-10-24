import { generateNeighborhood, normalizeRecipe } from './generate.js';
import { validateNeighborhood, validateRegionContract } from './validate.js';
import { canonical, hash, collections, order } from './format.js';
import {compileNeighborhoodArchitecture} from './architecture.js';
export { canonical } from './format.js';

const VERSION = 1;
const clone = value => structuredClone(value);
const equal = (a, b) => canonical(a) === canonical(b);
const key = (collection, id) => `${collection}:${id}`;
const all = region => collections.flatMap(collection => (region[collection] ?? []).map(value => ({collection, id: value.id, value})));
const seal = body => {
  const artifact={...body,sha256:hash(body)};
  // Include the newline written by both CLI and Studio exports. A candidate
  // must remain reopenable through their shared 2 MiB input budget.
  if(new TextEncoder().encode(canonical(artifact)+'\n').length>2*1024*1024)throw Error('Authoring artifact exceeds 2 MiB; reduce reference metadata, crop or retained history before exporting.');
  return artifact;
};

export function validateAuthoringArtifact(value) {
  if (!value || new TextEncoder().encode(canonical(value)).length > 2 * 1024 * 1024) throw Error('Authoring files must be at most 2 MiB.');
  // A checksum is not authority. Re-run the bounded contract and geometry checks.
  const rebuilt = buildNeighborhood(value.recipe, {previous: value, edited: value.region});
  if (canonical(rebuilt) !== canonical(value)) throw Error('Authoring artifact integrity mismatch: resolved geometry or history is inconsistent. Import ordinary edits as a Studio region.');
  return clone(value);
}

/** Reconcile an explicit Studio export against its prior resolved candidate, then regenerate. */
export function buildNeighborhood(input, {previous, edited, approve = []} = {}) {
  const recipe = normalizeRecipe(input);
  if (edited && !previous) throw new Error('Studio edits require a previous authoring artifact.');
  if (previous) {
    if (previous.schema_version !== VERSION || previous.generator_version !== VERSION) throw new Error('Unsupported authoring version; explicit migration required.');
    const {sha256, ...body} = previous;
    if (sha256 !== hash(body)) throw new Error('Authoring artifact integrity mismatch; use --edited for a Studio export.');
    if (previous.recipe.id !== recipe.id) throw new Error('Recipe identity differs from previous artifact.');
    if (!equal(previous.recipe.frame, recipe.frame)) throw new Error('Coordinate frame differs; explicit migration required.');
  }
  const generated = generateNeighborhood(recipe), overrides = new Map((previous?.overrides ?? []).map(item => [key(item.collection, item.id), clone(item)]));
  const approved = new Set(previous?.approved ?? []);
  if (edited) {
    // Reject malformed exports before looking up objects or accepting deletions.
    const findings = validateRegionContract(edited, recipe.id);
    if (findings.length) throw Object.assign(new Error('Edited region is invalid; previous artifact is unchanged.'), {diagnostics: findings});
    if (!equal(edited.bounds_m, previous.region.bounds_m)) throw new Error('Edited bounds require an explicit recipe change.');
    for (const collection of collections) {
      const before = new Map(previous.region[collection].map(item => [item.id, item]));
      const after = new Map((edited[collection] ?? []).map(item => [item.id, item]));
      for (const id of new Set([...before.keys(), ...after.keys()])) if (!equal(before.get(id), after.get(id))) {
        overrides.set(key(collection, id), {...overrides.get(key(collection, id)), collection, id, value: clone(after.get(id) ?? null)});
      }
    }
    for (const id of ['spawn', 'terrain']) if (!equal(previous.region[id], edited[id])) overrides.set(key('@root', id), {collection: '@root', id, value: clone(edited[id])});
  }
  if (previous && overrides.has(key('@root', 'terrain')) && !equal(previous.region.bounds_m, recipe.bounds_m)) {
    throw new Error('Authored terrain cannot change bounds without an explicit spatial migration.');
  }
  const current = edited ?? previous?.region ?? generated.region;
  for (const id of approve) {
    if (typeof id !== 'string' || !all(current).some(item => item.id === id)) throw new Error(`Unknown approval target: ${id}`);
    approved.add(id);
  }
  // Capture approvals as persistent object overrides, including deleted approved objects.
  for (const id of approved) {
    const entry = all(current).find(item => item.id === id);
    if (entry && !overrides.has(key(entry.collection, id))) overrides.set(key(entry.collection, id), clone(entry));
  }
  const region = clone(generated.region);
  for (const override of overrides.values()) {
    const {collection, id, value} = override;
    if (collection === '@root') { region[id] = clone(value); continue; }
    const array = region[collection], index = array.findIndex(item => item.id === id);
    const priorGenerated = previous?.baseline[collection].some(item => item.id === id);
    // Equal geometry is not proof of common lineage. Manual additions (and their
    // tombstones) cannot silently capture a newly introduced generated slot.
    if (index >= 0 && previous && !priorGenerated && override.generated !== true) throw new Error(`Authored ID collision: ${id}`);
    if (index >= 0) array.splice(index, 1);
    if (value) array.push(clone(value));
  }
  for (const collection of collections) region[collection].sort(order);
  const placements = new Map(generated.placements.map(item => [item.id, item]));
  for (const item of previous?.placements ?? []) if (overrides.has(key('buildings', item.id))) placements.set(item.id, clone(item));
  const resolvedPlacements = [...placements.values()].filter(item => region.buildings.some(building => building.id === item.id)).sort(order);
  const findings = validateNeighborhood(region, resolvedPlacements, recipe);
  if (findings.length) throw Object.assign(new Error('Neighborhood conflicts require author review; no candidate applied.'), {diagnostics: findings});
  const savedOverrides = [...overrides.values()].map(item => ({...item, generated: item.generated === true || generated.region[item.collection]?.some(value => value.id === item.id) === true || previous?.baseline[item.collection]?.some(value => value.id === item.id) === true}))
    .sort((a, b) => key(a.collection, a.id) < key(b.collection, b.id) ? -1 : 1);
  const body={schema_version: VERSION, generator_version: VERSION, recipe, baseline: generated.region, region,
    blocks: generated.blocks, placements: resolvedPlacements, overrides: savedOverrides, approved: [...approved].sort(), diagnostics: generated.diagnostics};
  if(recipe.architecture||resolvedPlacements.some(p=>p.architecture))body.diagnostics.push(...compileNeighborhoodArchitecture(body).diagnostics);
  return seal(body);
}
