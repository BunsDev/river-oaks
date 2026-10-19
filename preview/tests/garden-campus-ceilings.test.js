import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAMPUS_BODY, CAMPUS_HEADROOM, GARDEN_CAMPUS_LAYOUT as CAMPUS } from '../../shared/garden-campus-layout.js';
import { buildCampusCeilings, campusCeilings } from '../src/garden-campus-ceilings.js';

test('every occupied floor has a lit ceiling under its slab, inside its plate, above standing clearance', () => {
  const ceilings = campusCeilings(), floors = CAMPUS.towers.flatMap(tower => tower.levels), slab = CAMPUS.bridges[0].slab;
  assert.deepEqual(CAMPUS.towers.map(tower => tower.levels.length), [6, 7, 6]);
  assert.equal(ceilings.length, floors.length);
  for (const floor of floors) {
    const ceiling = ceilings.find(item => item.id === `${floor.id}/ceiling`), [p0, q0, p1, q1] = floor.rect, [u0, v0, u1, v1] = ceiling.rect;
    assert.ok(Math.abs(ceiling.z1 - (floor.z1 - slab)) < 1e-9, `${floor.id}: under its slab`);
    assert.ok(u0 > p0 && v0 > q0 && u1 < p1 && v1 < q1, `${floor.id}: inside its plate`);
    assert.ok(ceiling.z0 - floor.z0 >= CAMPUS_BODY.height + CAMPUS_HEADROOM, `${floor.id}: a standing body clears it`);
  }
  // Each skywalk portal keeps its full clear height under the ceiling of the floor it opens.
  for (const portal of CAMPUS.bridges.flatMap(bridge => bridge.portals)) {
    const floor = CAMPUS.towers.find(tower => tower.id === portal.tower).levels.find(item => item.z0 === portal.position[2]);
    assert.ok(ceilings.find(item => item.id === `${floor.id}/ceiling`).z0 - floor.z0 >= portal.clearHeight, `${portal.id} keeps ${portal.clearHeight} m`);
  }
});

test('the ceilings draw as one light instanced mesh and release what they own', () => {
  const group = buildCampusCeilings(), mesh = group.children.find(child => child.name === 'campus:ceiling');
  assert.equal(mesh.count, campusCeilings().length);
  const color = mesh.material.color, light = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  assert.ok(light > 0.8 && mesh.material.emissiveIntensity > 0, 'a pale plaster with a faint bounce, not the slab underside');
  let disposed = 0;
  for (const item of [mesh.geometry, mesh.material]) item.addEventListener('dispose', () => disposed++);
  group.userData.dispose();
  assert.equal(disposed, 2);
  assert.ok(mesh.geometry instanceof THREE.BoxGeometry);
});
