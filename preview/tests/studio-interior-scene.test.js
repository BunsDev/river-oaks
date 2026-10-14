import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { previewBuildingInteriorPlan } from '../src/studio/interior-plan.js';
import { createInteriorLevelPreview, showInteriorPreview } from '../src/studio/interior-scene.js';
import { createStudioScene, disposeStudioScene } from '../src/studio/scene.js';

const sample = JSON.parse(readFileSync(new URL('../public/data/sample-region.json', import.meta.url)));
sample.buildings[0].interior = { name: 'Moon Pavilion Gallery', category: 'art', entrance: 'south',
  generation: { version: 1, levels: 2 } };

test('Studio level preview follows approved local geometry and keeps the stair opening clear', () => {
  const plan = previewBuildingInteriorPlan(sample, sample.buildings[0].id);
  const preview = createInteriorLevelPreview(plan);
  assert.deepEqual([...preview.levels.keys()], [0, 1]);
  showInteriorPreview(preview, 1, { fixtures: false });
  assert.equal(preview.levels.get(0).root.visible, false);
  assert.equal(preview.levels.get(1).root.visible, true);
  assert.equal(preview.levels.get(1).layers.get('fixtures').visible, false);
  assert.equal(preview.levels.get(1).layers.get('shell').visible, true);
  const upper = plan.levels[1], shell = preview.levels.get(1).layers.get('shell');
  assert.equal(preview.levels.get(1).layers.get('partitions').children.length, 0,
    'an empty partition layer does not contain exterior walls');
  assert.equal(shell.children.filter(object => object.geometry?.type === 'BoxGeometry').length,
    upper.layers.shell[0].localFloor.length, 'perimeter walls belong to the shell layer');
  assert.ok(shell.getObjectByName(upper.layers.shell[0].id));
  assert.ok(preview.levels.get(1).layers.get('fixtures').getObjectByName(upper.layers.fixtures[0].id));
  preview.group.updateMatrixWorld(true);
  const floor = shell.getObjectByName(upper.layers.shell[0].id);
  const ray = new THREE.Raycaster();
  const cast = ([u, v]) => {
    ray.set(new THREE.Vector3(u, 8, -v), new THREE.Vector3(0, -1, 0));
    return ray.intersectObject(floor).length;
  };
  const room = upper.layers.shell[0].localFloor;
  const center = room.reduce((sum, [u, v]) => [sum[0] + u / room.length, sum[1] + v / room.length], [0, 0]);
  assert.equal(cast(center), 1, 'room floor is rendered');
  assert.equal(cast(upper.portals.find(portal => portal.kind === 'stairs').localPosition), 0,
    'the approved stair opening is not covered by a preview floor');
  const groundFloor = preview.levels.get(0).layers.get('shell').getObjectByName(plan.levels[0].layers.shell[0].id);
  ray.set(new THREE.Vector3(upper.portals.find(portal => portal.kind === 'stairs').localPosition[0], 8,
    -upper.portals.find(portal => portal.kind === 'stairs').localPosition[1]), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(groundFloor).length, 1, 'ground level supports the stair landing');
  showInteriorPreview(preview, null);
  assert.equal(preview.levels.get(1).root.visible, false);
  assert.throws(() => showInteriorPreview(preview, 9), /generated level/);
});

test('Studio swaps the exterior block for the selected physical level and restores it for walking', () => {
  const plan = previewBuildingInteriorPlan(sample, sample.buildings[0].id);
  const scene = createStudioScene(sample);
  const view = scene.interiorViews.get(sample.buildings[0].id);
  assert.ok(view);
  assert.equal(view.exterior.visible, true);
  scene.setInteriorView({ buildingId: sample.buildings[0].id, levelIndex: 1, layers: { fixtures: false } });
  assert.equal(view.exterior.visible, false);
  assert.equal(view.preview.levels.get(1).root.visible, true);
  assert.equal(view.preview.levels.get(0).root.visible, false);
  assert.equal(view.preview.levels.get(1).layers.get('fixtures').visible, false);
  scene.group.updateMatrixWorld(true);
  const floor = view.preview.levels.get(1).layers.get('shell').getObjectByName(plan.levels[1].layers.shell[0].id);
  const bounds = new THREE.Box3().setFromObject(floor);
  assert.ok(Math.abs(bounds.min.y - (plan.levels[1].floorElevation + 0.035)) < 0.001);
  const footprint = plan.levels[1].rooms[0].footprint;
  assert.ok(Math.abs(bounds.min.x - Math.min(...footprint.map(point => point[0]))) < 0.001);
  assert.ok(Math.abs(bounds.max.x - Math.max(...footprint.map(point => point[0]))) < 0.001);
  assert.ok(Math.abs(bounds.min.z + Math.max(...footprint.map(point => point[1]))) < 0.001);
  assert.ok(Math.abs(bounds.max.z + Math.min(...footprint.map(point => point[1]))) < 0.001);
  scene.setWalk(true);
  assert.equal(view.exterior.visible, true);
  assert.equal(view.preview.levels.get(1).root.visible, false);
  scene.setWalk(false);
  assert.equal(view.preview.levels.get(1).root.visible, true);
  scene.setInteriorView(null);
  assert.equal(view.exterior.visible, true);
  disposeStudioScene(scene.group);
});


test('authored overrides render their resolved position and material with a separate selection outline', () => {
  const region = structuredClone(sample), building = region.buildings[0];
  building.interior.generation.overrides = [{ targetId: `${building.id}/l0/object/wall-display`,
    position: [-4.45, -1], material: 'oak' }];
  const plan = previewBuildingInteriorPlan(region, building.id);
  const preview = createInteriorLevelPreview(plan), level = preview.levels.get(0);
  const mesh = level.layers.get('fixtures').getObjectByName(`${building.id}/l0/object/wall-display`);
  assert.equal(mesh.material.color.getHexString(), 'b78b5e');
  assert.ok(Math.abs(mesh.position.x + 4.45) < 1e-8);
  assert.ok(Math.abs(mesh.position.z - 1) < 1e-8);
  const outline = level.layers.get('authoredOverrides').children[0];
  assert.equal(outline.name, `${mesh.name}/override`);
  assert.deepEqual(outline.position, mesh.position);
  showInteriorPreview(preview, 0, { authoredOverrides: false });
  assert.equal(level.layers.get('authoredOverrides').visible, false);
  assert.equal(level.layers.get('fixtures').visible, true, 'hiding edit markers does not undo the furnishing');
  disposeStudioScene(preview.group);
});
