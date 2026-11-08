import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KIT_MATERIALS, kitFinish } from '../../shared/city-kit/catalog.js';
import { physicalSurface, paverSurface } from '../src/materials.js';
import { buildCityKit } from '../src/city-kit/render.js';

const plan = {
  id: 'overlay-regression', site: [-1, -1, 10, 5],
  pieces: [
    { id: 'overlay-regression/ground/lawn', piece: 'landscape/lawn', material: 'lawn', rect: [0, 0, 4, 4] },
    { id: 'overlay-regression/ground/curb', piece: 'street/flush-curb', material: 'curb-granite', rect: [4, 0, 5, 4] },
    { id: 'overlay-regression/ground/paver', piece: 'street/flush-curb', material: 'paver-sidewalk', rect: [5, 0, 9, 4] },
  ],
};

function compile(material) {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, null);
  return shader;
}

function surface(slot, finish) {
  const spec = { ...KIT_MATERIALS[slot], ...kitFinish(finish).materials[slot] };
  return spec.surface === 'district-paver' ? paverSurface() : physicalSurface(spec.surface, {
    tileSize: spec.tile ?? 4, instanced: false, variation: .08,
    color: new THREE.Color(spec.color ?? '#ffffff'),
    ...(spec.textureContrast ? { textureContrast: spec.textureContrast, normalScale: new THREE.Vector2(.3, .3) } : {}),
  });
}

for (const finish of ['classic', 'pink-jet-age']) {
  test(`${finish} ground overlays retain metric texture, contrast and variation programs`, t => {
    const kit = buildCityKit(plan, { groundAt: () => 0, ground: 0, landscape: false, finish });
    t.after(() => kit.userData.dispose());
    const overlays = new Map();
    kit.traverse(item => {
      if (item.isMesh && item.material.name.endsWith(':overlay')) overlays.set(item.material.name, item.material);
    });
    for (const [slot, layer] of [['lawn', 1], ['curb-granite', 2], ['paver-sidewalk', 2]]) {
      const overlay = overlays.get(`city-kit/${slot}:overlay`), reference = surface(slot, finish);
      t.after(() => reference.dispose());
      assert.ok(overlay, `${slot} is rendered by an actual ground mesh`);
      assert.deepEqual(compile(overlay), compile(reference), `${slot} keeps every texture channel's metric UVs and the surface treatment`);
      assert.equal(overlay.customProgramCacheKey(), reference.customProgramCacheKey(), `${slot} keeps its shader variant identity`);
      assert.equal(overlay.map, reference.map, `${slot} reuses its cached albedo`);
      assert.equal(overlay.normalMap, reference.normalMap, `${slot} reuses its cached normal map`);
      assert.equal(overlay.polygonOffset, true);
      assert.equal(overlay.polygonOffsetFactor, -layer);
      assert.equal(overlay.polygonOffsetUnits, -2 * layer);
    }
  });
}

test('disposing repeated overlay builds releases materials while retaining shared PBR maps', t => {
  const reference = surface('lawn', 'classic'), maps = new Set([reference.map, reference.normalMap, reference.roughnessMap]);
  let disposedMaps = 0, disposedOverlays = 0, overlayCount = 0;
  const countMapDisposal = () => disposedMaps++;
  for (const map of maps) map.addEventListener('dispose', countMapDisposal);
  t.after(() => { for (const map of maps) map.removeEventListener('dispose', countMapDisposal); });
  for (const finish of ['classic', 'pink-jet-age', 'classic']) {
    const kit = buildCityKit(plan, { groundAt: () => 0, ground: 0, landscape: false, finish });
    kit.traverse(item => {
      if (item.isMesh && item.material.name.endsWith(':overlay')) {
        overlayCount++;
        item.material.addEventListener('dispose', () => disposedOverlays++);
      }
    });
    kit.userData.dispose();
    kit.userData.dispose();
  }
  reference.dispose();
  assert.equal(overlayCount, 9);
  assert.equal(disposedOverlays, overlayCount, 'each owned overlay material is released exactly once');
  assert.equal(disposedMaps, 0, 'shared texture storage stays valid for other scenes');
});
