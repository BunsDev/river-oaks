import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Ground-truth ambient occlusion darkens recesses, soffits and contact edges
// that the single sun and sky probe leave flat. It runs at half resolution
// above roughly 1440p so UHD keeps its frame budget; the Poisson denoise
// then hides the upsampling.
export const AO_FULL_RESOLUTION_PIXELS = 2560 * 1440;

export function aoResolutionScale(effectiveWidth, effectiveHeight) {
  return effectiveWidth * effectiveHeight > AO_FULL_RESOLUTION_PIXELS ? 0.5 : 1;
}

// Alpha-tested leaf cards and thin storefront glazing would enter the AO
// depth buffer as opaque sheets. They are hidden during the geometry pass only.
export function isOcclusionExcluded(object) {
  return Boolean(object.userData?.aoExclude);
}

export function createRenderPipeline(renderer, scene, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
  const composer = new EffectComposer(renderer, target);
  const render = new RenderPass(scene, camera);
  const occlusion = new GTAOPass(scene, camera, 1, 1, {}, {
    radius: 1.3, distanceExponent: 1.0, thickness: 1.0, scale: 2.2, samples: 10, distanceFallOff: 1, screenSpaceRadius: false,
  }, { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
  occlusion.output = GTAOPass.OUTPUT.Default;
  occlusion.blendIntensity = 1.0;
  const hidden = [];
  const overrideVisibility = occlusion._overrideVisibility.bind(occlusion);
  const restoreVisibility = occlusion._restoreVisibility.bind(occlusion);
  occlusion._overrideVisibility = () => {
    scene.traverse(object => { if (object.visible && isOcclusionExcluded(object)) { object.visible = false; hidden.push(object); } });
    overrideVisibility();
  };
  occlusion._restoreVisibility = () => {
    restoreVisibility();
    hidden.forEach(object => { object.visible = true; });
    hidden.length = 0;
  };
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.055, 0.2, 2.0);
  const output = new OutputPass();
  composer.addPass(render); composer.addPass(occlusion); composer.addPass(bloom); composer.addPass(output);
  let size = { width: 1, height: 1, pixelRatio: 1 };
  return {
    occlusion,
    resize(width, height, pixelRatio) {
      size = { width, height, pixelRatio };
      composer.setPixelRatio(pixelRatio); composer.setSize(width, height);
      const scale = aoResolutionScale(width * pixelRatio, height * pixelRatio);
      occlusion.setSize(Math.max(1, Math.round(width * pixelRatio * scale)), Math.max(1, Math.round(height * pixelRatio * scale)));
    },
    setOcclusion(enabled) { occlusion.enabled = enabled; },
    get stats() { return { ao: occlusion.enabled, aoScale: aoResolutionScale(size.width * size.pixelRatio, size.height * size.pixelRatio) }; },
    render(delta) { composer.render(delta); },
    dispose() { occlusion.dispose(); bloom.dispose(); output.dispose(); render.dispose(); composer.dispose(); },
  };
}
