import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createStudioDocument, parseRegion } from '../src/studio/document.js';
import { createSpace } from '../src/studio/space-templates.js';
import { compileRegionPackage, editableRegionFromWorld } from '../../server/region-package.js';

const sample = JSON.parse(readFileSync(new URL('../public/data/sample-region.json', import.meta.url)));
const interior = { name: 'Moon Pavilion Gallery', category: 'art', entrance: 'south',
  generation: { version: 1, seed: 'moon-gallery-01', levels: 1 } };
const storage = () => { const entries = new Map(); return { getItem: key => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value) }; };

test('Studio previews the exact server plan and keeps level edits through undo, save, reopen and export', () => {
  const doc = createStudioDocument(sample), buildingId = sample.buildings[0].id;
  const first = doc.previewBuildingInterior(buildingId, interior);
  assert.equal(first.levels.length, 1);
  assert.equal(doc.dirty, false, 'preview does not mutate the document');
  doc.setBuildingInterior(buildingId, interior);
  const two = { ...interior, generation: { ...interior.generation, levels: 2 } };
  const preview = doc.previewBuildingInterior(buildingId, two);
  assert.equal(preview.levels.length, 2);
  assert.equal(preview.levels[0].id, first.levels[0].id);
  assert.equal(preview.levels[0].floorElevation, first.levels[0].floorElevation);
  assert.deepEqual(preview.levels[0].rooms, first.levels[0].rooms);
  assert.deepEqual(preview.levels[0].layers.fixtures, first.levels[0].layers.fixtures);
  assert.deepEqual(preview.levels[0].layers.finishes, first.levels[0].layers.finishes);
  assert.deepEqual(preview.levels[0].portals[0], first.levels[0].portals[0]);
  assert.equal(preview.levels[0].portals[1].kind, 'stairs', 'the new floor adds a paired route');
  doc.setBuildingInterior(buildingId, two);
  const compiled = compileRegionPackage(doc.value, 'Studio district', { worldId: 'studio-preview' });
  const { approvedSha256, ...approved } = compiled.buildingInteriors[0];
  assert.deepEqual(preview, approved, 'Studio uses the same primitive and entrance as publication');
  assert.deepEqual(editableRegionFromWorld(compiled).buildings[0].interior, two);
  doc.undo(); assert.deepEqual(doc.value.buildings[0].interior, interior);
  doc.redo(); assert.deepEqual(doc.value.buildings[0].interior, two);
  const saved = storage(); doc.save(saved);
  const reopened = createStudioDocument(); assert.equal(reopened.restore(saved), true);
  assert.deepEqual(reopened.value, doc.value);
  assert.deepEqual(parseRegion(doc.serialize()), doc.value);
});

test('Studio rejects impossible extra floors without altering a valid edited building', () => {
  const doc = createStudioDocument(sample), buildingId = sample.buildings[0].id;
  doc.setBuildingInterior(buildingId, interior);
  const before = doc.value;
  assert.throws(() => doc.setBuildingInterior(buildingId, { ...interior,
    generation: { ...interior.generation, levels: 8 } }), /height/);
  assert.deepEqual(doc.value, before);
  assert.equal(doc.canUndo, true);
});

test('opening a legacy furnished space does not add generated levels or change its bytes', () => {
  const space = createSpace('house'), serialized = JSON.stringify(space);
  const doc = createStudioDocument(space);
  assert.equal(JSON.stringify(doc.value), serialized);
  assert.deepEqual(parseRegion(serialized), space);
  assert.throws(() => doc.previewBuildingInterior('house', interior), /existing document format/);
  assert.equal(JSON.stringify(doc.value), serialized);
});
