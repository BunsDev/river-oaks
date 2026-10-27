import test from 'node:test';
import assert from 'node:assert/strict';
import {deltaE, maskOverlap, regionChange, srgbToLab} from '../lib/appearance-regions.mjs';

const mask = cells => {
  const bits = new Uint8Array(2);
  for (const cell of cells) bits[cell >> 3] |= 1 << (cell & 7);
  return {cell: 8, columns: 4, rows: 4, bits: Buffer.from(bits).toString('base64')};
};

test('sRGB converts to CIELAB at the D65 white and black points', () => {
  const white = srgbToLab([255, 255, 255]), black = srgbToLab([0, 0, 0]);
  assert.ok(Math.abs(white[0] - 100) < .01 && Math.abs(white[1]) < .01 && Math.abs(white[2]) < .01, `white ${white}`);
  assert.ok(Math.hypot(...black) < .01, `black ${black}`);
  // A just-noticeable change in a mid-tone stays small; a hair-colour swap does not.
  assert.ok(deltaE(srgbToLab([194, 160, 133]), srgbToLab([196, 161, 134])) < 1.5);
  assert.ok(deltaE(srgbToLab([194, 160, 133]), srgbToLab([77, 48, 44])) > 30);
});

test('mask overlap is intersection over union and refuses different grids', () => {
  assert.equal(maskOverlap(mask([0, 1, 2, 3]), mask([0, 1, 2, 3])), 1);
  assert.equal(maskOverlap(mask([0, 1, 2, 3]), mask([2, 3, 4, 5])), 2 / 6);
  assert.equal(maskOverlap(mask([]), mask([])), 1);
  assert.throws(() => maskOverlap(mask([0]), {...mask([0]), columns: 8}), /Mask sizes differ/);
});

test('region change reports colour, area and silhouette, and nothing for an absent region', () => {
  const base = {pixels: 400, meanSRGB: [194, 160, 133], mask: mask([0, 1, 2, 3])};
  const darker = {pixels: 380, meanSRGB: [174, 140, 113], mask: mask([0, 1, 2])};
  const change = regionChange(base, darker);
  assert.ok(change.deltaE > 5 && change.lightness < 0);
  assert.equal(change.areaRatio, .95); assert.equal(change.overlap, .75);
  assert.ok(Math.abs(change.hueShift) < 5, 'a darker shade of the same hair keeps its hue');
  assert.equal(regionChange(null, darker), null);
  assert.equal(regionChange(base, {pixels: 0, meanSRGB: null, mask: mask([])}), null);
});
