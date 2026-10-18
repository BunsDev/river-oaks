import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeStudioScene } from '../src/studio/scene.js';
import { createSpaceScene } from '../src/studio/space-scene.js';
import { createSpace, spaceAssessmentContext } from '../src/studio/space-templates.js';
import { assessSpace } from '../src/studio/space-assessment.js';

// #418 Courtyard House on the Garden Office baseline: fit, contact and material scale.
const house = createSpace('house'), byId = id => house.objects.find(o => o.id === id);
const radians = degrees => degrees * Math.PI / 180;
// Footprint edges in plan (east, north). A v1 object's front is its local +z side, which
// faces south at yaw 0; its back faces north.
const facing = o => [Math.sin(radians(o.yaw)), -Math.cos(radians(o.yaw))];
const backPoint = o => { const [e, n] = facing(o); return [o.east - e * o.depth / 2, o.north - n * o.depth / 2]; };
const frontPoint = o => { const [e, n] = facing(o); return [o.east + e * o.depth / 2, o.north + n * o.depth / 2]; };
// Distance from a plan point to an object's footprint rectangle (0 inside it).
function distanceTo(o, [east, north]) {
  const angle = radians(o.yaw), c = Math.cos(angle), s = Math.sin(angle), dx = east - o.east, dy = north - o.north;
  return Math.hypot(Math.max(0, Math.abs(dx * c + dy * s) - o.width / 2), Math.max(0, Math.abs(-dx * s + dy * c) - o.depth / 2));
}
const nearestWall = point => Math.min(...house.objects.filter(o => o.kind === 'wall').map(wall => distanceTo(wall, point)));
const meshesOf = root => { const list = []; root.traverse(child => { if (child.isMesh) list.push(child); }); return list; };
function worldBounds(root, names) {
  const box = new THREE.Box3(), point = new THREE.Vector3();
  for (const child of meshesOf(root).filter(mesh => names.includes(mesh.name))) {
    const positions = child.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) box.expandByPoint(point.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld));
  }
  return box;
}
const withScene = (space, check) => {
  const scene = createSpaceScene(space);scene.group.updateMatrixWorld(true);
  try { return check(scene); } finally { disposeStudioScene(scene.group); }
};

test('Courtyard House keeps its program, route roles and passing required routes', () => {
  for (const id of ['living-sofa', 'kitchen-sink', 'bed', 'toilet', 'patio-table']) assert.ok(byId(id), `${id} kept`);
  const result = assessSpace(house, spaceAssessmentContext('house'));
  assert.equal(result.status, 'passed', JSON.stringify(result.findings));
});

test('the kitchen sink sits flush in its cabinet run and the vanity at basin height', () => {
  const sink = byId('kitchen-sink');
  withScene(house, scene => {
    const sinkTop = worldBounds(scene.items.get('kitchen-sink'), ['Basin surround']).max.y;
    for (const id of ['kitchen-cabinets', 'kitchen-cabinets-east']) {
      const run = byId(id), top = worldBounds(scene.items.get(id), ['Countertop']).max.y;
      assert.ok(Math.abs(sinkTop - top) <= .005, `${id}: sink worktop ${sinkTop.toFixed(3)} m beside a ${top.toFixed(3)} m worktop`);
      assert.ok(Math.abs(frontPoint(sink)[1] - frontPoint(run)[1]) <= .005, `${id}: fronts differ by ${(frontPoint(sink)[1] - frontPoint(run)[1]).toFixed(3)} m`);
      const gap = Math.abs(sink.east - run.east) - (sink.width + run.width) / 2;
      assert.ok(Math.abs(gap) <= .005, `${id}: ${gap.toFixed(3)} m between the sink and the run`);
    }
    const vanity = worldBounds(scene.items.get('bathroom-vanity'), ['Basin surround']).max.y;
    assert.ok(vanity >= .8 && vanity <= .9, `vanity worktop at ${vanity.toFixed(3)} m`);
  });
});

test('cabinet doors and worktops keep true-size rounding when resized', () => {
  for (const kind of ['cabinet', 'counter', 'sink']) for (const [width, depth, height] of [[2.8,.65,.9],[.6,.55,.55],[5.6,.8,1.05]]) {
    const item = { id: kind, kind, label: kind, east: 0, north: 0, width, depth, height, yaw: 0, elevation: 0, finish: 'oak' };
    withScene({ ...house, objects: [item] }, scene => {
      for (const child of meshesOf(scene.items.get(kind)).filter(mesh => ['Door', 'Countertop'].includes(mesh.name))) {
        const scale = new THREE.Vector3();child.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6, `${kind} ${width}×${depth}×${height}: ${child.name} is stretched ${scale.toArray()}`);
      }
    });
  }
});

test('the bathroom is a closed wet room with fixtures against its walls', () => {
  const zone = byId('bathroom-floor'), [west, east] = [zone.east - zone.width / 2, zone.east + zone.width / 2];
  const [south, north] = [zone.north - zone.depth / 2, zone.north + zone.depth / 2];
  for (const glass of house.objects.filter(o => o.kind === 'glazing' && o.elevation === 0 && o.height >= 2)) {
    const along = glass.yaw % 180 ? [glass.north - glass.width / 2, glass.north + glass.width / 2] : [glass.east - glass.width / 2, glass.east + glass.width / 2];
    const onEdge = glass.yaw % 180
      ? (Math.abs(glass.east - west) < .3 || Math.abs(glass.east - east) < .3) && along[1] > south + .05 && along[0] < north - .05
      : (Math.abs(glass.north - south) < .3 || Math.abs(glass.north - north) < .3) && along[1] > west + .05 && along[0] < east - .05;
    assert.ok(!onEdge, `${glass.id} is clear glass on the bathroom's edge`);
  }
  for (const id of ['toilet', 'shower', 'bathroom-vanity']) {
    const gap = nearestWall(backPoint(byId(id)));
    assert.ok(gap <= .1, `${id}: back stands ${gap.toFixed(2)} m from a wall`);
  }
  // Walled in, the room needs its own light for the evening preset.
  assert.ok(house.objects.some(o => o.kind === 'pendant' && distanceTo(zone, [o.east, o.north]) === 0), 'a light hangs in the bathroom');
});

test('the bed has its headboard on the wall with bedside tables at its head', () => {
  const bed = byId('bed'), head = backPoint(bed);
  assert.ok(nearestWall(head) <= .1, `headboard stands ${nearestWall(head).toFixed(2)} m from the wall`);
  for (const id of ['bedside-left', 'bedside-right']) {
    const table = byId(id), side = distanceTo(bed, [table.east, table.north]) - table.width / 2;
    assert.ok(side >= 0 && side <= .1, `${id}: ${side.toFixed(2)} m from the bed's side`);
    assert.ok(nearestWall(backPoint(table)) <= .1, `${id}: back ${nearestWall(backPoint(table)).toFixed(2)} m from the wall`);
  }
});

test('bedding is soft textile: true-size rounding, sheen, and a duvet over the mattress sides', () => {
  withScene(house, scene => {
    const bed = scene.items.get('bed'), parts = meshesOf(bed);
    for (const name of ['Mattress', 'Duvet', 'Pillow', 'Headboard']) {
      const found = parts.filter(mesh => mesh.name === name);
      assert.ok(found.length, `bed has a ${name}`);
      for (const mesh of found) {
        const scale = new THREE.Vector3();mesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6, `${name} is stretched ${scale.toArray()}`);
        if (name !== 'Mattress') assert.ok(mesh.material.sheen > 0, `${name} has a textile sheen`);
      }
    }
    const mattress = worldBounds(bed, ['Mattress']), duvet = worldBounds(bed, ['Duvet']);
    assert.ok(duvet.min.x <= mattress.min.x && duvet.max.x >= mattress.max.x, 'the duvet covers the mattress width');
    assert.ok(duvet.min.y < mattress.max.y - .1, 'the duvet drapes at least 10 cm down the mattress sides');
    const footprint = new THREE.Box3().setFromObject(bed), item = byId('bed');
    const size = footprint.getSize(new THREE.Vector3());
    assert.ok(size.x <= item.width + 1e-6 && size.z <= item.depth + 1e-6 && footprint.max.y <= item.height + 1e-6, 'the bed stays inside its footprint and height');
  });
});

test('seats face their tables within reach; the sofa backs onto a wall; rugs are thin', () => {
  const pairs = [['dining-chair-one','dining-table'],['dining-chair-two','dining-table'],['dining-chair-three','dining-table'],['dining-chair-four','dining-table'],
    ['patio-chair-one','patio-table'],['patio-chair-two','patio-table'],['living-sofa','coffee-table'],['living-armchair','coffee-table']];
  // A sitter reaches the table straight ahead: within 0.5 m of the seat's front edge.
  for (const [seatId, tableId] of pairs) {
    const seat = byId(seatId), table = byId(tableId), [fe, fn] = facing(seat), [e, n] = frontPoint(seat);
    const ahead = Array.from({ length: 11 }, (_, step) => step * .05).find(d => distanceTo(table, [e + fe * d, n + fn * d]) === 0);
    assert.ok(ahead !== undefined, `${seatId} does not face ${tableId} within 0.5 m (nearest ${distanceTo(table, [e, n]).toFixed(2)} m)`);
  }
  const sofaFront = distanceTo(byId('coffee-table'), frontPoint(byId('living-sofa')));
  assert.ok(sofaFront >= .35, `coffee table ${sofaFront.toFixed(2)} m from the sofa leaves no room for legs`);
  assert.ok(nearestWall(backPoint(byId('living-sofa'))) <= .1, 'the sofa backs onto the wall');
  for (const rug of house.objects.filter(o => o.kind === 'rug')) assert.ok(rug.height <= .015, `${rug.id} is ${rug.height * 1000} mm thick`);
});

// Unit sizes measured on the shared textures (preview/public/assets/materials): the
// herringbone paver brick is 0.24 of the paver tile long; sandstone rows are 0.25 of the
// stone tile tall. tileSize is the metres one texture repeat spans.
const tileSize = material => Number(material.customProgramCacheKey?.().split(':')[1]);
test('floors draw brick and stone at real unit sizes, and stone slabs are not tiled', () => {
  withScene(house, scene => {
    const surface = id => meshesOf(scene.items.get(id)).find(mesh => mesh.name === 'Floor surface').material;
    const brick = .24 * tileSize(surface('patio-floor')), row = .25 * tileSize(surface('bathroom-floor'));
    assert.ok(brick >= .18 && brick <= .3, `patio brick ${brick.toFixed(2)} m long`);
    assert.ok(row >= .25 && row <= .45, `bathroom tile rows ${row.toFixed(2)} m`);
    const top = meshesOf(scene.items.get('patio-table')).find(mesh => mesh.name === 'Tabletop').material;
    assert.equal(top.map ?? null, null, 'the limestone patio table is one slab, not paving');
  });
});

test('the bed stays inside its footprint and height at any size', () => {
  for (const [width, depth, height] of [[2,2.3,1.05],[.9,2,.9],[3,3,1.6],[.6,.6,.3],[1.4,2.1,.5]]) for (const yaw of [0, 30]) {
    const item = { id: 'bed', kind: 'bed', label: 'Bed', east: 0, north: 0, width, depth, height, yaw, elevation: 0, finish: 'fabric' };
    withScene({ ...house, objects: [item] }, scene => {
      const root = scene.items.get('bed'), local = new THREE.Matrix4().compose(root.position, root.quaternion, new THREE.Vector3(1,1,1)).invert();
      const box = new THREE.Box3(), point = new THREE.Vector3();
      for (const child of meshesOf(root)) {
        const positions = child.geometry.attributes.position;
        for (let index = 0; index < positions.count; index++) box.expandByPoint(point.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld).applyMatrix4(local));
      }
      const label = `${width}×${depth}×${height} at ${yaw}°`;
      assert.ok(box.min.x >= -width / 2 - 1e-6 && box.max.x <= width / 2 + 1e-6, `${label}: width ${box.min.x.toFixed(3)}..${box.max.x.toFixed(3)}`);
      assert.ok(box.min.z >= -depth / 2 - 1e-6 && box.max.z <= depth / 2 + 1e-6, `${label}: depth ${box.min.z.toFixed(3)}..${box.max.z.toFixed(3)}`);
      assert.ok(box.min.y >= -1e-6 && box.max.y <= height + 1e-6, `${label}: height ${box.min.y.toFixed(3)}..${box.max.y.toFixed(3)}`);
    });
  }
});
