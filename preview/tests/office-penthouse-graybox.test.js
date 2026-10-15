import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_ENVELOPE } from '../src/workplace-room.js';
import { OFFICE_LAYOUT_PENTHOUSE, officeLayout, officeLevelFree } from '../src/office-layouts.js';
import { buildOfficeGeometry, buildPenthouseOffice } from '../src/office-penthouse-graybox.js';

const layout = officeLayout(OFFICE_LAYOUT_PENTHOUSE);
const [l0, l1] = layout.levels;
const meshes = object => { const out = []; object.updateMatrixWorld(true); object.traverse(node => { if (node.isMesh) out.push(node); }); return out; };
// Plan coordinates of a mesh's world bounds: x across, d inward, y up.
const extent = mesh => { const box = new THREE.Box3().setFromObject(mesh); return { x0: box.min.x, x1: box.max.x, y0: box.min.y, y1: box.max.y, d0: -box.max.z, d1: -box.min.z }; };
const inside = (e, r, eps = 1e-6) => e.x0 >= r.x0 - eps && e.x1 <= r.x1 + eps && e.d0 >= r.d0 - eps && e.d1 <= r.d1 + eps;

test('every graybox mesh is tagged with a plan zone and stays inside it', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const all = meshes(built.object);
  assert.ok(all.length > 20);
  for (const mesh of all) {
    const zone = mesh.userData.zone, e = extent(mesh);
    assert.equal(typeof zone, 'string', `${mesh.name} has a zone`);
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
      assert.ok(onEdge, `${zone} ${mesh.name} sits on the perimeter or the ceiling`);
    } else assert.fail(`unknown zone ${zone}`);
  }
  built.dispose();
});

test('the arrival doorway on the entrance wall stays open', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const door = { x0: -0.85, x1: 0.85, d0: -0.2, d1: 0.2 };
  for (const mesh of meshes(built.object)) {
    const e = extent(mesh);
    const overlaps = e.x1 > door.x0 + 1e-6 && e.x0 < door.x1 - 1e-6 && e.d1 > door.d0 && e.d0 < door.d1 && e.y0 < 2.6 - 1e-6 && e.y1 > 0.01;
    assert.equal(overlaps, false, `${mesh.userData.zone} ${mesh.name} blocks the doorway`);
  }
  built.dispose();
});

test('art agrees with collision: nothing solid stands where the server lets a body walk', () => {
  const built = buildPenthouseOffice(THREE, layout);
  const solids = meshes(built.object).filter(mesh => !['floor', 'mezzanine'].includes(mesh.userData.zone.split(':')[0]) && mesh.userData.zone !== 'shell:ceiling').map(extent);
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
