import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeStudioScene } from '../src/studio/scene.js';
import { createSpaceScene } from '../src/studio/space-scene.js';
import { createSpace, spaceAssessmentContext } from '../src/studio/space-templates.js';
import { assessSpace } from '../src/studio/space-assessment.js';

// #418 Corner Café on the Garden Office baseline: counter and coffee-machine scale, one
// chair/table family, tableware and the terrace.
const cafe = createSpace('cafe'), byId = id => cafe.objects.find(o => o.id === id);
const radians = degrees => degrees * Math.PI / 180;
const facing = o => [Math.sin(radians(o.yaw)), -Math.cos(radians(o.yaw))];
const frontPoint = o => { const [e, n] = facing(o); return [o.east + e * o.depth / 2, o.north + n * o.depth / 2]; };
function distanceTo(o, [east, north]) {
  const angle = radians(o.yaw), c = Math.cos(angle), s = Math.sin(angle), dx = east - o.east, dy = north - o.north;
  return Math.hypot(Math.max(0, Math.abs(dx * c + dy * s) - o.width / 2), Math.max(0, Math.abs(-dx * s + dy * c) - o.depth / 2));
}
const meshesOf = root => { const list = []; root.traverse(child => { if (child.isMesh) list.push(child); }); return list; };
const withScene = (space, check) => {
  const scene = createSpaceScene(space);scene.group.updateMatrixWorld(true);
  try { return check(scene); } finally { disposeStudioScene(scene.group); }
};
const worldBox = (root, names) => {
  const box = new THREE.Box3();
  for (const mesh of meshesOf(root).filter(mesh => names.includes(mesh.name))) box.union(new THREE.Box3().setFromObject(mesh));
  return box;
};
const item = (kind, patch) => ({ id: kind, kind, label: kind, east: 0, north: 0, width: 1.05, depth: .8, height: .74, yaw: 0, elevation: 0, finish: 'walnut', ...patch });

test('Corner Café keeps its program, route roles and passing required routes', () => {
  for (const id of ['cafe-table-1', 'service-counter-left', 'prep-sink', 'terrace-table']) assert.ok(byId(id), `${id} kept`);
  const result = assessSpace(cafe, spaceAssessmentContext('cafe'));
  assert.equal(result.status, 'passed', JSON.stringify(result.findings));
});

test('the prep sink sits flush in its cabinet run', () => {
  const sink = byId('prep-sink');
  withScene(cafe, scene => {
    const sinkTop = worldBox(scene.items.get('prep-sink'), ['Basin surround']).max.y;
    for (const id of ['prep-cabinets', 'prep-cabinets-east']) {
      const run = byId(id), top = worldBox(scene.items.get(id), ['Countertop']).max.y;
      assert.ok(Math.abs(sinkTop - top) <= .005, `${id}: sink worktop ${sinkTop.toFixed(3)} m beside ${top.toFixed(3)} m`);
      assert.ok(Math.abs(frontPoint(sink)[1] - frontPoint(run)[1]) <= .005, `${id}: fronts differ by ${(frontPoint(sink)[1] - frontPoint(run)[1]).toFixed(3)} m`);
    }
  });
});

test('service counters show customers a closed front; the coffee machine faces the barista', () => {
  withScene(cafe, scene => {
    for (const id of ['service-counter-left', 'service-counter-right']) {
      const counter = byId(id), doors = meshesOf(scene.items.get(id)).filter(mesh => mesh.name === 'Door');
      assert.ok(doors.length, `${id} has doors`);
      for (const door of doors) assert.ok(-door.getWorldPosition(new THREE.Vector3()).z > counter.north, `${id}: a door faces the customers`);
    }
    const machine = byId('coffee-machine'), heads = meshesOf(scene.items.get('coffee-machine')).filter(mesh => mesh.name === 'Group head');
    assert.ok(heads.length >= 2, 'a two-group machine');
    for (const head of heads) assert.ok(-head.getWorldPosition(new THREE.Vector3()).z > machine.north, 'the group heads face the staff side');
  });
  const machine = byId('coffee-machine');
  assert.ok(machine.width >= .7 && machine.width <= .9 && machine.depth <= .6 && machine.height >= .45 && machine.height <= .55,
    `coffee machine ${machine.width}×${machine.depth}×${machine.height} m is not a two-group espresso machine`);
});

test('the pastry display is a glass case with shelves and pastries inside it', () => {
  withScene(cafe, scene => {
    const root = scene.items.get('pastry-display'), parts = meshesOf(root), o = byId('pastry-display');
    assert.ok(parts.some(mesh => mesh.name === 'Case glass' && mesh.material.transparent), 'glass sides and top');
    assert.ok(parts.filter(mesh => mesh.name === 'Pastry').length >= 6, 'pastries on display');
    assert.ok(parts.some(mesh => mesh.name === 'Display shelf'), 'a display shelf');
    const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
    assert.ok(size.x <= o.width + 1e-6 && size.z <= o.depth + 1e-6 && bounds.max.y <= o.elevation + o.height + 1e-6 && bounds.min.y >= o.elevation - 1e-6, 'the case stays inside its footprint');
  });
});

test('tables are drawn in metres: a thin top, true-section legs and crisp corners at any size', () => {
  const sizes = [[1.05,.8,.74],[2.2,1.2,.76],[1.4,.75,.42],[.6,.6,1.05]];
  const sections = [];
  for (const [width, depth, height] of sizes) for (const yaw of [0, 30]) withScene({ ...cafe, objects: [item('table', { width, depth, height, yaw })] }, scene => {
    const root = scene.items.get('table'), label = `${width}×${depth}×${height} at ${yaw}°`, parts = meshesOf(root);
    for (const mesh of parts) {
      if (mesh.geometry.type === 'BoxGeometry') continue;
      const scale = new THREE.Vector3();mesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6, `${label}: ${mesh.name} is stretched`);
    }
    const top = worldBox(root, ['Tabletop']);
    assert.ok(top.max.y - top.min.y <= .035, `${label}: a ${((top.max.y - top.min.y) * 1000).toFixed(0)} mm top`);
    assert.ok(Math.abs(top.max.y - height) < 1e-6, `${label}: top at ${top.max.y.toFixed(3)} m`);
    const legs = parts.filter(mesh => mesh.name === 'Leg');
    assert.equal(legs.length, 4, `${label}: four legs`);
    if (yaw === 0) { const leg = new THREE.Box3().setFromObject(legs[0]).getSize(new THREE.Vector3());sections.push([leg.x, leg.z].map(v => +v.toFixed(4))); }
    const local = new THREE.Matrix4().compose(root.position, root.quaternion, new THREE.Vector3(1,1,1)).invert(), box = new THREE.Box3(), point = new THREE.Vector3();
    for (const mesh of parts) { const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i++) box.expandByPoint(point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(local)); }
    assert.ok(box.min.x >= -width / 2 - 1e-6 && box.max.x <= width / 2 + 1e-6 && box.min.z >= -depth / 2 - 1e-6 && box.max.z <= depth / 2 + 1e-6 && box.max.y <= height + 1e-6, `${label}: stays inside its footprint`);
  });
  for (const section of sections) assert.deepEqual(section, sections[0], `leg section changed with size: ${JSON.stringify(sections)}`);
});

test('the terrace is furnished: chairs at its table and planters at its edges', () => {
  const terrace = byId('terrace-floor');
  const planters = cafe.objects.filter(o => o.kind === 'plant' && o.elevation === 0 && distanceTo(terrace, [o.east, o.north]) === 0);
  assert.ok(planters.length >= 2, `${planters.length} planters on the terrace`);
  for (const id of ['terrace-chair-a', 'terrace-chair-b']) {
    const seat = byId(id), [fe, fn] = facing(seat), [e, n] = frontPoint(seat), table = byId('terrace-table');
    assert.ok(Array.from({ length: 11 }, (_, k) => k * .05).some(d => distanceTo(table, [e + fe * d, n + fn * d]) === 0), `${id} faces the table within 0.5 m`);
  }
});
