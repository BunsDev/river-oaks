import {verifyBakeProvenance} from '../../scripts/lib/bake-provenance.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createDressSkirtGeometry, subdivideSkirtGeometry} from '../src/skirt-geometry.js';
import {SKIRT_SEAT_MORPH} from '../src/skirt-seat-morph-data.js';

test('the seated corrective retains its source provenance and bounded finite data', async () => {
  const root = new URL('../../', import.meta.url);
  const receipt = JSON.parse(await readFile(new URL('preview/src/skirt-seat-morph-receipt.json', root), 'utf8'));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  await verifyBakeProvenance({root, bake: 'skirt-seat', receipt});
  assert.equal(hash(await readFile(new URL('preview/src/skirt-seat-morph-data.js', root))), receipt.outputSha256);
  assert(SKIRT_SEAT_MORPH.positionDelta.every(value => Number.isFinite(value) && Math.abs(value) < .25));
  assert(SKIRT_SEAT_MORPH.normalDelta.every(value => Number.isFinite(value) && Math.abs(value) <= 2));
  assert.equal(receipt.diagnostic.penetrating, 0);
});

test('subdivision preserves the authored rest surface and does not mutate another skirt', () => {
  const original = createDressSkirtGeometry({slit: true}), geometry = original.clone();
  const count = geometry.attributes.position.count, indices = [], weights = [];
  for (let i = 0; i < count; i++) { indices.push(0, 1, 2, 0); weights.push(.5, .25, .25, 0); }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const sourcePositions = original.attributes.position.array.slice();
  try {
    subdivideSkirtGeometry(geometry);
    const point = i => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i);
    for (let t = 0; t < original.index.count / 3; t++) {
      const triangle = new THREE.Triangle(...[0, 1, 2].map(c => new THREE.Vector3().fromBufferAttribute(original.attributes.position, original.index.getX(t * 3 + c))));
      let area = 0;
      for (let child = 0; child < 4; child++) {
        const vertices = [0, 1, 2].map(c => point(geometry.index.getX(t * 12 + child * 3 + c)));
        area += new THREE.Triangle(...vertices).getArea();
        for (const vertex of vertices) assert(triangle.closestPointToPoint(vertex, new THREE.Vector3()).distanceTo(vertex) < 1e-7);
      }
      assert(Math.abs(area - triangle.getArea()) < 1e-8, 'children cover the same triangle');
    }
    assert.deepEqual(original.attributes.position.array, sourcePositions);
  } finally { original.dispose(); geometry.dispose(); }
});


test('Vesper garment and trim preserve the pinned source receipt and valid joint weights', async () => {
  const root = new URL('../../', import.meta.url);
  const {VESPER_SKIRT_MORPH, VESPER_TRIM_MORPH} = await import('../src/vesper-skirt-morph-data.js');
  const receipt = JSON.parse(await readFile(new URL('preview/src/vesper-skirt-morph-receipt.json', root), 'utf8'));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  await verifyBakeProvenance({root, bake: 'vesper-skirt', receipt});
  assert.equal(hash(await readFile(new URL('preview/src/vesper-skirt-morph-data.js', root))), receipt.outputSha256);
  for (const data of [VESPER_SKIRT_MORPH, VESPER_TRIM_MORPH]) {
    assert(data.positionDelta.every(value => Number.isFinite(value) && Math.abs(value) < .25));
    assert(data.normalDelta.every(value => Number.isFinite(value) && Math.abs(value) <= 2));
  }
  for (let i = 0; i < VESPER_TRIM_MORPH.fittedWeights.length; i += 4) {
    const weights = VESPER_TRIM_MORPH.fittedWeights.slice(i, i + 4);
    assert(weights.every(value => value >= 0 && value <= 1));
    assert(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
  }
});
