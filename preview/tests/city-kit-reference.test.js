// Kit streets from a geographic reference: mapped roads inside a site become
// axis-aligned kit streets on the module; what cannot be expressed is reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { referenceRecipe, dominantRotation, REFERENCE_LIMITS } from '../../shared/city-kit/reference.js';
import { assembleNeighborhood, validateRecipe, canonicalJSON } from '../../shared/city-kit/assemble.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fixturePath = join(root, 'preview/tests/fixtures/city-kit-reference-grid.json');
const districtPath = join(root, 'preview/public/data/district.json');
const grid = () => JSON.parse(readFileSync(fixturePath, 'utf8'));
const SITE = [0, 0, 200, 150];
const streetsOf = recipe => Object.fromEntries(recipe.streets.map(street => [street.id, street]));

test('a grid turned 12° is found, turned back, snapped to the module and merged along a mapped way', () => {
  const world = grid();
  assert.deepEqual(dominantRotation(world, SITE), { rotation: 12, aligned: 0.879, length: 387 });
  const recipe = referenceRecipe(world, { id: 'grid-demo', site: SITE, source: { name: 'fixture' } });
  const streets = streetsOf(recipe);
  assert.deepEqual(Object.keys(streets).sort(), ['back-lane', 'cross-street', 'main-street']);
  // Two mapped pieces of Main Street (a 2 m gap between them) become one street the width the map gives.
  assert.deepEqual(streets['main-street'], { id: 'main-street', from: [0, 60], to: [200, 60], lane: 8, sidewalk: 3.5 });
  assert.deepEqual(recipe.reference.streets.find(entry => entry.id === 'main-street').roads, ['way-main-0', 'way-main-1']);
  assert.deepEqual(streets['cross-street'], { id: 'cross-street', from: [100, 0], to: [100, 150], lane: 7, sidewalk: 3.5 });
  assert.deepEqual(streets['back-lane'], { id: 'back-lane', from: [0, 140], to: [200, 140], lane: 5, sidewalk: 3.5 });
  assert.deepEqual(recipe.site, [0, 0, 200, 150]);
  assert.equal(recipe.reference.rotation, 12);
  assert.equal(recipe.reference.buildings, 3, 'the building outside the site is not counted');
  // Every road the kit cannot express is reported with a reason, never silently dropped.
  const dropped = Object.fromEntries(recipe.reference.dropped.map(entry => [`${entry.road}:${entry.reason}`, entry]));
  assert.match(Object.keys(dropped).find(key => key.startsWith('way-bend:bends')), /bends up to 44\.3° off the grid/);
  assert.equal(dropped['way-bend:bends up to 44.3° off the grid'].segments, 7);
  assert.equal(dropped['way-edge:its corridor would leave the site'].length, 200);
  assert.equal(dropped['way-path:its corridor overlaps main-street'].kind, 'footway', 'the wider street keeps the corridor');
  assert.equal(dropped['way-stub:shorter than 20 m inside the site'].length, 12);
  // The skeleton is a valid recipe: one quarter, a placeholder name per derived block, and it assembles.
  validateRecipe(structuredClone(recipe));
  assert.equal(recipe.reference.blocks, 6);
  assert.equal(recipe.layout.quarters[0].names.length, 6);
  assert.equal(recipe.reference.layoutError, null);
  assert.deepEqual(recipe.reference.layoutWarnings, ['quarter 0,146,93,150: too narrow for a bay (4 m)', 'quarter 107,146,200,150: too narrow for a bay (4 m)']);
  const plan = assembleNeighborhood(structuredClone(recipe));
  assert.deepEqual(plan.provenance.layout.blocks.map(block => block.id).sort(), ['quarter-back-lane-north-0', 'quarter-back-lane-north-107', 'quarter-main-street-north-0', 'quarter-main-street-north-107', 'quarter-main-street-south-0', 'quarter-main-street-south-107']);
  assert.match(recipe.inspiration, /Patterns only/);
});

test('the skeleton is deterministic: source order, an explicit rotation and repeated runs change nothing', () => {
  const world = grid(), options = { id: 'grid-demo', site: SITE, source: { name: 'fixture', sha256: 'abc' } };
  const first = canonicalJSON(referenceRecipe(world, options));
  assert.equal(canonicalJSON(referenceRecipe(world, options)), first);
  const shuffled = { ...world, roads: [...world.roads].reverse(), buildings: [...world.buildings].reverse() };
  assert.equal(canonicalJSON(referenceRecipe(shuffled, options)), first, 'road order in the source does not matter');
  assert.equal(canonicalJSON(referenceRecipe(world, { ...options, rotation: 12 })), first, 'the found rotation equals the explicit one');
  const unturned = referenceRecipe(world, { ...options, rotation: 0 });
  assert.equal(unturned.streets.length, 0, 'without the turn every road bends off the kit grid');
  assert.ok(unturned.reference.dropped.every(entry => /bends|shorter/.test(entry.reason)));
  assert.equal(unturned.reference.blocks, 0);
  assert.deepEqual(unturned.layout.quarters[0].names, ['Placeholder shop 1']);
});

test('options choose which roads become streets and are validated', () => {
  const world = grid();
  const paths = referenceRecipe(world, { id: 'paths', site: SITE, kinds: ['footway'] });
  assert.deepEqual(paths.streets.map(street => street.id), ['main-street-path']);
  assert.ok(paths.reference.dropped.some(entry => entry.road === 'way-main-0' && entry.reason === 'kind residential not requested'));
  const wide = referenceRecipe(world, { id: 'wide', site: SITE, sidewalk: 5, tolerance: 1, minimumLength: 5 });
  assert.equal(wide.streets[0].sidewalk, 5);
  assert.ok(wide.streets.some(street => street.id === 'stub-lane'), 'a lower minimum length keeps the stub');
  for (const [options, message] of [
    [{ site: [0, 0, 30, 30] }, /sides must span 40–512 m/],
    [{ site: [0, 0, 600, 100] }, /sides must span/],
    [{ site: [10, 0, 0, 100] }, /site must be/],
    [{ site: SITE, rotation: 120 }, /rotation/],
    [{ site: SITE, tolerance: 0 }, /tolerance/],
    [{ site: SITE, id: 'Bad Id' }, /id Bad Id/],
    [{ site: SITE, style: 'brutalist' }, /style brutalist/],
    [{ site: SITE, kinds: 'footway' }, /kinds must be a list/],
  ]) assert.throws(() => referenceRecipe(world, { id: 'x', ...options }), message);
  assert.throws(() => referenceRecipe({ roads: [{ id: 'a', points: [[0, 0]] }] }, { id: 'x', site: SITE }), /road a points/);
  assert.throws(() => referenceRecipe({ roads: [{ id: 'a', points: [[0, 0], [1, 1]] }, { id: 'a', points: [[0, 0], [1, 1]] }] }, { id: 'x', site: SITE }), /unique/);
  assert.throws(() => referenceRecipe({ roads: Array.from({ length: REFERENCE_LIMITS.roads + 1 }, (_, i) => ({ id: `r${i}`, points: [[0, 0], [1, 1]] })) }, { id: 'x', site: SITE }), /more than/);
});

test('a crop of the bundled District keeps its straight lanes and reports the curved street', () => {
  const world = JSON.parse(readFileSync(districtPath, 'utf8'));
  const recipe = referenceRecipe(world, { id: 'district-crop', site: [-2910, -1400, -2760, -1280], source: { name: 'district.json' } });
  assert.equal(recipe.reference.rotation, -1);
  assert.equal(recipe.streets.length, 5);
  assert.ok(recipe.streets.every(street => street.lane === 8.4 || street.lane === 3), 'lane widths come from the map');
  const westcreek = recipe.reference.dropped.find(entry => entry.name === 'Westcreek Lane');
  assert.match(westcreek.reason, /bends up to 12° off the grid/);
  assert.ok(recipe.reference.dropped.some(entry => /overlaps district-access-lane/.test(entry.reason) && entry.kind === 'footway'), 'a walkway beside a lane yields to the wider corridor');
  assert.ok(recipe.reference.dropped.some(entry => entry.reason === 'its corridor would leave the site'));
  assert.equal(recipe.reference.source.crs, 'EPSG:32615');
  assert.equal(recipe.reference.buildings, 2);
  const plan = assembleNeighborhood(structuredClone(recipe));
  assert.equal(plan.provenance.layout.blocks.length, recipe.reference.blocks);
  assert.ok(recipe.reference.blocks >= 3);
});

test('a World Studio region package is a reference as it is exported: its ring road becomes four streets', () => {
  // preview/public/data/sample-region.json is the Studio sample (schema-v1 creator region: roads with points, width_m, kind).
  const region = JSON.parse(readFileSync(join(root, 'preview/public/data/sample-region.json'), 'utf8'));
  const recipe = referenceRecipe(region, { id: 'sample-region', site: region.bounds_m, source: { name: 'sample-region.json' } });
  assert.equal(recipe.reference.rotation, 0);
  assert.deepEqual(recipe.streets.map(street => [street.id, ...street.from, ...street.to, street.lane]), [
    ['garden-promenade', 30, 30, 162, 30, 4], ['moon-lane', 14, 96, 178, 96, 8.4], ['garden-promenade-2', 30, 162, 162, 162, 4], ['garden-promenade-3', 30, 30, 30, 162, 4], ['garden-promenade-4', 162, 30, 162, 162, 4]]);
  assert.deepEqual(recipe.reference.dropped, []);
  assert.equal(recipe.reference.source.crs, 'LOCAL:METRES', 'a region without a CRS is local metres');
  assert.equal(recipe.reference.buildings, 4);
  assert.deepEqual(recipe.reference.parcels, { source: 'quarters', quarters: [], dropped: [] }, 'the sample draws no parcels, so one quarter covers the site');
  assert.ok(recipe.reference.blocks > 4, 'the whole sample is more than one recipe holds; the budget line says so');
  validateRecipe(structuredClone(recipe));
});

test('parcels from the Studio neighborhood compiler become quarters, so a drawing decides where kit blocks go', () => {
  // A real candidate from the Studio-side compiler, built here: a lattice of six roads and sixteen 30 m parcels.
  const dir = mkdtempSync(join(tmpdir(), 'city-kit-parcels-')), candidate = join(dir, 'garden-001');
  execFileSync(process.execPath, [join(root, 'scripts/neighborhood.mjs'), 'build', '--recipe', join(root, 'config/neighborhoods/garden-blocks.json'), '--out', candidate], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const region = JSON.parse(readFileSync(join(candidate, 'region.json'), 'utf8'));
  assert.equal(region.parcels.length, 16);
  // The south-west block with its four bounding streets: four parcels, four quarters, four blocks.
  const recipe = referenceRecipe(region, { id: 'garden-sw', site: [-96, -96, 8, 8], source: { name: 'region.json' } });
  assert.deepEqual(recipe.streets.map(street => street.id).sort(), ['cross', 'middle', 'south', 'west']);
  const quarters = recipe.reference.parcels.quarters;
  assert.deepEqual(quarters.map(entry => [entry.id, ...entry.rect]), [
    ['p-west-south-0-0', 27.7, 27.7, 58, 58], ['p-west-south-0-1', 58, 27.7, 88.3, 58], ['p-west-south-1-0', 27.7, 58, 58, 88.3], ['p-west-south-1-1', 58, 58, 88.3, 88.3]]);
  // The compiler keeps its parcels its own sidewalk width (8.16 m) from the road; the kit's corridor ends at 7.7 m, so the edge is moved onto it.
  assert.deepEqual(quarters[0].snapped, ['west 28 to 27.7 (west)', 'south 28 to 27.7 (south)']);
  assert.deepEqual(quarters[3].snapped, ['east 88 to 88.3 (middle)', 'north 88 to 88.3 (cross)']);
  assert.equal(recipe.reference.parcels.dropped.length, 12);
  assert.ok(recipe.reference.parcels.dropped.every(entry => entry.reason === 'outside the site'));
  assert.deepEqual(recipe.layout.quarters.map(quarter => [quarter.id, quarter.names.length]), [['p-west-south-0-0', 1], ['p-west-south-0-1', 1], ['p-west-south-1-0', 1], ['p-west-south-1-1', 1]]);
  assert.equal(recipe.reference.blocks, 4);
  assert.equal(recipe.reference.openLand, 2502.85, 'the band between the site edge and the streets stays open');
  assert.ok(recipe.reference.layoutWarnings.every(warning => warning.startsWith('open land ')), 'nothing but open land is reported');
  const plan = assembleNeighborhood(structuredClone(recipe));
  assert.deepEqual(plan.provenance.layout.blocks.map(block => `${block.id}:${block.front}`), ['p-west-south-0-0:south', 'p-west-south-0-1:south', 'p-west-south-1-0:north', 'p-west-south-1-1:north']);
  assert.ok(plan.stats.triangles < 260000);
  // Ignoring the parcels lays one quarter over the site, with the same streets.
  const single = referenceRecipe(region, { id: 'garden-sw', site: [-96, -96, 8, 8], parcels: 'ignore' });
  assert.deepEqual(single.layout.quarters.map(quarter => quarter.id), ['quarter']);
  assert.deepEqual(single.reference.parcels, { source: 'ignore', quarters: [], dropped: [] });
  assert.equal(single.reference.blocks, 4);
  // The whole candidate: sixteen quarters, sixteen blocks, and the budget line says that is too many for one recipe.
  const whole = referenceRecipe(region, { id: 'garden', site: region.bounds_m });
  assert.equal(whole.reference.parcels.quarters.length, 16);
  assert.equal(whole.reference.blocks, 16);
  assert.ok(assembleNeighborhood(structuredClone(whole)).stats.triangles > 260000);
  // A parcel cut by the site edge keeps the part inside; a sliver thinner than a bay is dropped with its size.
  const cut = referenceRecipe(region, { id: 'garden-cut', site: [-96, -96, 30, 8] });
  assert.deepEqual(cut.reference.parcels.quarters.find(entry => entry.id === 'p-middle-south-0-0').rect, [103.7, 27.7, 126, 58]);
  const sliver = referenceRecipe(region, { id: 'garden-sliver', site: [-96, -96, 11, 8] });
  assert.deepEqual(sliver.reference.parcels.dropped.find(entry => entry.parcel === 'p-middle-south-0-0'), { parcel: 'p-middle-south-0-0', reason: 'only 3.3 × 30.3 m inside the site' });
  assert.throws(() => referenceRecipe(region, { id: 'x', site: [-96, -96, 8, 8], parcels: 'blocks' }), /parcels must be quarters or ignore/);
  assert.throws(() => referenceRecipe({ ...region, parcels: [region.parcels[0], region.parcels[0]] }, { id: 'x', site: [-96, -96, 8, 8] }), /parcel ids must be unique/);
  // The CLI says what the parcels became.
  const text = execFileSync(process.execPath, [join(root, 'scripts/destination.mjs'), 'reference', join(candidate, 'region.json'), '--site=-96,-96,8,8', '--id', 'garden-sw', '--out', join(dir, 'garden-sw.json')], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(text, /parcels: 4 mapped parcels are quarters \(p-west-south-0-0, p-west-south-0-1, p-west-south-1-0, p-west-south-1-1\); 2502\.85 m² outside them stays open/);
  assert.match(text, /parcel p-west-south-0-0: west 28 to 27\.7 \(west\) edge snapped to the street/);
  assert.match(text, /4 streets, \d+ roads dropped, 4 blocks from one quarter with placeholder names|4 blocks/);
});

test('destination reference writes the skeleton with the source hash, and build accepts it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'city-kit-reference-')), out = join(dir, 'grid-demo.json');
  const run = args => execFileSync(process.execPath, [join(root, 'scripts/destination.mjs'), ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const full = run(['reference', fixturePath, '--site', '0,0,200,150', '--id', 'grid-demo', '--out', join(dir, 'full.json')]);
  assert.match(full, /grid turned 12° \(88% of 387 m of road inside the site runs with it\)/);
  assert.match(full, /main-street\t0,60\t200,60\t8\t2× Main Street/);
  assert.match(full, /budget: 4\d\d\d\d\d of 260000 triangles \(over: narrow the site or split it into several recipes\); 6 blocks/);
  assert.match(full, /3 streets, 5 roads dropped, 6 blocks from one quarter with placeholder names/);
  // A site the budget holds builds as written, with the source hash in its provenance.
  const text = run(['reference', fixturePath, '--site=40,20,160,110', '--id', 'grid-demo', '--out', out]);
  assert.match(text, /budget: 1\d\d\d\d\d of 260000 triangles; 4 blocks/);
  const recipe = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(recipe.reference.source.sha256, createHash('sha256').update(readFileSync(fixturePath)).digest('hex'));
  assert.equal(recipe.reference.source.name, 'city-kit-reference-grid.json');
  assert.deepEqual(recipe.streets.map(street => street.id), ['main-street', 'cross-street']);
  const built = run(['build', out, '--out', join(dir, 'build')]);
  assert.match(built, /"budgetsWithin": true/); assert.match(built, /"warnings": 0/);
  assert.ok(existsSync(join(dir, 'build', 'plan.svg')));
  assert.ok(existsSync(join(dir, 'build', 'layout.json')));
  assert.throws(() => run(['reference', fixturePath, '--id', 'x']), /Pass --site/);
  writeFileSync(join(dir, 'bad.json'), '{"roads":"none"}');
  assert.throws(() => run(['reference', join(dir, 'bad.json'), '--site', '0,0,100,100']), /no roads array/);
});
