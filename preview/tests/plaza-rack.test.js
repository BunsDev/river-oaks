import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { plazaSalonRack } from '../src/plaza-salon-plan.js';

// The planters' shared planting loads its model asynchronously and reports to the page.
globalThis.document ??= { querySelector: () => null, dispatchEvent: () => true };
globalThis.CustomEvent ??= class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const { buildPlazaSalon } = await import('../src/plaza-salon.js');

const district = JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url), 'utf8'));

test('the rack draws four parked bikes and hides the ones that are out', () => {
  const salon = buildPlazaSalon(district), rack = salon.userData.rack;
  assert.ok(rack, 'the salon exposes its rack');
  assert.equal(rack.slots, 4);
  assert.deepEqual(rack.parked(), [true, true, true, true]);
  assert.equal(rack.setTaken(['plaza-salon-rack:1', 'plaza-salon-rack:3']), true);
  assert.deepEqual(rack.parked(), [true, false, true, false]);
  assert.equal(rack.setTaken(['plaza-salon-rack:1', 'plaza-salon-rack:3']), false, 'no change reports false');
  assert.equal(rack.setTaken([]), true);
  assert.deepEqual(rack.parked(), [true, true, true, true]);
  const bikes = salon.getObjectByName('Parked bikes');
  assert.ok(bikes, 'parked bikes are one group');
  assert.equal(bikes.children.length, 4);
  const slot = plazaSalonRack(district)[2], bike = bikes.children[2];
  assert.ok(Math.abs(bike.position.x - slot.x) < 1e-9 && Math.abs(bike.position.z + slot.north) < 1e-9, 'a parked bike stands on its slot');
  assert.equal(salon.userData.counts.rackSlots, 4);
  rack.dispose();
});

// #289: the parked bikes cast sun shadow in one draw, with their own silhouette.
test('the parked bikes cast one instanced shadow proxy of their own triangles', async () => {
  const THREE = await import('three');
  const salon = buildPlazaSalon(district), rack = salon.userData.rack, bikes = salon.getObjectByName('Parked bikes');
  const casters = root => { const found = []; root.traverse(mesh => { if (mesh.isMesh && mesh.castShadow) found.push(mesh); }); return found; };
  const [proxy] = salon.userData.shadowProxies;
  assert.equal(salon.userData.shadowProxies.length, 1);
  assert.ok(proxy.isInstancedMesh && proxy.castShadow && !proxy.visible, 'a hidden instanced caster');
  assert.equal(proxy.count, 4);
  assert.equal(casters(bikes).length, 0, 'no bike part casts beside the proxy');
  salon.updateMatrixWorld(true);
  const proxyBox = i => {
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), box = new THREE.Box3(), position = proxy.geometry.getAttribute('position');
    proxy.getMatrixAt(i, matrix); matrix.premultiply(proxy.matrixWorld);
    for (let v = 0; v < position.count; v++) box.expandByPoint(point.fromBufferAttribute(position, v).applyMatrix4(matrix));
    return box;
  };
  const boxes = [...Array(4).keys()].map(proxyBox);
  assert.ok(rack.shadowProxy(false) > 40, 'switching it off restores every bike caster');
  assert.equal(salon.userData.shadowProxies.length, 0);
  const own = bikes.children.map(bike => casters(bike));
  assert.equal(own.flat().length, 4 * own[0].length);
  const triangles = mesh => (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
  assert.equal(proxy.geometry.getAttribute('position').count / 3, own[0].reduce((sum, mesh) => sum + triangles(mesh), 0), 'the same triangles as one bike');
  own.forEach((meshes, i) => {
    const box = new THREE.Box3(); meshes.forEach(mesh => box.expandByObject(mesh, true));
    for (const key of ["min", "max"]) assert.ok(box[key].distanceTo(boxes[i][key]) < 1e-5, `bike ${i} silhouette bounds match`);
  });
  rack.shadowProxy(true);
  assert.equal(casters(bikes).length, 0);
  rack.setTaken(['plaza-salon-rack:1']);
  // The linear part of the instance: zero collapses its triangles (decompose reports 1 for a singular matrix).
  const linear = i => { const matrix = new THREE.Matrix4(); proxy.getMatrixAt(i, matrix); return Math.hypot(...matrix.elements.slice(0, 11)); };
  assert.equal(linear(1), 0, 'a ridden bike leaves no parked shadow');
  rack.setTaken([]);
  assert.ok(linear(1) > 0, 'a returned bike casts again');
  rack.dispose();
});
