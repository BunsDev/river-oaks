import test from 'node:test';
import assert from 'node:assert/strict';
import { paverSurface } from '../src/materials.js';

test('district paving uses shared authored strip maps with neutral stone and sparse terracotta', () => {
  const a = paverSurface(), b = paverSurface();
  assert.ok(a.map.isDataTexture, 'paving must use the authored strip pattern');
  assert.equal(a.map, b.map);
  assert.equal(a.normalMap, b.normalMap);
  const pixels = a.map.image.data;
  let gray = 0, clay = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.abs(pixels[i] - pixels[i + 2]) < 15) gray++;
    if (pixels[i] - pixels[i + 2] > 25) clay++;
    assert.equal(pixels[i + 3], 255);
  }
  assert.ok(gray > pixels.length / 4 * .7, 'stone dominates');
  assert.ok(clay > pixels.length / 4 * .02 && clay < pixels.length / 4 * .15, 'sparse clay accents');
  assert.equal(a.map.colorSpace, 'srgb');
  assert.equal(a.normalMap.colorSpace, '');
  assert.equal(a.roughnessMap.colorSpace, '');
  assert.equal(a.roughnessMap, a.aoMap);
  const arm = a.roughnessMap.image.data;
  for (let i = 0; i < arm.length; i += 4) {
    assert.ok(arm[i + 1] >= 190, 'stone stays rough');
    assert.equal(arm[i + 2], 0, 'stone is dielectric');
  }
  a.dispose(); b.dispose();
});
