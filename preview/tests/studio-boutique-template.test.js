import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeStudioScene } from '../src/studio/scene.js';
import { createSpaceScene } from '../src/studio/space-scene.js';
import { createSpace, spaceAssessmentContext } from '../src/studio/space-templates.js';
import { assessSpace } from '../src/studio/space-assessment.js';

// #418 Atelier Boutique on the Garden Office baseline: one display family, contact,
// retail light and fitting-room mirrors.
const boutique = createSpace('boutique'), byId = id => boutique.objects.find(o => o.id === id);
const radians = degrees => degrees * Math.PI / 180;
const facing = o => [Math.sin(radians(o.yaw)), -Math.cos(radians(o.yaw))];
const backPoint = o => { const [e, n] = facing(o); return [o.east - e * o.depth / 2, o.north - n * o.depth / 2]; };
function distanceTo(o, [east, north]) {
  const angle = radians(o.yaw), c = Math.cos(angle), s = Math.sin(angle), dx = east - o.east, dy = north - o.north;
  return Math.hypot(Math.max(0, Math.abs(dx * c + dy * s) - o.width / 2), Math.max(0, Math.abs(-dx * s + dy * c) - o.depth / 2));
}
const solidWalls = space => space.objects.filter(o => o.kind === 'wall');
const nearestWall = (space, point) => Math.min(...solidWalls(space).map(wall => distanceTo(wall, point)));
const meshesOf = root => { const list = []; root.traverse(child => { if (child.isMesh) list.push(child); }); return list; };
const withScene = (space, check) => {
  const scene = createSpaceScene(space);scene.group.updateMatrixWorld(true);
  try { return check(scene); } finally { disposeStudioScene(scene.group); }
};
const item = (kind, patch) => ({ id: kind, kind, label: kind, east: 0, north: 0, width: 1.6, depth: .7, height: 2.1, yaw: 0, elevation: 0, finish: 'walnut', ...patch });
const room = objects => ({ ...boutique, objects });

test('Atelier Boutique keeps its program, route roles and passing required routes', () => {
  for (const id of ['display-table-one', 'checkout', 'fitting-chair-one', 'fitting-chair-two']) assert.ok(byId(id), `${id} kept`);
  const result = assessSpace(boutique, spaceAssessmentContext('boutique'));
  assert.equal(result.status, 'passed', JSON.stringify(result.findings));
});

// Raised furnishings stand on something: their base meets the top of an object below.
// Pendants hang, wall art and mirrors hang on walls, and glazing is architecture except a
// raised display case (deeper than 0.3 m), which stands on its counter.
test('every raised furnishing in a stock template rests on the one below it', () => {
  for (const id of ['house', 'office', 'boutique', 'cafe']) {
    const space = createSpace(id);
    for (const o of space.objects.filter(o => o.elevation > 0 && !['pendant', 'art'].includes(o.kind) && (o.kind !== 'glazing' || o.depth > .3))) {
      const support = space.objects.filter(s => s !== o && s.elevation + s.height <= o.elevation + .03 && distanceTo(s, [o.east, o.north]) === 0)
        .sort((a, b) => (b.elevation + b.height) - (a.elevation + a.height))[0];
      assert.ok(support, `${id}: ${o.id} has nothing under it`);
      const gap = o.elevation - (support.elevation + support.height);
      assert.ok(Math.abs(gap) <= .005, `${id}: ${o.id} is ${(gap * 100).toFixed(1)} cm above ${support.id}`);
    }
    // Art standing on a plinth (not hung on a wall) rests on it too.
    for (const o of space.objects.filter(o => o.kind === 'art' && o.elevation > 0 && nearestWall(space, [o.east, o.north]) > .2)) {
      const support = space.objects.find(s => s !== o && s.kind !== 'floor' && distanceTo(s, [o.east, o.north]) === 0);
      assert.ok(support && Math.abs(o.elevation - support.elevation - support.height) <= .005, `${id}: ${o.id} floats over ${support?.id}`);
    }
  }
});

test('one display family: walnut shelving and checkout, stone plinths, displays on solid walls', () => {
  const shelves = boutique.objects.filter(o => o.kind === 'shelf');
  assert.ok(shelves.length >= 5, 'wall displays kept');
  assert.deepEqual([...new Set(shelves.map(o => o.finish))], ['walnut'], 'wall displays share one timber');
  assert.equal(byId('checkout-storage').finish, byId('checkout').finish, 'checkout storage matches the counter');
  for (const o of shelves) assert.ok(nearestWall(boutique, backPoint(o)) <= .1, `${o.id}: back ${nearestWall(boutique, backPoint(o)).toFixed(2)} m from a wall`);
  // The fitting rooms close on solid walls, not the façade glass.
  const fitting = byId('fitting-floor'), east = fitting.east + fitting.width / 2;
  for (const glass of boutique.objects.filter(o => o.kind === 'glazing' && o.elevation === 0 && o.height >= 2 && o.yaw % 180)) {
    const along = [glass.north - glass.width / 2, glass.north + glass.width / 2];
    assert.ok(!(Math.abs(glass.east - east) < .3 && along[1] > fitting.north - fitting.depth / 2 + .05), `${glass.id} glazes a fitting room`);
  }
});

test('stone cabinets are solid plinths; timber cabinets keep doors', () => {
  withScene(room([item('cabinet', { finish: 'limestone', width: 1.5, depth: .8, height: .55 }), item('cabinet', { id: 'drawers', finish: 'walnut', east: 3, width: .6, depth: .55, height: .55 })]), scene => {
    const plinth = meshesOf(scene.items.get('cabinet')), drawers = meshesOf(scene.items.get('drawers'));
    assert.equal(plinth.filter(mesh => mesh.name === 'Door').length, 0, 'a plinth has no doors');
    assert.ok(plinth.some(mesh => mesh.name === 'Plinth'), 'a plinth is one solid block');
    assert.ok(drawers.some(mesh => mesh.name === 'Door'), 'a walnut cabinet keeps its doors');
  });
});

test('shelving is drawn in metres: thin boards at a shelf pitch, wherever it is resized', () => {
  for (const size of [{ width: 1.6, depth: .7, height: 2.1 }, { width: 2.6, depth: .4, height: .75 }, { width: 2.4, depth: .6, height: 1.8 }]) {
    withScene(room([item('shelf', size)]), scene => {
      const root = scene.items.get('shelf'), boards = meshesOf(root).filter(mesh => mesh.name === 'Shelf')
        .map(mesh => new THREE.Box3().setFromObject(mesh)).sort((a, b) => a.min.y - b.min.y);
      const label = `${size.width}×${size.depth}×${size.height}`;
      assert.ok(boards.length >= 2, `${label}: has shelves`);
      for (const board of boards) assert.ok(board.max.y - board.min.y <= .03, `${label}: a ${((board.max.y - board.min.y) * 1000).toFixed(0)} mm board`);
      for (let index = 1; index < boards.length; index++) {
        const pitch = boards[index].min.y - boards[index - 1].min.y;
        assert.ok(pitch >= .25 && pitch <= .45, `${label}: ${pitch.toFixed(2)} m between shelves`);
      }
      for (const mesh of meshesOf(root)) {
        const scale = new THREE.Vector3();mesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        if (mesh.geometry.type !== 'BoxGeometry') assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6, `${label}: ${mesh.name} is stretched`);
      }
      const bounds = new THREE.Box3().setFromObject(root), extent = bounds.getSize(new THREE.Vector3());
      assert.ok(extent.x <= size.width + 1e-6 && extent.z <= size.depth + 1e-6 && bounds.max.y <= size.height + 1e-6, `${label}: stays inside its footprint`);
    });
  }
});

test('fitting-room mirrors are silvered, not clear glass', () => {
  withScene(boutique, scene => {
    for (const id of ['fitting-mirror-one', 'fitting-mirror-two']) {
      const pane = meshesOf(scene.items.get(id)).find(mesh => mesh.name === 'Mirror');
      assert.ok(pane, `${id} has a mirror pane`);
      assert.ok(!pane.material.transparent && pane.material.metalness >= .9 && pane.material.roughness <= .1, `${id} reflects`);
    }
  });
});

test('warm retail light over the displays and the checkout', () => {
  assert.equal(boutique.lighting, 'warm');
  withScene(boutique, scene => {
    const lights = [];scene.group.traverse(child => { if (child.isPointLight) lights.push(child.getWorldPosition(new THREE.Vector3())); });
    assert.ok(lights.length >= 3, `${lights.length} lights`);
    for (const id of ['display-table-one', 'display-table-two', 'checkout']) {
      const o = byId(id), near = Math.min(...lights.map(light => Math.hypot(light.x - o.east, -light.z - o.north)));
      assert.ok(near <= 1, `${id}: nearest light ${near.toFixed(2)} m away in plan`);
    }
  });
});
