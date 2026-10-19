// Native RGBA8 comparisons on one pinned renderer. A local high-contrast defect
// must fail even when the large background makes the global mean error small.
export const HERO_IMAGE_LIMITS = Object.freeze({maxChannel: 2, meanChannel: .01, changedPixelFraction: .001});
export const HERO_ENVIRONMENT_KEYS = Object.freeze([
  'platform', 'osRelease', 'osVersion', 'architecture', 'browserVersion', 'browserSha256',
  'gpu', 'gpuVendor', 'webglVersion', 'threeRevision', 'pixelRatio', 'colorSpace',
  'toneMapping', 'exposure', 'preset', 'width', 'height', 'samples',
]);
const numericPins = new Set(['pixelRatio', 'toneMapping', 'exposure', 'width', 'height', 'samples']);
const validPin = (key, value) => numericPins.has(key)
  ? typeof value === 'number' && Number.isFinite(value) && value > 0
  : typeof value === 'string' && value.trim().length > 0;
export function compareHeroEnvironment(reference, current) {
  const mismatches = HERO_ENVIRONMENT_KEYS.filter(key => !validPin(key, reference?.[key]) || !validPin(key, current?.[key]) || reference[key] !== current[key]);
  return {compatible: mismatches.length === 0, mismatches};
}
export function compareCharacterImages(reference, current, limits = HERO_IMAGE_LIMITS) {
  for (const value of [reference, current]) {
    if (!Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width < 1 || value.height < 1) throw new TypeError('Invalid image dimensions');
    if (!(value.pixels instanceof Uint8Array || value.pixels instanceof Uint8ClampedArray) || value.pixels.length !== value.width * value.height * 4) throw new TypeError('Invalid RGBA8 buffer');
  }
  if (reference.width !== current.width || reference.height !== current.height) throw new TypeError('Image dimensions differ');
  if (!limits || !['maxChannel', 'meanChannel', 'changedPixelFraction'].every(key => Number.isFinite(limits[key]) && limits[key] >= 0) || limits.maxChannel > 255 || limits.meanChannel > 255 || limits.changedPixelFraction > 1) throw new TypeError('Invalid image-error limits');
  let maxChannel = 0, total = 0, changedPixels = 0;
  for (let i = 0; i < reference.pixels.length; i += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const difference = Math.abs(reference.pixels[i + channel] - current.pixels[i + channel]);
      maxChannel = Math.max(maxChannel, difference); total += difference; changed ||= difference !== 0;
    }
    if (changed) changedPixels++;
  }
  const meanChannel = total / reference.pixels.length, changedPixelFraction = changedPixels / (reference.width * reference.height);
  return {passed: maxChannel <= limits.maxChannel && meanChannel <= limits.meanChannel && changedPixelFraction <= limits.changedPixelFraction,
    maxChannel, meanChannel, changedPixels, changedPixelFraction};
}
