import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPixelRatio } from '../src/viewport.js';

test('native 4K and Retina 1080p share a bounded UHD render budget', () => {
  assert.equal(renderPixelRatio(3840, 2160, 2), 1);
  assert.equal(renderPixelRatio(1920, 1080, 2), 2);
  for (const [width, height] of [[3840, 2160], [7680, 4320], [5120, 1440], [390, 844]]) {
    const ratio = renderPixelRatio(width, height, 3);
    assert.ok(width * height * ratio ** 2 <= 3840 * 2160 + 1e-5);
    assert.ok(ratio > 0 && ratio <= 2);
  }
});

test('hidden or invalid viewports do not create a nonfinite render scale', () => {
  assert.equal(renderPixelRatio(0, 100, 2), 1);
  assert.equal(renderPixelRatio(100, NaN, 2), 1);
  assert.equal(renderPixelRatio(100, 100, Infinity), 1);
});
