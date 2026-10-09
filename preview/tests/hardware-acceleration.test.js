import test from 'node:test';
import assert from 'node:assert/strict';
import { usesSoftwareRendering } from '../src/hardware-acceleration.js';

function context(renderer, { masked = 'WebKit WebGL', extension = true } = {}) {
  return {
    RENDERER: 0x1F01,
    getExtension: () => extension ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null,
    getParameter: key => key === 0x9246 ? renderer : masked,
  };
}

for (const name of [
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
  'llvmpipe (LLVM 15.0.7, 256 bits)', 'softpipe', 'Software Rasterizer',
  'Microsoft Basic Render Driver', 'ANGLE (Microsoft, Microsoft WARP, D3D11)',
  'GDI Generic', 'Apple Software Renderer',
]) test(`warns for software renderer: ${name}`, () => {
  assert.equal(usesSoftwareRendering(context(name)), true);
});

for (const name of [
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
  'ANGLE (Intel, Intel(R) UHD Graphics 620, D3D11)', 'NVIDIA GeForce RTX 4060',
  'AMD Radeon RX 6800', 'Mesa Intel(R) UHD Graphics', 'Adreno (TM) 740',
  'WebKit WebGL', '', null,
]) test(`does not warn without software evidence: ${name}`, () => {
  assert.equal(usesSoftwareRendering(context(name)), false);
});

test('uses the masked renderer when the privacy extension is unavailable', () => {
  assert.equal(usesSoftwareRendering(context(null, { extension: false, masked: 'llvmpipe' })), true);
  assert.equal(usesSoftwareRendering(context(null, { extension: false })), false);
});

test('checks the standard renderer even if the optional query throws', () => {
  const gl = context(null, { masked: 'softpipe' });
  gl.getExtension = () => { throw new Error('restricted'); };
  assert.equal(usesSoftwareRendering(gl), true);
});

test('missing or lost contexts never abort startup or claim acceleration is off', () => {
  assert.equal(usesSoftwareRendering(null), false);
  const gl = context(null);
  gl.getParameter = () => { throw new Error('context lost'); };
  assert.equal(usesSoftwareRendering(gl), false);
});
