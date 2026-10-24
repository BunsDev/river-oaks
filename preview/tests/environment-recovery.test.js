import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEnvironmentAssets } from '../src/materials.js';

test('restoration regenerates PMREM pixels from retained HDR and releases the obsolete target', () => {
  const scene = new THREE.Scene(), hdr = new THREE.DataTexture(new Float32Array(4), 1, 1), targets = [];
  let hdrDisposed = 0, filtersDisposed = 0;
  hdr.addEventListener('dispose', () => hdrDisposed++);
  const assets = createEnvironmentAssets({ scene, hdr, createGenerator: () => ({
    fromEquirectangular(source) { assert.equal(source, hdr); const target = new THREE.WebGLRenderTarget(1, 1); target.addEventListener('dispose', () => { target.released = true; }); targets.push(target); return target; },
    dispose() { filtersDisposed++; },
  }) });
  assets.restore(); const first = scene.environment;
  assets.restore(); assert.notEqual(scene.environment, first); assert.equal(scene.environment, targets[1].texture);
  assert.equal(scene.background, hdr); assert.equal(targets[0].released, true); assert.equal(hdrDisposed, 0); assert.equal(filtersDisposed, 2);
  assets.dispose(); assert.equal(hdrDisposed, 1); assert.equal(targets[1].released, true);
});
