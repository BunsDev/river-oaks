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

test('Garden Office uses restrained TypeSafe Place pink in the existing wall-art detail', () => {
  const office = createSpace('office'), scene = createSpaceScene(office);
  try {
    const circle = scene.items.get('reception-art').getObjectByName('Abstract circle');
    assert.equal(circle.material.color.getHexString(), 'f486a1');
    const pot = scene.items.get('meeting-plant').getObjectByName('Planter');
    assert.equal(pot.material.color.getHexString(), 'b76e50', 'pots retain terracotta');
  } finally { disposeStudioScene(scene.group); }
});
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

// The v1 contract accepts centimetre-sized and tall/narrow objects. Source detail
// must stay within those same dimensions; collision may not be shrunk to fit art.
for (const kind of ['desk', 'chair', 'pendant', 'plant']) test(`${kind} stays within valid v1 dimensions at resize limits`, async () => {
  const { validateSpace } = await import('../src/studio/space-document.js');
  for (const [width, depth, height] of [[.01,.01,.01],[.1,.1,4],[.6,.2,1.2],[2,.01,.3],[.01,2,.3],[2,2,.01],[.01,.01,4],[.01,.1,.5],[.01,2,4],[.02,.01,.01],[.01,.02,.01]]) {
    const item = object(kind, { width, depth, height, yaw: 37 });
    const source = validateSpace(space([item])), scene = createSpaceScene(source);
    try {
      const bounds = metricBounds(scene.items.get(kind), item), e = 1e-6;
      assert.ok(bounds.min.x >= -width/2-e && bounds.max.x <= width/2+e
        && bounds.min.z >= -depth/2-e && bounds.max.z <= depth/2+e
        && bounds.min.y >= -e && bounds.max.y <= height+e,
      `${kind} ${width}×${depth}×${height}: ${JSON.stringify([bounds.min.toArray(),bounds.max.toArray()])}`);
      assert.deepEqual(source, space([item]), 'rendering preserves the legacy document');
    } finally { disposeStudioScene(scene.group); }
  }
});

test('nearby furniture dimensions cannot reuse a larger rounded geometry', () => {
  const large = object('desk', { id: 'large', width: 1.8004, depth: .8, height: .76 });
  const small = { ...large, id: 'small', width: 1.8, east: 4 };
  const scene = createSpaceScene(space([large, small]));
  try {
    const bounds = metricBounds(scene.items.get('small'), small);
    assert.ok(bounds.min.x >= -.900001 && bounds.max.x <= .900001, `small desk extends to ${bounds.min.x}..${bounds.max.x}`);
  } finally { disposeStudioScene(scene.group); }
});

test('pilot records include glazing and finishes with actual collision disposition and source dependencies', async () => {
  const { measureForms } = await import('../../scripts/garden-office-manifest.mjs');
  const { buildSpaceWorld } = await import('../src/studio/space-document.js');
  const records = await measureForms();
  for (const kind of ['desk','chair','pendant','plant','glazing','floor','wall','art']) assert.ok(records.some(r => r.kind === kind), `${kind} is recorded`);
  for (const record of records) {
    const item = object(record.kind, record.nominal);
    assert.deepEqual(record.collision.footprintsAtNominal, buildSpaceWorld(space([item])).collisionPolygons);
    assert.equal(record.export, null, 'procedural forms have no fabricated GLB export');
    assert.ok(record.sources.some(source => source.file === 'preview/src/studio/space-scene.js'), 'material and assembly dependency is hashed');
    assert.ok(record.cost.geometryBytes > 0 && record.cost.materials > 0, 'actual resident buffers and materials measured');
  }
});

test('pilot v1 rejection preserves edited draft, profile, save data and undo recovery', async () => {
  const { createStudioDocument, parseRegion, MAX_REGION_BYTES } = await import('../src/studio/document.js');
  const initial = createSpace('office'), context = spaceAssessmentContext('office');
  const doc = createStudioDocument(initial, { assessmentContext: context });
  doc.update('work-desk-1', { finish: 'walnut' });
  const storage = new Map();storage.getItem = key => storage.get(key) ?? null;storage.setItem = (key,value) => storage.set(key,value);
  doc.save(storage);
  const before = doc.serialize(), revision = doc.revision, saved = [...storage];
  const bad = change => { const value = structuredClone(initial);change(value);return JSON.stringify(value); };
  for (const input of ['{', ' '.repeat(MAX_REGION_BYTES + 1),
    bad(v => v.schema_version = 2), bad(v => v.objects[0].kind = 'unknown-asset'),
    bad(v => v.objects[0].asset_id = 'https://example.invalid/chair.glb'),
    bad(v => v.objects[0].finish = 'missing-finish'), bad(v => v.objects[0].width = 0),
    bad(v => v.objects = Array.from({length:161}, (_,i) => ({...v.objects[0], id:`object-${i}`})))]) {
    assert.throws(() => doc.open(parseRegion(input)));
    assert.equal(doc.serialize(), before);assert.equal(doc.revision, revision);
    assert.deepEqual(doc.assessmentContext, context);assert.deepEqual([...storage], saved);
  }
  const reopened = createStudioDocument();reopened.restore(storage);
  assert.equal(reopened.serialize(), before);assert.deepEqual(reopened.assessmentContext, context);
  doc.undo();assert.deepEqual(doc.value, initial);
  doc.open(parseRegion(before));assert.equal(doc.serialize(), before);
  assert.equal(doc.assessmentContext, null, 'bare v1 import remains unassessed');
});

test('all four workstations retain a side approach with the real controller and occupied seats', async () => {
  const { buildSpaceWorld } = await import('../src/studio/space-document.js');
  const { createWalkingEnvironment } = await import('../src/walking.js');
  const { spaceMovementSegment } = await import('../src/studio/space-assessment.js');
  // Proposed side approaches, separate from the four required profile destinations.
  // Coordinates are east/north metres, with 0.7 m from chair centre to approach.
  const approaches = [[-5,-1.4],[-3.4,-1.4],[-5,1.9],[-3.4,1.9]];
  const routes = approaches.map(point => [[0,-8.5],[0,-4],[0,.6],[-4.2,.6],[-4.2,point[1]],point]);
  const canWalk = (environment, points) => points.slice(1).every((point,i) =>
    spaceMovementSegment(environment, points[i], point) && spaceMovementSegment(environment, point, points[i]));
  for (const pushBack of [0,.4]) {
    const office = createSpace('office');
    if (pushBack) for (const chair of office.objects.filter(item => item.kind === 'chair')) {
      const yaw = chair.yaw * Math.PI / 180;
      chair.east -= Math.sin(yaw) * pushBack;chair.north += Math.cos(yaw) * pushBack;
      chair.depth = Math.max(chair.depth, .75);
    }
    const environment = createWalkingEnvironment(buildSpaceWorld(office));
    routes.forEach((route,i) => assert.ok(canWalk(environment, route), `workstation ${i+1}, push-back ${pushBack} m`));
    office.objects.push(object('cabinet', { east:-4.2, north:.6, width:1, depth:1 }));
    const blocked = createWalkingEnvironment(buildSpaceWorld(office));
    assert.ok(routes.every(route => !canWalk(blocked, route)), 'an actual obstruction invalidates these approaches');
  }
});
