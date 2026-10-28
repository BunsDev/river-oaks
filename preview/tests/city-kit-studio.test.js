// A city-kit plan opens in World Studio: the exporter writes a schema-v1 region
// that Studio's own parser and the server's region package compiler accept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { studioRegion, STUDIO_LIMITS } from '../../shared/city-kit/studio.js';
import { assembleNeighborhood, canonicalJSON } from '../../shared/city-kit/assemble.js';
import { parseRegion, createStudioDocument, studioItems } from '../src/studio/document.js';
import { editableRegion } from '../src/region-draft.js';
import { compileRegionPackage } from '../../server/region-package.js';

const root = fileURLToPath(new URL('../..', import.meta.url)), recipesDir = join(root, 'config/destinations');
const recipe = name => JSON.parse(readFileSync(join(recipesDir, `${name}.json`), 'utf8'));

test('the layout example opens as a Studio region: streets, massing, trees, places and parcels on the kit grid', () => {
  const source = recipe('layout-grid-example'), plan = assembleNeighborhood(structuredClone(source));
  const { region, title, bytes, omitted, summary } = studioRegion(source, plan);
  assert.equal(title, 'layout-grid-example');
  assert.deepEqual(region.bounds_m, [-2, -2, 122, 109], 'the site padded by the 2 m margin Studio needs around buildings');
  assert.deepEqual(summary, { roads: 3, buildings: 44, omitted: 0, trees: 46, places: 6, parcels: 3, spawn: [30, 55.5] });
  assert.deepEqual(omitted, []);
  assert.ok(bytes < STUDIO_LIMITS.bytes);
  // Streets keep their lanes; a lane under 6 m is a footway.
  assert.deepEqual(region.roads.map(road => [road.id, road.kind, road.width_m, ...road.points.flat()]), [
    ['main', 'residential', 7, 0, 50, 120, 50], ['cross', 'residential', 6, 60, 0, 60, 107], ['back-lane', 'footway', 5, 0, 102, 120, 102]]);
  // Every shell becomes a box of its footprint and height, named by its stable piece id.
  const corner = region.buildings.find(building => building.id === 'south-row-parcel-0');
  const shell = plan.pieces.find(piece => piece.id === 'layout-grid-example/south-row/parcel-0');
  assert.deepEqual(corner.center, [(shell.rect[0] + shell.rect[2]) / 2, (shell.rect[1] + shell.rect[3]) / 2]);
  assert.deepEqual(corner.size, [shell.rect[2] - shell.rect[0], shell.rect[3] - shell.rect[1], shell.height]);
  assert.equal(corner.kind, 'retail');
  // The hand-placed landmark, both plazas and the streets are places; the blocks are parcels.
  assert.deepEqual(region.places.map(place => place.id), ['green-water-tower', 'green', 'lawn', 'main-street', 'cross-street', 'back-lane-street']);
  assert.equal(region.places[0].name, 'Example water tower');
  assert.deepEqual(region.parcels.map(parcel => parcel.id), ['north-row-back-lane-north-0-block', 'north-row-main-south-0-block', 'south-row-block']);
  assert.deepEqual(region.parcels[2].bounds_m, plan.provenance.layout.blocks.find(block => block.id === 'south-row').rect);
  // Studio's parser, its editable-region rules and the server's package compiler all accept it; the document lists the items.
  assert.ok(editableRegion(structuredClone(region)));
  const parsed = parseRegion(JSON.stringify(region));
  const doc = createStudioDocument(parsed);
  assert.equal(studioItems(doc.value).filter(item => item.type === 'building').length, 44);
  const pkg = compileRegionPackage(parsed, title);
  assert.equal(pkg.buildings.length, 44);
  assert.equal(pkg.roads.length, 3);
  // Deterministic: the same plan gives the same region.
  assert.equal(canonicalJSON(studioRegion(source, assembleNeighborhood(structuredClone(source))).region), canonicalJSON(region));
});

test('every committed recipe exports a region Studio and the server accept; thin rear wings and outside context are listed, not widened', () => {
  const names = readdirSync(recipesDir).filter(name => name.endsWith('.json') && !name.endsWith('.lock.json')).map(name => name.replace(/\.json$/, ''));
  assert.equal(names.length, 16);
  const report = {};
  for (const name of names) {
    const source = recipe(name), plan = assembleNeighborhood(structuredClone(source));
    const { region, title, omitted } = studioRegion(source, plan);
    compileRegionPackage(parseRegion(JSON.stringify(region)), title);
    report[name] = { buildings: region.buildings.length, omitted: omitted.length, reasons: [...new Set(omitted.map(entry => entry.reason))] };
    for (const entry of omitted) assert.ok(entry.reason === 'under 4 m a side' ? entry.size.some(side => side < 4) : entry.reason === 'context beyond the region');
  }
  assert.deepEqual(report['heights-boulevard-north'], { buildings: 14, omitted: 7, reasons: ['under 4 m a side'] });
  assert.deepEqual(report['bayou-market-commons'].reasons, ['context beyond the region']);
  assert.equal(report['bayou-greenway'].buildings, 0, 'a greenway with no buildings still opens: its places are its plazas and streets');
});

test('the exporter refuses what Studio would refuse, with the reason', () => {
  const source = recipe('layout-grid-example'), plan = assembleNeighborhood(structuredClone(source));
  assert.throws(() => studioRegion(source, plan, { spawn: [500, 500] }), /arrival 500,500 is not 1 m inside/);
  const shell = plan.pieces.find(piece => piece.id === 'layout-grid-example/south-row/parcel-0');
  assert.throws(() => studioRegion(source, plan, { spawn: [(shell.rect[0] + shell.rect[2]) / 2, (shell.rect[1] + shell.rect[3]) / 2] }), /stands inside south-row-parcel-0/);
  assert.throws(() => studioRegion({ ...source, streets: [] }, { ...plan, pieces: plan.pieces.filter(piece => !piece.piece.startsWith('building/')) }), /at least one street/);
  assert.throws(() => studioRegion(source, { ...plan, site: [0, 0, 600, 107] }), /region must span 40–512 m/);
  const crowded = { ...plan, pieces: [...plan.pieces, ...Array.from({ length: 40 }, (_, i) => ({ ...shell, id: `layout-grid-example/extra/parcel-${i}` }))] };
  assert.throws(() => studioRegion(source, crowded), /84 buildings exceed Studio's 80; split the recipe/);
});

test('destination build writes studio-region.json beside the plan and says how to open it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'city-kit-studio-')), out = join(dir, 'build');
  const text = execFileSync(process.execPath, [join(root, 'scripts/destination.mjs'), 'build', join(recipesDir, 'nineteenth-and-yale.json'), '--out', out], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const summary = JSON.parse(text);
  assert.deepEqual(summary.studio, { roads: 2, buildings: 43, omitted: 0, trees: 46, places: 4, parcels: 4, spawn: [28.75, 69.5], bytes: summary.studio.bytes, file: 'studio-region.json' });
  assert.ok(existsSync(join(out, 'studio-region.json')));
  const region = JSON.parse(readFileSync(join(out, 'studio-region.json'), 'utf8'));
  compileRegionPackage(parseRegion(JSON.stringify(region)), 'nineteenth-and-yale');
  const preview = execFileSync(process.execPath, [join(root, 'scripts/destination.mjs'), 'preview', join(recipesDir, 'nineteenth-and-yale.json')], { cwd: root, encoding: 'utf8' });
  assert.match(preview, /World Studio: pnpm run destination build .* then Open JSON on studio-region\.json/);
});
