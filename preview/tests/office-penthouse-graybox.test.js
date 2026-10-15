import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_ENVELOPE } from '../src/workplace-room.js';
import { OFFICE_LAYOUT_PENTHOUSE, officeLayout, officeLevelFree } from '../src/office-layouts.js';
import { buildOfficeGeometry, buildPenthouseOffice } from '../src/office-penthouse-graybox.js';

const layout = officeLayout(OFFICE_LAYOUT_PENTHOUSE);
const [l0, l1] = layout.levels;
const meshes = object => { const out = []; object.updateMatrixWorld(true); object.traverse(node => { if (node.isMesh) out.push(node); }); return out; };
// Plan coordinates of world bounds: x across, d inward, y up.
const planBox = box => ({ x0: box.min.x, x1: box.max.x, y0: box.min.y, y1: box.max.y, d0: -box.max.z, d1: -box.min.z });
// Every drawn part with its own bounds and zone: a mesh, or each instance of an instanced mesh,
// so batching never hides a part's position behind its batch's overall bounds.
const parts = object => meshes(object).flatMap(mesh => {
  if (!mesh.isInstancedMesh) return [{ mesh, name: mesh.name, zone: mesh.userData.zone, e: planBox(new THREE.Box3().setFromObject(mesh)) }];
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const matrix = new THREE.Matrix4();
  return Array.from({ length: mesh.count }, (_, i) => {
    mesh.getMatrixAt(i, matrix);
    const box = mesh.geometry.boundingBox.clone().applyMatrix4(matrix.premultiply(mesh.matrixWorld));
    return { mesh, name: `${mesh.name}[${i}]`, zone: mesh.userData.zones?.[i] ?? mesh.userData.zone, e: planBox(box) };
  });
});
const covers = (e, x, y, d, eps = 1e-6) => x >= e.x0 - eps && x <= e.x1 + eps && y >= e.y0 - eps && y <= e.y1 + eps && d >= e.d0 - eps && d <= e.d1 + eps;
const transparent = part => [part.mesh.material].flat().some(material => material.transparent);
const main = l0.rooms.find(room => room.kind === 'primary');
const inside = (e, r, eps = 1e-6) => e.x0 >= r.x0 - eps && e.x1 <= r.x1 + eps && e.d0 >= r.d0 - eps && e.d1 <= r.d1 + eps;

test('every graybox mesh is tagged with a plan zone and stays inside it', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const all = parts(built.object);
  assert.ok(all.length > 20);
  for (const { name, zone, e } of all) {
    assert.equal(typeof zone, 'string', `${name} has a zone`);
    const [kind, id] = zone.split(':');
    if (kind === 'floor') {
      const room = layout.levels.flatMap(level => level.rooms.map(item => ({ ...item, floor: level.floorElevation }))).find(item => item.id === id);
      assert.ok(room && inside(e, room) && Math.abs(e.y1 - room.floor) < 1e-6, zone);
    } else if (kind === 'obstacle') {
      const obstacle = layout.levels.flatMap(level => level.obstacles.map(item => ({ ...item, floor: level.floorElevation }))).find(item => item.id === id);
      assert.ok(obstacle && inside(e, obstacle, 0.01) && e.y0 >= obstacle.floor - 1e-6, zone);
    } else if (kind === 'chair') {
      const chair = l0.chairs.find(item => item.id === id);
      assert.ok(chair && Math.max(Math.abs(e.x0 - chair.position[0]), Math.abs(e.x1 - chair.position[0]), Math.abs(e.d0 - chair.position[1]), Math.abs(e.d1 - chair.position[1])) <= 0.45, zone);
    } else if (kind === 'mezzanine') {
      assert.ok(inside(e, { x0: -15, x1: 15, d0: 14, d1: 20 }) && Math.abs(e.y1 - l1.floorElevation) < 1e-6 && e.y0 >= l0.rooms[0].clearUnderMezzanine - 1e-6, zone);
    } else if (kind === 'guard') {
      assert.ok(e.d0 >= 13.85 && e.d1 <= 14.15 && e.y0 >= l1.floorElevation - 1e-6 && e.y1 <= l1.floorElevation + 1.2, zone);
    } else if (kind === 'lift') {
      assert.ok(inside(e, { x0: -12.9, x1: -11.1, d0: 17.1, d1: 18.9 }), zone);
    } else if (kind === 'shell') {
      const b = l0.bounds, onEdge = e.x1 <= b.x0 + 0.2 || e.x0 >= b.x1 - 0.2 || e.d1 <= b.d0 + 0.2 || e.d0 >= b.d1 - 0.2 || e.y0 >= l0.clearHeight - 1e-6;
      assert.ok(onEdge, `${zone} ${name} sits on the perimeter or the ceiling`);
    } else if (kind === 'transom') {
      // Above the terrace portals, on the main room's terrace wall line, clear of the tallest body.
      assert.ok(e.x0 >= main.x0 - 0.2 && e.x1 <= main.x0 + 0.2 && e.y0 >= AVATAR_ENVELOPE.height + 0.3 && e.y1 <= l0.clearHeight + 1e-6, `${zone} ${name}`);
    } else assert.fail(`unknown zone ${zone}`);
  }
  built.dispose();
});

test('the arrival doorway on the entrance wall stays open', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const door = { x0: -0.85, x1: 0.85, d0: -0.2, d1: 0.2 };
  for (const { name, zone, e } of parts(built.object)) {
    const overlaps = e.x1 > door.x0 + 1e-6 && e.x0 < door.x1 - 1e-6 && e.d1 > door.d0 && e.d0 < door.d1 && e.y0 < 2.6 - 1e-6 && e.y1 > 0.01;
    assert.equal(overlaps, false, `${zone} ${name} blocks the doorway`);
  }
  built.dispose();
});

test('art agrees with collision: nothing solid stands where the server lets a body walk', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const solids = parts(built.object).filter(({ zone }) => !['floor', 'mezzanine'].includes(zone.split(':')[0]) && zone !== 'shell:ceiling').map(({ e }) => e);
  for (const level of layout.levels) {
    const { x0, x1, d0, d1 } = level.bounds;
    for (let x = x0 + 0.5; x < x1; x += 0.7) for (let d = d0 + 0.5; d < d1; d += 0.7) {
      if (!officeLevelFree(layout, level.id, [x, d])) continue;
      const y0 = level.floorElevation + 0.05, y1 = level.floorElevation + AVATAR_ENVELOPE.height;
      const hit = solids.find(e => x >= e.x0 && x <= e.x1 && d >= e.d0 && d <= e.d1 && e.y1 > y0 && e.y0 < y1);
      assert.equal(hit, undefined, `${level.id} ${x.toFixed(2)},${d.toFixed(2)} is walkable but rendered solid`);
    }
  }
  built.dispose();
});

test('dispose releases every geometry and material it created', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const disposed = new Set();
  const all = meshes(built.object);
  for (const mesh of all) {
    mesh.geometry.addEventListener('dispose', () => disposed.add(mesh.geometry));
    for (const material of [mesh.material].flat()) material.addEventListener('dispose', () => disposed.add(material));
  }
  built.dispose();
  const expected = new Set(all.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
  assert.equal(disposed.size, expected.size);
  assert.ok(built.lights.length >= 3, 'authored lights for the shared light pool');
});

test('a glazed curtain wall wraps the street front, the east side and the terrace side; the back wall stays solid', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const all = parts(built.object), glass = all.filter(transparent), solid = all.filter(part => !transparent(part));
  const glazed = (x, y, d) => glass.some(({ e }) => covers(e, x, y, d, 0.02));
  const opaque = (x, y, d) => solid.some(({ e }) => covers(e, x, y, d, 0.02));
  const front = l0.bounds.d0 - 0.1, east = l0.bounds.x1 + 0.1, terrace = main.x0, back = l0.bounds.d1 + 0.1;
  for (const y of [1.2, 3.8, 6.8]) {
    for (const x of [-14, -10, -5, 5, 10, 14]) assert.ok(glazed(x, y, front), `street front glazed at x ${x}, y ${y}`);
    for (const d of [1, 5, 10, 15, 19]) assert.ok(glazed(east, y, d), `east side glazed at d ${d}, y ${y}`);
    for (const d of [1.5, 8.5, 17]) assert.ok(glazed(terrace, y, d), `terrace side glazed at d ${d}, y ${y}`);
    for (const x of [-12, 0, 12]) assert.ok(opaque(x, y, back) && !glazed(x, y, back), `back wall solid at x ${x}, y ${y}`);
  }
  // Transoms close the terrace portals above head height.
  for (const d of [5, 12]) assert.ok(glazed(terrace, 5, d), `transom above the portal at d ${d}`);
  // The arrival core around the doorway stays solid, so the cabin and lobby behind it are not seen through glass.
  for (const [x, y] of [[-1.5, 1.2], [1.5, 1.2], [-2.5, 6], [2.5, 6], [0, 5]]) assert.ok(opaque(x, y, front) && !glazed(x, y, front), `arrival core solid at x ${x}, y ${y}`);
  built.dispose();
});

test('the terrace portals stay walkable at full body height under their transoms', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const solids = parts(built.object).filter(({ zone }) => !['floor', 'mezzanine'].includes(zone.split(':')[0]) && zone !== 'shell:ceiling');
  for (const [d0, d1] of [[3, 7], [10, 14]]) for (let d = d0 + 0.6; d <= d1 - 0.6; d += 0.2) for (let x = main.x0 - 0.6; x <= main.x0 + 0.6; x += 0.1) {
    const hit = solids.find(({ e }) => x >= e.x0 && x <= e.x1 && d >= e.d0 && d <= e.d1 && e.y0 < AVATAR_ENVELOPE.height + 0.3 && e.y1 > 0.05);
    assert.equal(hit, undefined, `portal at ${x.toFixed(2)},${d.toFixed(2)} blocked by ${hit?.zone} ${hit?.name}`);
  }
  built.dispose();
});

test('the imported desks (R19) are one draw, each exactly on its plan footprint at its height', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const desks = meshes(built.object).filter(mesh => mesh.name === 'desks');
  assert.equal(desks.length, 1);
  assert.ok(desks[0].isInstancedMesh && desks[0].count === 3);
  const drawn = parts(built.object).filter(part => part.mesh === desks[0]);
  for (const o of l0.obstacles.filter(item => item.kind === 'desk')) {
    const part = drawn.find(item => item.zone === `obstacle:${o.id}`);
    assert.ok(part, `${o.id} is drawn`);
    for (const [a, b] of [[part.e.x0, o.x0], [part.e.x1, o.x1], [part.e.d0, o.d0], [part.e.d1, o.d1], [part.e.y0, l0.floorElevation], [part.e.y1, l0.floorElevation + o.height]])
      assert.ok(Math.abs(a - b) < 1e-6, `${o.id}: ${a} vs ${b}`);
  }
  built.dispose();
});

test('disposing the graybox releases every instanced draw, desks and curtain wall included', () => {
  const built = buildPenthouseOffice(THREE, layout), instanced = meshes(built.object).filter(mesh => mesh.isInstancedMesh), released = new Set();
  assert.ok(instanced.length >= 3, 'the desks and both curtain-wall batches');
  for (const mesh of instanced) mesh.addEventListener('dispose', () => released.add(mesh));
  built.dispose();
  assert.equal(released.size, instanced.length);
});

test('the curtain wall is two draws, glass handled like the district storefront glazing', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const curtain = meshes(built.object).filter(mesh => mesh.name.startsWith('curtain wall'));
  assert.equal(curtain.length, 2, 'one batch of panes and one of frames');
  assert.ok(curtain.every(mesh => mesh.isInstancedMesh && mesh.userData.zones?.length === mesh.count && mesh.count >= 8));
  const panes = curtain.find(mesh => mesh.material.transparent), frames = curtain.find(mesh => !mesh.material.transparent);
  assert.ok(panes && frames);
  // Thin glazing never enters the AO depth buffer as an opaque sheet, never writes depth and casts no shadow.
  assert.equal(panes.userData.aoExclude, true);
  assert.equal(panes.material.depthWrite, false);
  assert.equal(panes.castShadow, false);
  // The opaque-walled graybox drew 53 meshes, and 60 once #400 added the desk and reading chairs
  // (measured on its pre-glazing head d1266a15); main's stair walk (bf6a7ad3) brought the glazed one
  // to 60, and R19's three desks add one instanced draw. Glazing must not cost more draws than walls.
  assert.ok(meshes(built.object).length <= 61, `graybox draw calls ${meshes(built.object).length}`);
  built.dispose();
});

test('each visit renders the geometry of its own admitted layout, and an unknown one refuses', () => {
  let legacy = 0;
  const buildLegacy = () => { legacy++; return { object: new THREE.Group(), dispose() {} }; };
  assert.equal(buildOfficeGeometry(THREE, 'office-legacy-1', { buildLegacy }).object.name, '');
  assert.equal(legacy, 1);
  const penthouse = buildOfficeGeometry(THREE, OFFICE_LAYOUT_PENTHOUSE, { buildLegacy });
  assert.equal(penthouse.object.name, `office:${OFFICE_LAYOUT_PENTHOUSE}`);
  penthouse.dispose();
  assert.throws(() => buildOfficeGeometry(THREE, 'office-penthouse-9', { buildLegacy }), /Unknown office layout/);
  assert.equal(legacy, 1, 'an unknown layout never falls back to the legacy room');
});

test('the mezzanine guard opens where the stair arrives, and nothing solid stands in a body walking the stair', async () => {
  const { officeElevationAt } = await import('../src/office-layouts.js');
  const built = buildPenthouseOffice(THREE, layout), all = parts(built.object), { stair } = layout;
  const guard = all.filter(({ zone }) => zone === 'guard');
  const lane = [stair.x[0] + AVATAR_ENVELOPE.turningRadius, stair.x[1] - AVATAR_ENVELOPE.turningRadius];
  for (const x of [lane[0], (lane[0] + lane[1]) / 2, lane[1]]) {
    assert.equal(guard.some(({ e }) => x >= e.x0 && x <= e.x1), false, `the guard leaves the stair head open at x ${x.toFixed(2)}`);
  }
  assert.ok(guard.some(({ e }) => e.x0 <= -14 && e.x1 >= stair.x[0] - 0.01) && guard.some(({ e }) => e.x0 <= stair.x[1] + 0.01 && e.x1 >= 14.9), 'and still runs either side of it');
  const solids = all.filter(({ zone }) => !['floor', 'mezzanine'].includes(zone.split(':')[0]) && zone !== 'shell:ceiling').map(({ e }) => e);
  for (let x = lane[0]; x <= lane[1] + 1e-9; x += 0.2) for (let d = stair.d[0] - 0.8; d <= stair.d[1] + 0.8; d += 0.05) {
    const y0 = officeElevationAt(layout, 'jevica-office/l0', [x, d]) + 0.01, y1 = y0 + AVATAR_ENVELOPE.height;
    const hit = solids.find(e => x >= e.x0 && x <= e.x1 && d >= e.d0 && d <= e.d1 && e.y1 > y0 && e.y0 < y1);
    assert.equal(hit, undefined, `walking the stair at ${x.toFixed(2)},${d.toFixed(2)} meets a solid at ${hit?.y0?.toFixed(2)}-${hit?.y1?.toFixed(2)} m`);
  }
  built.dispose();
});
