import test from 'node:test';
import assert from 'node:assert/strict';
import { blankRegion, editableRegion, mapPoint, nextRegionId, regionPoint, terrainIndex } from '../src/region-draft.js';
import { compileRegionPackage } from '../../server/region-package.js';

test('a blank editor draft is publishable and map coordinates preserve the world orientation', () => {
  const draft = blankRegion();
  assert.equal(editableRegion(draft), true);
  const world = compileRegionPackage(draft, 'New World');
  assert.equal(world.communityLocations.length, 4);
  assert.deepEqual(regionPoint(draft, mapPoint(draft, [-36, 54])), [-36, 54]);
  assert.equal(terrainIndex(draft, [-96, -96]), 0);
  assert.equal(terrainIndex(draft, [96, 96]), 80);
  assert.equal(nextRegionId(draft, 'place'), 'place-1');
  draft.places.push({ id: 'place-1', name: 'New Place', position: [12, 12] });
  assert.equal(nextRegionId(draft, 'place'), 'place-2');
});

test('the editor refuses imported geometry it cannot safely edit or publish', () => {
  const draft = blankRegion();
  assert.equal(editableRegion({ ...draft, roads: [] }), false);
  assert.equal(editableRegion({ ...draft, terrain: { ...draft.terrain, heights_m: [0] } }), false);
  assert.equal(editableRegion({ ...draft, places: [{ ...draft.places[0], id: draft.roads[0].id }, ...draft.places.slice(1)] }), false);
  assert.equal(editableRegion({ ...draft, buildings: [{ id: 'edge-hall', center: [92, 0], size: [20, 12, 9], yaw_deg: 30, kind: 'residential' }] }), false);
  assert.equal(editableRegion({ ...draft, buildings: [{ id: 'arrival-hall', center: draft.spawn, size: [12, 12, 9], yaw_deg: 0, kind: 'residential' }] }), false);
});
