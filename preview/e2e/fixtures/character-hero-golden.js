import * as THREE from 'three';
import {createCharacterHero, CHARACTER_HERO_PRESET} from '../../src/character-hero.js';
import {characterPortraitPNG, CHARACTER_PORTRAIT_SIZE} from '../../src/character-portrait.js';
import {customizedCharacterDefinition} from '../../src/character-customization.js';
import {compareCharacterImages} from '../../audit/character-image-comparison.js';

const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false});
renderer.setPixelRatio(1); renderer.setSize(960, 540);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
document.body.append(renderer.domElement);
const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
const dataURL = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
});
async function decode(url) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  try {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', {colorSpace: 'srgb'}); context.drawImage(bitmap, 0, 0);
    return {width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data};
  } finally { bitmap.close(); }
}
window.heroGoldenFixture = {
  environment: {gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    gpuVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null, webglVersion: gl.getParameter(gl.VERSION),
    threeRevision: THREE.REVISION, pixelRatio: renderer.getPixelRatio(), colorSpace: renderer.outputColorSpace,
    toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, preset: CHARACTER_HERO_PRESET,
    ...CHARACTER_PORTRAIT_SIZE, samples: 4},
  async capture(appearanceId) {
    const definition = customizedCharacterDefinition('hero-reference-fixture', appearanceId, {palette: 'rose', hair: 'espresso'});
    const hero = await createCharacterHero({definition, ownerId: definition.ownerId});
    try {
      const {blob} = await characterPortraitPNG({renderer, scene: hero.scene, camera: hero.camera});
      return {definition, png: await dataURL(blob)};
    } finally { hero.dispose(); }
  },
  async compare({reference, current, limits}) {
    return compareCharacterImages(await decode(reference), await decode(current), limits);
  },
  dispose() { renderer.dispose(); renderer.forceContextLoss(); },
};
document.body.dataset.ready = 'true';
