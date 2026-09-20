import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// HDR highlights bloom before tone mapping; the scene remains sharp and legible.
export function createRenderPipeline(renderer, scene, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
  const composer = new EffectComposer(renderer, target);
  const render = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.055, 0.2, 2.0);
  const output = new OutputPass();
  composer.addPass(render); composer.addPass(bloom); composer.addPass(output);
  return {
    resize(width, height, pixelRatio) { composer.setPixelRatio(pixelRatio); composer.setSize(width, height); },
    render(delta) { composer.render(delta); },
    dispose() { bloom.dispose(); output.dispose(); render.dispose(); composer.dispose(); },
  };
}
