import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateNeighborhood } from '../../shared/neighborhood/generate.js';
import { buildNeighborhood, canonical } from '../../shared/neighborhood/preserve.js';
import { validateNeighborhood } from '../../shared/neighborhood/validate.js';
import { parseRegion, createStudioDocument } from '../../preview/src/studio/document.js';
import { compileRegionPackage } from '../../server/region-package.js';
import {buildStudioWorld} from '../../preview/src/studio/scene.js';
import {createWalkingEnvironment,createWalkingState} from '../../preview/src/walking.js';

const fixture = () => JSON.parse(readFileSync(new URL('../../config/neighborhoods/garden-blocks.json', import.meta.url)));
const reroll = recipe => ({...recipe, seed: `${recipe.seed}-next`});

test('stock neighborhood arrivals land on a street sidewalk rather than the far site corner',()=>{
  for(const name of ['garden-blocks','garden-market','garden-court']){
    const recipe=JSON.parse(readFileSync(new URL(`../../config/neighborhoods/${name}.json`,import.meta.url))),{region}=generateNeighborhood(recipe);
    assert.ok(Array.isArray(recipe.spawn),`${name}: author an arrival near the shops`);
    assert.deepEqual(region.spawn,recipe.spawn);
    assert.deepEqual(region.places.find(p=>p.id==='arrival-1').position,region.spawn);
    const road=region.roads.find(r=>r.id==='road-west'),[east,north]=region.spawn;
    assert.ok(Math.abs(east-road.points[0][0])>road.width_m/2+.35,'arrival must clear the roadway');
    assert.ok(Math.abs(east-road.points[0][0])<8,'arrival must stay in the sidewalk corridor');
    assert.ok(north>road.points[0][1]+8&&north<road.points.at(-1)[1]-8,'arrival must clear junctions');
    const env=createWalkingEnvironment(buildStudioWorld(region));
    assert.ok(env.isFree(east,-north),'arrival must not begin inside a building');
    const state=createWalkingState(env);
    assert.deepEqual([state.position[0],-state.position[2]],region.spawn,'walking must not silently relocate the arrival');
  }
});

test('recipe arrival is optional for legacy artifacts and never overrides an authored spawn',()=>{
  const recipe=fixture();delete recipe.spawn;
  const old=buildNeighborhood(recipe);
  assert.deepEqual(old.region.spawn,[recipe.bounds_m[0]+2,recipe.bounds_m[1]+2]);
  const configured={...recipe,spawn:[-70,-60]},next=buildNeighborhood(configured);
  assert.deepEqual(next.region.spawn,configured.spawn);
  const edited=structuredClone(next.region);edited.spawn=[-70,-52];
  const kept=buildNeighborhood({...configured,spawn:[-70,-40],seed:'new-arrival'},{previous:next,edited});
  assert.deepEqual(kept.region.spawn,edited.spawn);
  for(const spawn of [[Infinity,0],[0],[0,0,0],[recipe.bounds_m[0],0]])assert.throws(()=>generateNeighborhood({...recipe,spawn}),/arrival|spawn/i);
});

test('connected roads bound four blocks with setback parcels and reusable building placements', () => {
  const recipe = fixture(), result = generateNeighborhood(recipe);
  assert.equal(result.region.roads.length, 6);
  assert.equal(result.blocks.length, 4);
  assert.equal(result.region.parcels.length, 16);
  assert.equal(result.region.buildings.length, 16);
  assert.equal(result.placements.length, 16);
  for (const placement of result.placements) {
    const building = result.region.buildings.find(item => item.id === placement.id);
    const parcel = result.region.parcels.find(item => item.id === placement.parcelId);
    const [w, s, e, n] = parcel.bounds_m;
    assert.ok(building.center[0] - building.size[0] / 2 >= w + 3 - 1e-6);
    assert.ok(building.center[0] + building.size[0] / 2 <= e - 3 + 1e-6);
    assert.ok(building.center[1] - building.size[1] / 2 >= s + 3 - 1e-6);
    assert.ok(building.center[1] + building.size[1] / 2 <= n - 3 + 1e-6);
    assert.ok(recipe.templates.some(item => item.id === placement.templateId));
  }
  assert.deepEqual(validateNeighborhood(result.region, result.placements, recipe), []);
  assert.deepEqual(parseRegion(JSON.stringify(result.region)), result.region);
  assert.equal(compileRegionPackage(result.region, recipe.title).buildings.length, 16);
});

test('same recipe and reordered independent inputs are identical; seeds change choices without moving slots', () => {
  const recipe = fixture(), a = buildNeighborhood(recipe);
  assert.equal(canonical(a), canonical(buildNeighborhood(recipe)));
  assert.equal(canonical(a), canonical(buildNeighborhood({...recipe, streets: [...recipe.streets].reverse(), templates: [...recipe.templates].reverse()})));
  const b = buildNeighborhood(reroll(recipe));
  assert.deepEqual(a.region.parcels, b.region.parcels);
  assert.deepEqual(a.region.buildings.map(x => x.id), b.region.buildings.map(x => x.id));
  assert.notDeepEqual(a.region.buildings, b.region.buildings);
});

test('Studio edits, deletion tombstones, additions and approvals survive repeated generation', () => {
  const recipe = fixture(), first = buildNeighborhood(recipe), doc = createStudioDocument(first.region);
  const [changed, removed, approved] = first.region.buildings;
  doc.update(changed.id, {height: 11});
  doc.remove(removed.id);
  const edited = parseRegion(doc.serialize());
  edited.buildings.push({id: 'handmade-landmark', kind: 'retail', center: [88, 88], size: [6, 6, 9], yaw_deg: 0});
  const second = buildNeighborhood(reroll(recipe), {previous: first, edited, approve: [approved.id]});
  const third = buildNeighborhood({...recipe, seed: 'another-seed'}, {previous: second});
  for (const result of [second, third]) {
    assert.equal(result.region.buildings.find(x => x.id === changed.id).size[2], 11);
    assert.ok(!result.region.buildings.some(x => x.id === removed.id));
    assert.deepEqual(result.region.buildings.find(x => x.id === approved.id), approved);
    assert.deepEqual(result.region.buildings.find(x => x.id === 'handmade-landmark'), edited.buildings.at(-1));
  }
  assert.deepEqual(first.region.buildings[0], changed, 'previous artifact is immutable');
});

test('deleted slot remains suppressed when removed from a recipe and later reintroduced', () => {
  const recipe = fixture(), first = buildNeighborhood(recipe), edited = structuredClone(first.region);
  const removed = edited.buildings.shift();
  const changed = {...recipe, reserved: [{id: 'garden', bounds_m: [-67, -67, -9, -9], reason: 'Handcrafted garden'}]};
  const second = buildNeighborhood(changed, {previous: first, edited});
  const third = buildNeighborhood(recipe, {previous: second});
  assert.ok(!third.region.buildings.some(item => item.id === removed.id));
  assert.ok(third.region.buildings.length > second.region.buildings.length);
});

test('approved geometry conflicts fail with IDs instead of relocating authored work', () => {
  const recipe = fixture(), first = buildNeighborhood(recipe);
  const building = first.region.buildings[0];
  const locked = buildNeighborhood(recipe, {previous: first, approve: [building.id]});
  const moved = structuredClone(recipe);
  moved.streets.find(item => item.id === 'middle').at_m = building.center[0];
  assert.throws(() => buildNeighborhood(moved, {previous: locked}), error =>
    error.diagnostics?.some(item => item.id === building.id && /road|parcel/.test(item.code)));
  assert.deepEqual(locked.region.buildings[0], building);
});

test('geometry diagnostics identify overlap, setback and invalid authored placement', () => {
  const recipe = fixture(), result = generateNeighborhood(recipe), edited = structuredClone(result.region);
  const building = edited.buildings[0];
  building.center = [-76, -40];
  const findings = validateNeighborhood(edited, result.placements, recipe);
  assert.ok(findings.some(item => item.id === building.id && item.code === 'road-clearance'));
  assert.ok(findings.some(item => item.id === building.id && item.code === 'parcel-setback'));
  const overlapped = structuredClone(result.region);
  overlapped.buildings.push({...overlapped.buildings[0], id: 'handmade-copy'});
  assert.ok(validateNeighborhood(overlapped, result.placements, recipe).some(item => item.code === 'building-overlap'));
});

test('invalid recipes and unbounded allocations fail closed', () => {
  for (const change of [
    {seed: ''}, {bounds_m: [-96, -96, Infinity, 96]}, {unknown: true},
    {constraints: {...fixture().constraints, frontage_m: 0}},
    {streets: [...fixture().streets, fixture().streets[0]]},
    {templates: [{id: 'tower', kind: 'retail', size: [12, 12, 99]}]},
    {streets: Array.from({length: 2000}, (_, i) => ({id: `r${i}`, axis: 'north', at_m: i, width_m: 8.4}))},
  ]) assert.throws(() => generateNeighborhood({...fixture(), ...change}), /recipe|budget|height/i);
});

test('mismatched recipe identity, coordinate frames and corrupt artifacts are rejected', () => {
  const recipe = fixture(), previous = buildNeighborhood(recipe);
  assert.throws(() => buildNeighborhood({...recipe, id: 'another'}, {previous}), /identity/i);
  assert.throws(() => buildNeighborhood({...recipe, frame: {...recipe.frame, origin: [1, 2]}}, {previous}), /frame/i);
  assert.throws(() => buildNeighborhood(recipe, {previous: {...previous, schema_version: 99}}), /version/i);
  assert.throws(() => buildNeighborhood(recipe, {previous, approve: ['missing']}), /approval/i);
  const tampered = structuredClone(previous);tampered.region.buildings[0].size[2] = 12;
  assert.throws(() => buildNeighborhood(recipe, {previous: tampered}), /integrity/i);
  assert.throws(() => buildNeighborhood(recipe, {edited: previous.region}), /previous/i);
});

test('roads and sidewalks cannot cut through a handcrafted reservation', () => {
  const recipe = fixture();
  recipe.reserved = [{id: 'pavilion', bounds_m: [-5, -50, 5, -30], reason: 'Approved pavilion footprint'}];
  assert.throws(() => buildNeighborhood(recipe), /reserved.*pavilion|pavilion.*reserved/i);
});

test('no-change regeneration is byte-identical, including after an explicit approval', () => {
  const recipe = fixture(), first = buildNeighborhood(recipe);
  assert.equal(canonical(buildNeighborhood(recipe, {previous: first})), canonical(first));
  const approved = buildNeighborhood(recipe, {previous: first, approve: [first.region.buildings[0].id]});
  assert.equal(canonical(buildNeighborhood(recipe, {previous: approved})), canonical(approved));
});

test('physical authored road and sidewalk extents must stay inside the region', () => {
  const recipe = fixture(), first = buildNeighborhood(recipe), edited = structuredClone(first.region);
  edited.roads.push({id: 'edge-road', name: 'Edge road', kind: 'residential', width_m: 16, points: [[95, -90], [95, 90]]});
  assert.throws(() => buildNeighborhood(recipe, {previous: first, edited}), error =>
    error.diagnostics?.some(item => item.code === 'road-bounds' && item.id === 'edge-road'));
});

test('editing a retained approved road while its generating guide is absent retains slot lineage', () => {
  const recipe = fixture(), first = buildNeighborhood(recipe, {approve: ['road-east']});
  const narrower = {...recipe, streets: recipe.streets.filter(item => item.id !== 'east')};
  const second = buildNeighborhood(narrower, {previous: first});
  const edited = structuredClone(second.region);edited.roads.find(item => item.id === 'road-east').name = 'Authored name';
  const third = buildNeighborhood(narrower, {previous: second, edited});
  const restored = buildNeighborhood(recipe, {previous: third});
  assert.equal(restored.region.roads.find(item => item.id === 'road-east').name, 'Authored name');
});

test('unchanged Studio export does not freeze generated objects against a new height constraint', () => {
  const recipe = fixture(), first = buildNeighborhood(recipe);
  const lower = {...recipe, constraints: {...recipe.constraints, max_height_m: 8}, templates: recipe.templates.map(item => ({...item, size: [item.size[0], item.size[1], 8]}))};
  const direct = buildNeighborhood(lower, {previous: first});
  assert.equal(canonical(buildNeighborhood(lower, {previous: first, edited: first.region})), canonical(direct));
});

test('bounds changes cannot silently move or stretch authored terrain', () => {
  const recipe = fixture(), first = buildNeighborhood(recipe), edited = structuredClone(first.region);
  edited.terrain.heights_m[6] = 1;
  const authored = buildNeighborhood(recipe, {previous: first, edited});
  assert.throws(() => buildNeighborhood({...recipe, bounds_m: [-106, -106, 106, 106]}, {previous: authored}), /terrain.*bounds|bounds.*terrain/i);
});

test('a manual object cannot silently claim a newly generated ID even when its geometry happens to match', () => {
  const recipe = fixture(), full = generateNeighborhood(recipe);
  const narrower = {...recipe, streets: recipe.streets.filter(item => item.id !== 'east')};
  const first = buildNeighborhood(narrower), edited = structuredClone(first.region);
  edited.buildings.push(full.region.buildings.find(item => item.id === 'h-middle-south-0-0'));
  const second = buildNeighborhood(narrower, {previous: first, edited});
  assert.throws(() => buildNeighborhood(recipe, {previous: second}), /Authored ID collision/);
});

test('valid legacy region exports with omitted optional parcels do not crash approval lookup', () => {
  const recipe = fixture(), first = buildNeighborhood(recipe), edited = structuredClone(first.region);
  delete edited.parcels;edited.buildings = [];
  const result = buildNeighborhood(recipe, {previous: first, edited, approve: ['road-east']});
  assert.deepEqual(result.region.buildings, []);
  assert.deepEqual(result.region.parcels, []);
  assert.ok(result.approved.includes('road-east'));
});
