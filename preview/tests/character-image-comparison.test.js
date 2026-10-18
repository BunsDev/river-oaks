import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {customizedCharacterDefinition} from '../src/character-customization.js';
import {compareCharacterImages, compareHeroEnvironment, HERO_ENVIRONMENT_KEYS} from '../audit/character-image-comparison.js';

const image = (width, height, values) => ({width, height, pixels: new Uint8Array(values)});
test('hero comparison accepts identical pixels and bounded channel rounding', () => {
  const first = image(2, 1, [10, 20, 30, 255, 40, 50, 60, 255]);
  assert.equal(compareCharacterImages(first, first).passed, true);
  const round = image(2, 1, [11, 20, 30, 255, 40, 50, 60, 255]);
  const result = compareCharacterImages(first, round, {maxChannel: 2, meanChannel: .2, changedPixelFraction: 1});
  assert.equal(result.passed, true); assert.equal(result.maxChannel, 1);
  assert.equal(result.changedPixels, 1); assert.equal(result.meanChannel, .125);
});
test('localized missing geometry and broad low-amplitude color drift both fail', () => {
  const pixels = new Uint8Array(40000).fill(200), first = {width: 100, height: 100, pixels};
  const local = {...first, pixels: pixels.slice()}; local.pixels[0] = 0;
  const localized = compareCharacterImages(first, local);
  assert.equal(localized.passed, false); assert.equal(localized.maxChannel, 200);
  const drift = {...first, pixels: new Uint8Array(40000).fill(201)};
  assert.equal(compareCharacterImages(first, drift).passed, false);
});
test('comparison rejects dimensions, truncated buffers, malformed limits and alpha changes', () => {
  const first = image(1, 1, [0, 0, 0, 255]);
  assert.throws(() => compareCharacterImages(first, image(2, 1, new Array(8).fill(0))), /dimensions/);
  assert.throws(() => compareCharacterImages(first, image(1, 1, [0])), /buffer/);
  assert.throws(() => compareCharacterImages({...first, width: 0}, first), /dimensions/);
  assert.throws(() => compareCharacterImages(first, first, {maxChannel: Infinity}), /limits/);
  assert.equal(compareCharacterImages(first, image(1, 1, [0, 0, 0, 0])).passed, false);
});
test('environment pins reject browser, GPU, color pipeline and incomplete metadata changes', () => {
  const pinned = {...Object.fromEntries(HERO_ENVIRONMENT_KEYS.map(key => [key, `${key}-value`])), pixelRatio: 1, toneMapping: 4, exposure: 1.1, width: 3840, height: 2160, samples: 4};
  assert.deepEqual(compareHeroEnvironment(pinned, {...pinned}), {compatible: true, mismatches: []});
  for (const key of HERO_ENVIRONMENT_KEYS) {
    assert.equal(compareHeroEnvironment(pinned, {...pinned, [key]: 'changed'}).compatible, false, key);
    for (const invalid of [null, '', ' ', NaN, Infinity]) {
      const malformed = {...pinned, [key]: invalid};
      assert.equal(compareHeroEnvironment(malformed, malformed).compatible, false, `malformed ${key}: ${invalid}`);
    }
    const missing = {...pinned}; delete missing[key];
    assert.equal(compareHeroEnvironment(missing, pinned).compatible, false, `missing ${key}`);
  }
});

// Portable integrity gate; pixel fidelity still requires the pinned GPU check.
test('reviewed hero reference PNGs retain native dimensions, bytes and canonical identity', async () => {
  const root = new URL('../e2e/goldens/character-hero/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.kind, 'reviewed-render-reference');
  assert.equal(manifest.status, 'passed');
  assert(manifest.review.scope.trim() && manifest.review.limitations.trim());
  assert.equal(compareHeroEnvironment(manifest.environment, manifest.environment).compatible, true);
  assert.deepEqual(manifest.cases.map(value => value.appearanceId), ['sable-human']);
  for (const item of manifest.cases) {
    const bytes = await readFile(new URL(`${item.appearanceId}.png`, root));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 3840); assert.equal(bytes.readUInt32BE(20), 2160);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    assert.deepEqual(item.definition, customizedCharacterDefinition('hero-reference-fixture', item.appearanceId, {palette: 'rose', hair: 'espresso'}));
  }
});
