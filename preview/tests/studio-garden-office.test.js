import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeStudioScene } from '../src/studio/scene.js';
import { createSpaceScene } from '../src/studio/space-scene.js';
import { createSpace, spaceAssessmentContext } from '../src/studio/space-templates.js';
import { assessSpace } from '../src/studio/space-assessment.js';

const object = (kind, patch = {}) => ({ id: kind, kind, label: kind, east: 0, north: 0, width: 2, depth: 1, height: 1, yaw: 0, elevation: 0, finish: 'oak', ...patch });
const space = objects => ({ schema_version: 1, document_type: 'studio-space', name: 'Room', lighting: 'daylight', bounds_m: [-12,-12,12,12], spawn: [0,-8], objects });
// Office sizes plus a compact and an oversized variant of each family member.
const sizes = [[1.8,.8,.76],[1.2,.6,.72],[.6,.65,.85],[2.4,1,.9]];

const meshesOf = root => { const list = []; root.traverse(child => { if (child.isMesh) list.push(child); }); return list; };
// Bounds of named parts in the object's own frame, in metres (root scale removed).
function metricBounds(root, item, name) {
  const unscaled = new THREE.Matrix4().compose(root.position, root.quaternion, new THREE.Vector3(1,1,1)).invert();
  const box = new THREE.Box3();
  for (const child of meshesOf(root).filter(mesh => !name || mesh.name === name)) {
    const positions = child.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld).applyMatrix4(unscaled));
  }
  return box;
}

test('desk, chair and pendant parts are authored in metres: curved parts are never stretched', () => {
  const pendants = [[1.8,.35,.3],[2.4,.22,.3],[.25,.25,.3],[1.2,.4,.35],[.4,1.3,.35]];
  const cases = [...['desk','chair'].flatMap(kind => sizes.map(size => [kind, size])), ...pendants.map(size => ['pendant', size])];
  for (const [kind, [width,depth,height]] of cases) for (const yaw of [0,30]) {
    const item = object(kind, { width, depth, height, yaw }), scene = createSpaceScene(space([item]));
    scene.group.updateMatrixWorld(true);
    const root = scene.items.get(kind);
    for (const child of meshesOf(root)) {
      if (child.geometry.type === 'BoxGeometry') continue;
      const scale = new THREE.Vector3();child.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6, `${kind} ${width}×${depth}×${height}: ${child.name} is stretched ${scale.toArray()}`);
    }
    const bounds = metricBounds(root, item);
    assert.ok(bounds.min.x >= -width/2 - 1e-6 && bounds.max.x <= width/2 + 1e-6, `${kind} stays inside its width`);
    assert.ok(bounds.min.z >= -depth/2 - 1e-6 && bounds.max.z <= depth/2 + 1e-6, `${kind} stays inside its depth`);
    assert.ok(bounds.min.y >= -1e-6 && bounds.max.y <= height + 1e-6, `${kind} stays inside its height`);
    disposeStudioScene(scene.group);
  }
});

test('desk and chair legs keep their metric section when the furniture is resized', () => {
  for (const kind of ['desk','chair']) {
    const sections = sizes.map(([width,depth,height]) => {
      const item = object(kind, { width, depth, height }), scene = createSpaceScene(space([item]));
      scene.group.updateMatrixWorld(true);
      const legs = meshesOf(scene.items.get(kind)).filter(mesh => mesh.name === 'Leg');
      assert.equal(legs.length, 4, `${kind} stands on four legs`);
      const box = new THREE.Box3().setFromObject(legs[0]), size = box.getSize(new THREE.Vector3());
      disposeStudioScene(scene.group);
      return [size.x, size.z].map(value => +value.toFixed(4));
    });
    for (const section of sections) assert.deepEqual(section, sections[0], `${kind} leg section changed with object size: ${JSON.stringify(sections)}`);
  }
});

test('Garden Office lights hang at ceiling height instead of floating over the desks', () => {
  const office = createSpace('office'), pendants = office.objects.filter(item => item.kind === 'pendant');
  assert.ok(pendants.length >= 2, 'office keeps practical lighting');
  for (const item of pendants) assert.ok(item.elevation >= 2.2, `${item.id} hangs at ${item.elevation} m`);
});

test('Garden Office keeps its required routes with the new family and lighting', () => {
  const result = assessSpace(createSpace('office'), spaceAssessmentContext('office'));
  assert.equal(result.status, 'passed', JSON.stringify(result.findings));
});

test('Garden Office catalog records match the forms the renderer draws', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../../docs/design/garden-office/asset-manifest.json', import.meta.url), 'utf8'));
  const { measureForms } = await import('../../scripts/garden-office-manifest.mjs');
  assert.deepEqual(manifest.assets, await measureForms(), 'review the change, then refresh with node scripts/garden-office-manifest.mjs --write');
  assert.equal(new Set(manifest.assets.map(asset => asset.id)).size, manifest.assets.length, 'record IDs are unique');
});

test('a linear pendant diffuser sits below its body instead of sharing a face with it', () => {
  const item = object('pendant', { width: 2.4, depth: .22, height: .3, elevation: 2.4 }), scene = createSpaceScene(space([item]));
  scene.group.updateMatrixWorld(true);
  const root = scene.items.get('pendant'), diffuser = metricBounds(root, item, 'Diffuser'), body = metricBounds(root, item, 'Linear body');
  assert.ok(diffuser.max.y <= body.min.y + 1e-6, `diffuser ${diffuser.min.y}..${diffuser.max.y} overlaps body ${body.min.y}..${body.max.y}`);
  disposeStudioScene(scene.group);
});

test('concrete floors read as one polished slab with saw-cut joints instead of outdoor pavers', () => {
  const item = object('floor', { width: 16, depth: 12, height: .025, finish: 'concrete' }), scene = createSpaceScene(space([item]));
  scene.group.updateMatrixWorld(true);
  const root = scene.items.get('floor'), surface = meshesOf(root)[0];
  assert.equal(surface.material.map, null, 'no photographed paver pattern');
  assert.ok(surface.material.roughness <= .6, `polished sheen, roughness ${surface.material.roughness}`);
  const joints = root.children.find(child => child.isLineSegments && child.name === 'Control joints');
  assert.ok(joints, 'saw-cut control joints');
  const points = joints.geometry.attributes.position, xs = new Set(), zs = new Set();
  for (let index = 0; index < points.count; index += 2) {
    const a = new THREE.Vector3().fromBufferAttribute(points, index).applyMatrix4(joints.matrixWorld);
    const b = new THREE.Vector3().fromBufferAttribute(points, index + 1).applyMatrix4(joints.matrixWorld);
    if (Math.abs(a.x - b.x) < 1e-6) xs.add(+a.x.toFixed(3)); else zs.add(+a.z.toFixed(3));
  }
  for (const lines of [[...xs].sort((a, b) => a - b), [...zs].sort((a, b) => a - b)]) {
    assert.ok(lines.length >= 1, 'joints in both directions');
    for (let index = 1; index < lines.length; index++) assert.ok(lines[index] - lines[index - 1] >= 3 && lines[index] - lines[index - 1] <= 6, `joint pitch ${lines[index] - lines[index - 1]} m`);
  }
  disposeStudioScene(scene.group);
});

test('lighting presets dim sun, sky fill and reflections in order from daylight to evening', async () => {
  const { SPACE_LIGHT } = await import('../src/studio/space-scene.js');
  assert.ok(SPACE_LIGHT, 'space lighting is one named table');
  for (const channel of ['sun', 'sky', 'reflections']) {
    assert.ok(SPACE_LIGHT.daylight[channel] > SPACE_LIGHT.warm[channel] && SPACE_LIGHT.warm[channel] > SPACE_LIGHT.evening[channel], `${channel} falls from daylight to evening`);
  }
});

test('Garden Office glazing has dark frames and floor-standing glass stands on a base shoe', () => {
  const office = createSpace('office');
  for (const item of office.objects.filter(item => item.kind === 'glazing')) assert.equal(item.finish, 'charcoal', `${item.id} frame`);
  for (const [height, elevation, shoe] of [[3.1, 0, .08], [.55, 1.07, 0]]) {
    const item = object('glazing', { width: 12, depth: .12, height, elevation, finish: 'charcoal' }), scene = createSpaceScene(space([item]));
    scene.group.updateMatrixWorld(true);
    const root = scene.items.get('glazing'), bounds = metricBounds(root, item, 'Base shoe');
    if (shoe) assert.ok(Math.abs(bounds.max.y - bounds.min.y - shoe) < 1e-6 && bounds.min.y >= -1e-6, `base shoe ${bounds.min.y}..${bounds.max.y}`);
    else assert.ok(bounds.isEmpty(), 'raised glazing such as a display case keeps a plain bottom rail');
    disposeStudioScene(scene.group);
  }
});

// Share of horizontal sight lines through the canopy band (55–90% of height) that hit foliage.
function canopyCoverage(root, item) {
  const radius = Math.min(item.width, item.depth) / 2;
  let total = 0, hit = 0;
  for (let a = 0; a < 8; a++) {
    const angle = a * Math.PI / 4, dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)), side = new THREE.Vector3(dir.z, 0, -dir.x);
    for (let h = .55; h <= .9; h += .05) for (let s = -.6; s <= .6001; s += .2) {
      const origin = dir.clone().multiplyScalar(-2).add(side.clone().multiplyScalar(s * radius));origin.y = item.elevation + h * item.height;
      total++;
      if (new THREE.Raycaster(origin, dir, 0, 4).intersectObject(root, true).some(found => /leaf|foliage/i.test(found.object.name))) hit++;
    }
  }
  return hit / total;
}

test('potted plants are drawn in metres and read as full foliage for a third of the cost', () => {
  // Floor plant, café table vase, boutique display plant and a wide planter.
  for (const [width, depth, height, elevation] of [[.55,.55,1.25,0],[.2,.2,.3,.75],[.4,.4,.6,.8],[.9,.5,1.6,0]]) {
    const item = object('plant', { width, depth, height, elevation, finish: 'terracotta' }), scene = createSpaceScene(space([item]));
    scene.group.updateMatrixWorld(true);
    const root = scene.items.get('plant');
    let triangles = 0;
    for (const child of meshesOf(root)) {
      triangles += (child.geometry.index ? child.geometry.index.count : child.geometry.attributes.position.count) / 3;
      if (child.geometry.type === 'BoxGeometry') continue;
      const scale = new THREE.Vector3();child.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6, `${width}×${depth}×${height}: ${child.name} is stretched ${scale.toArray()}`);
    }
    const bounds = metricBounds(root, item);
    assert.ok(bounds.min.x >= -width/2 - 1e-6 && bounds.max.x <= width/2 + 1e-6 && bounds.min.z >= -depth/2 - 1e-6 && bounds.max.z <= depth/2 + 1e-6, 'plant stays inside its footprint');
    assert.ok(bounds.min.y >= -1e-6 && bounds.max.y <= height + 1e-6, 'plant stays inside its height');
    assert.ok(triangles <= 1000, `${triangles} triangles`);
    const coverage = canopyCoverage(root, item);
    assert.ok(coverage >= .5, `canopy blocks ${(coverage * 100).toFixed(1)}% of sight lines`);
    disposeStudioScene(scene.group);
  }
});
