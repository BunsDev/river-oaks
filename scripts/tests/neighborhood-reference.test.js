import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync } from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import { buildNeighborhood, canonical } from '../../shared/neighborhood/preserve.js';
import { containsWithSetback, validPolygon } from '../../shared/neighborhood/polygon.js';
import {validateAuthoringArtifact} from '../../shared/neighborhood/preserve.js';

function referenceRecipe() {
  const recipe = JSON.parse(readFileSync(new URL('../../config/neighborhoods/garden-blocks.json', import.meta.url)));
  recipe.frame = {crs: 'EPSG:32615', origin: [-95.425, 29.755], source: 'Independent synthetic reference-plan test'};
  recipe.streets = [];
  const ring = [[-60, -10], [-10, -10], [-10, 60], [-60, 60], [-60, -10]];
  recipe.reference = {schema_version: 1, source_sha256: 'a'.repeat(64), frame: structuredClone(recipe.frame),
    controls: Object.fromEntries(['bounds_m', 'constraints', 'templates', 'reserved'].map(key => [key, structuredClone(recipe[key])])),
    source_provenance: {source: 'Synthetic independent geometry'}, source_limitations: ['Not surveyed'],
    roads: [{id: 'reference-road', name: 'Bent road', source_id: 'road:1', kind: 'residential', width_m: 8.4, points: [[-70, -40], [0, -35], [70, -30]]}],
    parcels: [{id: 'reference-parcel', source_id: 'parcel:1', ring, holes: [[[-45, 25], [-40, 25], [-40, 35], [-45, 35], [-45, 25]]]}],
    blocks: [{id: 'reference-block', ring, holes: [], parcelIds: ['reference-parcel'], bounds_m: [-60, -10, -10, 60]}],
    slots: [{id: 'reference-building', parcelId: 'reference-parcel', blockId: 'reference-block', frontageRoadId: 'reference-road',
      options: recipe.templates.map(template => ({templateId: template.id, center: [-35, 8], size: [...template.size], yaw_deg: 0}))}],
    protected: [{id: 'old-landmark', source_id: 'pavilion:1', ring: [[65, 65], [85, 65], [85, 85], [65, 85], [65, 65]], holes: []}],
    terrain: {width: 5, height: 5, heights_m: Array(25).fill(0)}, diagnostics: []};
  recipe.reference.controls.templates.sort((a, b) => a.id.localeCompare(b.id));
  return recipe;
}

test('geographic references retain irregular geometry separately and reroll through the same preservation contract', () => {
  const recipe = referenceRecipe(), first = buildNeighborhood(recipe);
  assert.equal(first.region.parcels.length, 0);
  assert.equal(first.recipe.reference.parcels[0].holes.length, 1);
  assert.deepEqual(first.region.roads[0].points, recipe.reference.roads[0].points);
  const edited = structuredClone(first.region);edited.buildings[0].size[2] = 11;
  const second = buildNeighborhood({...recipe, seed: 'another'}, {previous: first, edited, approve: [edited.buildings[0].id]});
  const third = buildNeighborhood({...recipe, seed: 'third'}, {previous: second});
  assert.equal(third.region.buildings[0].size[2], 11);
  assert.equal(canonical(third), canonical(buildNeighborhood({...recipe, seed: 'third'}, {previous: third})));
});

test('stale source fit controls require recompilation, while a new seed remains usable', () => {
  const recipe = referenceRecipe();
  for (const changed of [{...recipe, bounds_m: [-100, -100, 100, 100]}, {...recipe, constraints: {...recipe.constraints, setback_m: 5}},
    {...recipe, templates: recipe.templates.map(item => ({...item, size: [10, 10, 8]}))}]) assert.throws(() => buildNeighborhood(changed), /fit controls changed/);
  assert.doesNotThrow(() => buildNeighborhood({...recipe, seed: 'reroll'}));
});

test('holes fully enclosed by a footprint and concave notches are rejected independently', () => {
  const exterior = [[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]], building = [[10, 10], [40, 10], [40, 40], [10, 40]];
  const hole = [[20, 20], [25, 20], [25, 25], [20, 25], [20, 20]];
  assert.equal(containsWithSetback({ring: exterior, holes: [hole]}, building, 3), false);
  assert.equal(containsWithSetback({ring: [[0, 0], [50, 0], [50, 50], [30, 50], [30, 20], [20, 20], [20, 50], [0, 50], [0, 0]], holes: []}, building, 3), false);
  assert.equal(containsWithSetback({ring: exterior, holes: []}, building, 3), true);
  assert.equal(validPolygon({ring: exterior, holes: [hole]}), true);
  assert.equal(validPolygon({ring: exterior, holes: [hole, hole]}), false);
});

test('authored buildings cannot invade a source hole or a protected footprint', () => {
  const recipe = referenceRecipe(), first = buildNeighborhood(recipe), edited = structuredClone(first.region);
  edited.buildings[0].center = [-42, 30];
  assert.throws(() => buildNeighborhood(recipe, {previous: first, edited}), error => error.diagnostics?.some(item => item.code === 'parcel-setback'));
  const addition = structuredClone(first.region);
  addition.buildings.push({id: 'new-building', center: [75, 75], size: [8, 8, 8], yaw_deg: 0, kind: 'retail'});
  assert.throws(() => buildNeighborhood(recipe, {previous: first, edited: addition}), error => error.diagnostics?.some(item => item.code === 'protected-footprint'));
});

test('a newly authored road cannot run through a protected landmark', () => {
  const recipe = referenceRecipe(), first = buildNeighborhood(recipe), edited = structuredClone(first.region);
  edited.roads.push({id: 'new-path', name: 'New path', kind: 'footway', width_m: 3, points: [[70, 60], [70, 90]]});
  assert.throws(() => buildNeighborhood(recipe, {previous: first, edited}), error => error.diagnostics?.some(item => item.code === 'protected-road'));
});

test('malformed reference geometry and nonexistent topology fail before producing a candidate', () => {
  for (const mutate of [
    recipe => {recipe.reference.slots[0].parcelId = 'missing';},
    recipe => {recipe.reference.parcels[0].ring = [[0, 0], [30, 30], [0, 30], [30, 0], [0, 0]];},
    recipe => {recipe.reference.slots[0].options[0].center = [-45, 30];},
    recipe => {recipe.reference.source_sha256 = 'not-a-hash';},
    recipe => {recipe.reference.blocks[0].ring = [[65, 65], [85, 65], [85, 85], [65, 85], [65, 65]];},
  ]) {const recipe = referenceRecipe();mutate(recipe);assert.throws(() => buildNeighborhood(recipe), /geographic reference/i);}
});

test('a reference recipe near the input limit cannot export an authoring artifact too large to reopen',t=>{
  const recipe=referenceRecipe(),limit=2*1024*1024;
  recipe.reference.source_provenance.note='';
  recipe.reference.source_provenance.note='x'.repeat(limit-Buffer.byteLength(canonical(recipe))-1);
  assert.equal(Buffer.byteLength(canonical(recipe))+1,limit);
  assert.throws(()=>buildNeighborhood(recipe),/Authoring.*2 MiB/);
  const temporary=mkdtempSync(join(tmpdir(),'ro-authoring-budget-'));t.after(()=>rmSync(temporary,{recursive:true,force:true}));
  const input=join(temporary,'recipe.json'),output=join(temporary,'candidate');
  writeFileSync(input,canonical(recipe)+'\n');
  const result=spawnSync(process.execPath,['scripts/neighborhood.mjs','build','--recipe',input,'--out',output],{
    cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8',
  });
  assert.equal(result.status,1);assert.match(result.stderr,/Authoring.*2 MiB/);assert.equal(existsSync(output),false);
  const normal=buildNeighborhood(referenceRecipe());
  assert.deepEqual(validateAuthoringArtifact(normal),normal);
});
