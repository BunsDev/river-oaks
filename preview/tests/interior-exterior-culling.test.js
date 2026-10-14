import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { canCullExterior, renderWithoutExterior } from '../src/interior-exterior-culling.js';

function cameraAt(position, look) {
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 100);
  camera.position.set(...position);
  camera.lookAt(...look);
  return camera;
}

function room(rotated = false) {
  return { generatedPlan: {}, floor: 0, height: 4, aMin: -5, aMax: 5,
    contains: rotated ? (east, north) => east < 0 && east > -9 && Math.abs(north) < 5
      : (east, north) => north > 0 && north < 9 && Math.abs(east) < 5,
    toWorld: rotated ? (a, d) => [-d, a] : (a, d) => [a, d] };
}

test('opaque interior view culls outdoors but frontage and exterior views retain it', () => {
  const straight = room();
  assert.equal(canCullExterior(cameraAt([0, 1.7, -4], [0, 1.7, -8]), straight), true);
  assert.equal(canCullExterior(cameraAt([0, 1.7, -0.6], [0, 1.7, -8]), straight), true);
  assert.equal(canCullExterior(cameraAt([0, 1.7, -4], [0, 1.7, 0]), straight), false);
  assert.equal(canCullExterior(cameraAt([0, 1.7, 2], [0, 1.7, -4]), straight), false);
  assert.equal(canCullExterior(cameraAt([0, 7, -4], [0, 1.7, -8]), straight), false);
  assert.equal(canCullExterior(cameraAt([0, 1.7, -4], [0, 1.7, -8]), { ...straight, generatedPlan: null }), false);
  const turned = room(true);
  assert.equal(canCullExterior(cameraAt([-4, 1.7, 0], [-8, 1.7, 0]), turned), true);
  assert.equal(canCullExterior(cameraAt([-4, 1.7, 0], [0, 1.7, 0]), turned), false);
});

test('one render hides only exterior children and restores all visibility on failure', () => {
  const world = new THREE.Group(), exterior = new THREE.Group(), interior = new THREE.Group(), userHidden = new THREE.Group();
  userHidden.visible = false;
  world.add(exterior, interior, userHidden);
  assert.throws(() => renderWithoutExterior(world, interior, () => {
    assert.equal(exterior.visible, false);
    assert.equal(interior.visible, true);
    assert.equal(userHidden.visible, false);
    throw new Error('render failed');
  }), /render failed/);
  assert.equal(exterior.visible, true);
  assert.equal(interior.visible, true);
  assert.equal(userHidden.visible, false);
});
