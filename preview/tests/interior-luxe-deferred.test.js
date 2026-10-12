import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// A canvas stand-in: enough 2D context for the procedural surfaces, and a log
// of how big each drawn canvas was. Idle callbacks queue until the test runs them.
const drawn = [], idleQueue = [];
const context = () => new Proxy({}, { get: (target, name) => name === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : name in target ? target[name] : () => {}, set: (target, name, value) => { target[name] = value; return true; } });
globalThis.document = { createElement: () => { const canvas = { width: 0, height: 0, getContext: () => { drawn.push([canvas.width, canvas.height]); return context(); } }; return canvas; } };
globalThis.requestIdleCallback = callback => idleQueue.push(callback);
const { createLuxeFinishes } = await import('../src/interior-luxe.js');
const drain = () => { while (idleQueue.length) idleQueue.shift()(); };
const factories = () => ({ standard: options => new THREE.MeshStandardMaterial(options), physical: options => new THREE.MeshPhysicalMaterial(options), track: { t: t => t, m: m => m, g: g => g } });

test('floor surfaces load as swatches and receive their full canvases in idle slots', () => {
  const luxe = createLuxeFinishes(factories());
  const floors = Object.values(luxe.floors);
  assert.ok(floors.length >= 8);
  for (const floor of floors) assert.deepEqual([floor.map.image.width, floor.map.image.height], [1, 1], `${floor.name} starts as a swatch`);
  assert.ok(drawn.every(([w, h]) => w * h <= 256 * 4), 'nothing large is drawn while the interiors are built');
  const reallocated = new Set();
  for (const floor of floors) floor.map.addEventListener('dispose', () => reallocated.add(floor.map));
  assert.ok(idleQueue.length > 0, 'surface work is queued for idle time');
  // A build torn down before its slot: that surface is skipped, not drawn.
  luxe.floors.carpet.map.dispose();
  drain();
  assert.deepEqual([luxe.floors.carpet.map.image.width, luxe.floors.carpet.map.image.height], [1, 1], 'a disposed texture is not drawn');
  for (const floor of floors.filter(floor => floor !== luxe.floors.carpet)) {
    assert.ok(floor.map.image.width >= 512, `${floor.name} receives its full canvas`);
    assert.ok(reallocated.has(floor.map), `${floor.name} releases its 1 x 1 GPU storage before the larger upload`);
    assert.equal(floor.map.userData.disposed, undefined, `${floor.name} is still live after the swap`);
    assert.equal(floor.emissiveMap, floor.map, 'the material keeps one map, so nothing recompiles');
  }
});

test('a rebuild reuses drawn canvases and queues only the surface that was never drawn', () => {
  const again = createLuxeFinishes(factories());
  for (const [name, floor] of Object.entries(again.floors)) {
    if (name === 'carpet') assert.equal(floor.map.image.width, 1, 'the skipped surface is queued again');
    else assert.ok(floor.map.image.width >= 512, `${name} reuses its cached canvas immediately`);
  }
  assert.equal(idleQueue.length, 1);
  drain();
  assert.ok(again.floors.carpet.map.image.width >= 512);
});
