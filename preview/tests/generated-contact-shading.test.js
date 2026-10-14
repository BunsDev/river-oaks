import assert from 'node:assert/strict';
import test from 'node:test';
import { generatedContactPixels, generatedContactShade } from '../src/generated-contact-shading.js';

const room = {
  aMin: -2, aMax: 2, width: 4, frontInset: 0.5, depth: 5,
  obstacles: [{ id: 'display', a0: -0.4, a1: 0.4, d0: 3.2, d1: 3.8 }],
};

test('generated floor shade follows approved fixture bounds and wall contact', () => {
  const open = generatedContactShade(room, 1, 2);
  const fixture = generatedContactShade(room, 0, 3.5);
  const wall = generatedContactShade(room, -1.99, 2);
  assert.ok(open > fixture + 0.05, 'fixture footprint darkens its floor contact');
  assert.ok(open > wall + 0.04, 'wall base darkens without changing geometry');
  assert.ok(fixture >= 0.78 && wall >= 0.78, 'darkening stays bounded');
  assert.equal(generatedContactShade({ ...room, obstacles: [...room.obstacles].reverse() }, 0, 3.5), fixture);
});

test('generated contact raster is stable and maps canvas top toward room back', () => {
  const pixels = generatedContactPixels(room, 64, 64);
  const at = (x, y) => pixels[(y * 64 + x) * 4];
  assert.equal(pixels.length, 64 * 64 * 4);
  assert.deepEqual(pixels, generatedContactPixels(room, 64, 64));
  assert.ok(at(32, 21) < at(32, 54), 'back fixture casts a fixed contact area');
  assert.equal(pixels[(21 * 64 + 32) * 4 + 3], 255, 'the floor texture stays opaque');
});
