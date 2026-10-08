import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
// Named AO output modes for debugging views (?ao=only), instead of bare numbers.
export const AO_OUTPUT = GTAOPass.OUTPUT;
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

// Three advances its frame counter on every renderer.render() call, and the
// composer makes several per animation frame (beauty, AO normals, refraction).
// Each call recomputed every skeleton and re-uploaded its bone texture. Bones
// only move between animation frames, so while the composer runs each skeleton
// updates once. Explicit skeleton.update() calls outside rendering still run.
const composedSkeletons = new WeakMap();
let composeFrameCount = 0, composing = false;
const updateSkeleton = THREE.Skeleton.prototype.update;
function updateSkeletonOncePerFrame() {
  if (composing) {
    if (composedSkeletons.get(this) === composeFrameCount) return;
    composedSkeletons.set(this, composeFrameCount);
  }
  updateSkeleton.call(this);
}
if (THREE.Skeleton.prototype.update === updateSkeleton) THREE.Skeleton.prototype.update = updateSkeletonOncePerFrame;
export function composeFrame(render) {
  composeFrameCount++; composing = true;
  try { return render(); } finally { composing = false; }
}

// Visit only visible branches so new props and room visibility changes apply
// immediately; excluded groups and hidden rooms prune their entire subtree.
export function createRenderPipeline(renderer, scene, camera, { samples = 4, bloom: bloomEnabled = true } = {}) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(samples, renderer.capabilities.maxSamples) });
  const composer = new EffectComposer(renderer, target);
  const render = new RenderPass(scene, camera);
  const occlusion = new GTAOPass(scene, camera, 1, 1, {}, {
    radius: 1.3, distanceExponent: 1.0, thickness: 1.0, scale: 2.2, samples: 10, distanceFallOff: 1, screenSpaceRadius: false,
  }, { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
  occlusion.output = GTAOPass.OUTPUT.Default;
  occlusion.blendIntensity = 1.0;
  const hidden = [], pending = [];
  occlusion._overrideVisibility = () => {
    // Fold GTAO's line/point exclusion into the foliage/glass pass. Hidden
    // rooms and excluded groups already hide their descendants; do not scan
    // those skeletons or change their own visibility flags.
    pending.push(scene);
    while(pending.length) {
      const object=pending.pop();
      if(!object.visible)continue;
      if(isOcclusionExcluded(object)||object.isPoints||object.isLine||object.isLine2) {
        object.visible=false;hidden.push(object);continue;
      }
      for(const child of object.children)pending.push(child);
    }
  };
  occlusion._restoreVisibility = () => {
    for(const object of hidden)object.visible=true;
    hidden.length = 0;
  };
  const renderGeometry = occlusion._renderOverride.bind(occlusion);
  const geometryClearColor = new THREE.Color();
  occlusion._renderOverride = (renderer, ...args) => {
    // The beauty pass has already updated this frame's transforms and shadows.
    // Normal/depth rendering needs neither a second skeleton traversal nor a
    // second sun-shadow render with the foliage temporarily hidden.
    const shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate;
    const matrixAuto=scene.matrixWorldAutoUpdate,override=scene.overrideMaterial,autoClear=renderer.autoClear;
    const clearAlpha=renderer.getClearAlpha();renderer.getClearColor(geometryClearColor);
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;scene.matrixWorldAutoUpdate=false;
    try { return renderGeometry(renderer,...args); }
    finally {
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;
      scene.matrixWorldAutoUpdate=matrixAuto;scene.overrideMaterial=override;renderer.autoClear=autoClear;
      renderer.setClearColor(geometryClearColor,clearAlpha);
      occlusion._restoreVisibility();
    }
  };
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.055, 0.2, 2.0);
  bloom.enabled = bloomEnabled;
  const output = new OutputPass();
  composer.addPass(render); composer.addPass(occlusion); composer.addPass(bloom); composer.addPass(output);
  let size = { width: 1, height: 1, pixelRatio: 1 }, renderScale = 1, sized = false;
  const applySize = () => {
    // The canvas keeps its native pixel ratio. The scene and every pass buffer
    // render at renderScale of it, and the output pass upsamples to the canvas.
    const { width, height } = size, pixelRatio = size.pixelRatio * renderScale;
    composer.setPixelRatio(pixelRatio); composer.setSize(width, height);
    const scale = aoResolutionScale(width * pixelRatio, height * pixelRatio);
    // Crystal and glass refraction samples a separate opaque-scene texture.
    // Bound that texture at UHD, without reducing the main image or geometry.
    renderer.transmissionResolutionScale=scale;
    occlusion.setSize(Math.max(1, Math.round(width * pixelRatio * scale)), Math.max(1, Math.round(height * pixelRatio * scale)));
  };
  return {
    occlusion,
    resize(width, height, pixelRatio) { if(width<=0||height<=0)return; size = { width, height, pixelRatio }; applySize(); sized=true; },
    // Graphics quality: 1 is native resolution. Changing it reallocates buffers.
    setRenderScale(scale) {
      const next = Math.min(1, Math.max(0.25, Number(scale) || 1));
      if (next === renderScale) return;
      renderScale = next; applySize();
    },
    setOcclusion(enabled) { occlusion.enabled = enabled; },
    get stats() { return { samples: target.samples, ao: occlusion.enabled, bloom: bloom.enabled, renderScale, aoScale: aoResolutionScale(size.width * size.pixelRatio * renderScale, size.height * size.pixelRatio * renderScale), transmissionScale:renderer.transmissionResolutionScale }; },
    render(delta) { if(sized)composeFrame(() => composer.render(delta)); },
    dispose() { occlusion.dispose(); bloom.dispose(); output.dispose(); render.dispose(); composer.dispose(); },
  };
}
