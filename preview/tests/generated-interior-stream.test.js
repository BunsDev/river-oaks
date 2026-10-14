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

test('only the occupied level and its connected landings prepare while upper floors evict after departure', () => {
  const level = (index, neighbors) => ({ ...room, planId: `gallery/l${index}`, buildingId: 'gallery',
    floor: index * 4.2, generatedPlan: { index, portals: neighbors.map(next => ({ toLevelId: `gallery/l${next}` })) } });
  const rooms = [level(0, [1]), level(1, [0, 2]), level(2, [1]), level(3, [])];
  const parent = new THREE.Group(), queued = new Map(), builds = [], disposals = [];
  let next = 0;
  const stream = createGeneratedInteriorStream(rooms, parent, {
    schedule(callback) { const id = ++next; queued.set(id, callback); return id; },
    cancel(id) { queued.delete(id); },
    build(target) { builds.push(target.planId); const detail = new THREE.Group();
      detail.userData.dispose = () => disposals.push(target.planId); return detail; },
  });
  const near = new THREE.Vector3(0, 1.7, 0);
  const flush = () => { for (const [id, callback] of queued) { queued.delete(id); callback(); } };
  stream.update(near, 1);
  flush();
  assert.deepEqual(builds, ['gallery/l0'], 'the street prepares only its enterable floor');
  stream.update(near, 2, 'gallery/l0');
  assert.equal(queued.size, 1);
  stream.update(near, 2.5);
  assert.equal(queued.size, 0, 'leaving before preparation cancels the upper-level build');
  stream.update(near, 2.75, 'gallery/l0');
  flush();
  assert.deepEqual(builds, ['gallery/l0', 'gallery/l1'], 'ground occupancy prewarms the connected landing');
  stream.update(near, 3, 'gallery/l1');
  flush();
  assert.deepEqual(builds, ['gallery/l0', 'gallery/l1', 'gallery/l2']);
  assert.equal(stream.readyFor('gallery/l3'), false, 'unconnected floors remain shells');
  stream.update(near, 4);
  stream.update(near, 12005);
  assert.deepEqual(disposals, ['gallery/l1', 'gallery/l2'], 'upper detail releases after leaving the building');
  assert.equal(stream.readyFor('gallery/l0'), true);
  stream.dispose();
});
