import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBatch } from '../src/city-kit/render.js';

// The batch writes boxes straight into per-material arrays. The reference is the path it
// replaced: clone a unit box, BufferGeometry.applyMatrix4, metric UVs, toNonIndexed, merge.
const unit = new THREE.BoxGeometry(1, 1, 1);
function referenceBox(east, up, north, along, height, across, yaw = 0, pitch = 0) {
  const geometry = unit.clone(), matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  geometry.applyMatrix4(matrix.compose(new THREE.Vector3(east, up, -north), quaternion, new THREE.Vector3(along, height, across)));
  const { position, normal, uv } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i), nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, x, z); else if (nx >= nz) uv.setXY(i, z, y); else uv.setXY(i, x, y);
  }
  return geometry.toNonIndexed();
}
const bytes = attribute => Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
// A small deterministic generator, so a failure names a reproducible case.
const random = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

test('batched boxes are byte-identical to cloned, transformed and de-indexed unit boxes, in insertion order', () => {
  const next = random(583), stone = new THREE.MeshStandardMaterial({ name: 'stone' }), trim = new THREE.MeshStandardMaterial({ name: 'trim' });
  const batch = createBatch(), expected = new Map([[stone, []], [trim, []]]);
  for (let i = 0; i < 400; i++) {
    const material = next() < .6 ? stone : trim;
    const args = [(next() - .5) * 4000, next() * 70, (next() - .5) * 3000, .05 + next() * 30, .05 + next() * 20, .05 + next() * 30,
      next() < .3 ? 0 : (next() - .5) * 2 * Math.PI, next() < .8 ? 0 : (next() - .5) * .6];
    batch.box(material, ...args); expected.get(material).push(referenceBox(...args));
    // Other geometry between boxes keeps its place in the merge.
    if (i % 37 === 0) {
      const plane = new THREE.PlaneGeometry(1 + i % 5, 2); batch.mesh(material, plane, i, 1, -i, i / 10);
      const copy = plane.clone(); copy.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(i, 1, i), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i / 10, 0)), new THREE.Vector3(1, 1, 1)));
      expected.get(material).push(copy.toNonIndexed());
    }
  }
  const group = new THREE.Group(), geometries = batch.build(group, 'batch');
  assert.equal(geometries.length, 2);
  assert.deepEqual(group.children.map(mesh => mesh.name), ['batch:stone', 'batch:trim']);
  for (const mesh of group.children) {
    const reference = mergeGeometries(expected.get(mesh.material), false);
    assert.deepEqual(Object.keys(mesh.geometry.attributes), Object.keys(reference.attributes));
    for (const name of Object.keys(reference.attributes)) assert.ok(bytes(mesh.geometry.attributes[name]).equals(bytes(reference.attributes[name])), `${mesh.name} ${name} differs`);
    assert.equal(mesh.geometry.index, null);
    assert.ok(mesh.geometry.boundingSphere.radius > 0);
  }
  // A built batch starts empty: the next build adds nothing from the last.
  assert.deepEqual(batch.build(new THREE.Group(), 'again'), []);
});
