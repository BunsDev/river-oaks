import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { photoCrop, createPhotoCamera } from '../src/photo-camera.js';

test('share crops stay centered, bounded and never upscale the rendered frame', () => {
  assert.deepEqual(photoCrop(1600, 900, 1), { x: 350, y: 0, width: 900, height: 900, outputWidth: 900, outputHeight: 900 });
  const portrait = photoCrop(3840, 2160, 4 / 5);
  assert.equal(portrait.width / portrait.height, 0.8);
  assert.equal(portrait.outputHeight, 2048);
  assert.ok(portrait.outputWidth <= 2048);
  const small = photoCrop(320, 200, 16 / 9);
  assert.ok(small.outputWidth <= 320 && small.outputHeight <= 200);
  assert.throws(() => photoCrop(0, 900, 1), /frame/);
  assert.throws(() => photoCrop(900, 900, -1), /ratio/);
});

test('photo framing changes only the camera and restores its exact pose/lens', () => {
  const camera = new THREE.PerspectiveCamera(42, 1.6, 0.06, 6000);
  camera.position.set(10, 3, 20); camera.lookAt(8, 2, 0);
  const original = camera.clone();
  const photo = createPhotoCamera(camera);
  photo.open();
  photo.set({ yaw: 35, pitch: 15, roll: -12, fov: 65, dolly: 2 });
  photo.update();
  assert.equal(camera.fov, 65);
  assert.ok(camera.position.distanceTo(original.position) > 1.9);
  assert.ok(camera.quaternion.angleTo(original.quaternion) > 0.1);
  camera.aspect = 0.75;
  photo.close();
  assert.deepEqual(camera.position.toArray(), original.position.toArray());
  assert.deepEqual(camera.quaternion.toArray(), original.quaternion.toArray());
  assert.equal(camera.fov, original.fov);
  assert.equal(camera.aspect, 0.75, 'window resizing must not be undone');
});

test('reset and repeated opens cannot overwrite the saved gameplay camera', () => {
  const camera = new THREE.PerspectiveCamera(42, 1);
  const photo = createPhotoCamera(camera);
  photo.open(); photo.set({ fov: 20, yaw: 90 }); photo.update(); photo.open();
  photo.reset(); photo.update();
  assert.equal(camera.fov, 42);
  assert.equal(camera.quaternion.angleTo(new THREE.Quaternion()), 0);
  photo.set({ fov: Infinity, dolly: 999 }); photo.update();
  assert.ok(Number.isFinite(camera.fov));
  assert.ok(camera.position.length() <= 4);
  photo.close(); photo.close();
  assert.equal(camera.fov, 42);
});
