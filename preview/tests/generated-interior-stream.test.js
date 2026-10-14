import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createGeneratedInteriorStream } from '../src/generated-interior-stream.js';

const room = { planId: 'gallery/l0', facade: [0, 0], floor: 0, outward: [1, 0],
  frontInset: 0.5, depth: 8, center: 0, width: 6, height: 3.9, aMin: -3, aMax: 3 };

test('generated detail prepares near the entrance, evicts after departure, and cancels stale world work', () => {
  const parent = new THREE.Group(), queued = new Map(), cancelled = new Set();
  let next = 0, builds = 0, disposals = 0;
  const stream = createGeneratedInteriorStream([room], parent, {
    schedule(callback) { const id = ++next; queued.set(id, callback); return id; },
    cancel(id) { cancelled.add(id); queued.delete(id); },
    build() { builds++; const detail = new THREE.Group(); detail.userData.dispose = () => { disposals++; }; return detail; },
  });
  const near = new THREE.Vector3(0, 1.7, 0), far = new THREE.Vector3(50, 1.7, 0);
  assert.equal(parent.children.length, 1, 'a cheap collision-ready shell is present immediately');
  stream.update(far, 0);
  assert.equal(builds, 0);
  stream.update(near, 1);
  assert.equal(queued.size, 1);
  stream.update(near, 2);
  assert.equal(queued.size, 1, 'a second frame does not schedule duplicate work');
  queued.get(1)(); queued.delete(1);
  assert.equal(stream.readyFor(room.planId), true);
  assert.equal(parent.children.length, 2);
  assert.equal(parent.children[0].visible, false);
  stream.update(far, 3);
  stream.update(far, 12004);
  assert.equal(disposals, 1);
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0].visible, true);
  stream.update(near, 12005);
  assert.equal(queued.size, 1);
  stream.dispose();
  assert.equal(cancelled.has(2), true);
  assert.equal(parent.children.length, 0);
  stream.update(near, 12006);
  assert.equal(builds, 1, 'disposed world work cannot regenerate the old scene');
});
