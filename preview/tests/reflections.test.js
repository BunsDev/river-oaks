import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStorefrontReflections } from '../src/reflections.js';

function fixture(scene = new THREE.Scene()) {
  const material = new THREE.MeshStandardMaterial();
  const hidden = new THREE.Group(), alreadyHidden = new THREE.Group(); alreadyHidden.visible = false;
  const target = { initial: true };
  const renderer = {
    coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: true },
    autoClear: true, toneMapping: THREE.ACESFilmicToneMapping,
    shadowMap: { enabled: true, autoUpdate: true, needsUpdate: true }, target, face: 3, mip: 2, calls: 0,
    getRenderTarget() { return this.target; }, getActiveCubeFace() { return this.face; }, getActiveMipmapLevel() { return this.mip; },
    setRenderTarget(value, face, mip) { this.target = value; this.face = face; this.mip = mip; },
    render() { this.calls++; assert.equal(hidden.visible, false); assert.equal(this.shadowMap.autoUpdate, false); },
  };
  const resources = [];
  const filter = {
    fromCubemap(cube, existing) {
      if (existing) return existing;
      const result = new THREE.WebGLRenderTarget(16, 16); result.texture.mapping = THREE.CubeUVReflectionMapping;
      result.addEventListener('dispose', () => { result.released = (result.released ?? 0) + 1; });
      resources.push(result); return result;
    },
    dispose() { this.released = (this.released ?? 0) + 1; },
  };
  const probe = createStorefrontReflections({ renderer, scene, materials: [material], excluded: [hidden, alreadyHidden], filter });
  return { probe, renderer, material, hidden, alreadyHidden, target, resources, filter };
}

test('reflection captures wait for visible shadow maps without consuming a cube face', () => {
  const scene = new THREE.Scene(), sun = new THREE.DirectionalLight();
  sun.castShadow = true; scene.add(sun);
  const { probe, renderer, material } = fixture(scene), position = new THREE.Vector3();
  for (let frame = 0; frame < 6; frame++) probe.update(frame * 17, position);
  assert.equal(renderer.calls, 0, 'A PCF shadow sampler cannot use an uninitialized depth texture');
  assert.equal(material.envMap, null); assert.equal(probe.stats.failed, false);
  assert.equal(renderer.shadowMap.needsUpdate, true, 'The main view must still initialize the shadow map');
  sun.shadow.map = new THREE.WebGLRenderTarget(16, 16);
  for (let frame = 6; frame < 12; frame++) probe.update(frame * 17, position);
  assert.equal(renderer.calls, 6); assert.equal(probe.stats.captures, 1); assert.ok(material.envMap);
  probe.dispose(); sun.dispose();
});

test('disabled shadows and lights under hidden parents do not block reflections', () => {
  for (const enabled of [false, true]) {
    const scene = new THREE.Scene(), parent = new THREE.Group(), light = new THREE.DirectionalLight();
    light.castShadow = true; parent.visible = !enabled; parent.add(light); scene.add(parent);
    const { probe, renderer } = fixture(scene); renderer.shadowMap.enabled = enabled;
    for (let frame = 0; frame < 6; frame++) probe.update(frame * 17, new THREE.Vector3());
    assert.equal(probe.stats.captures, 1);
    probe.dispose(); light.dispose();
  }
});

test('local reflection work is spread over frames and only complete captures are published', () => {
  const { probe, renderer, material, resources, filter } = fixture(); const position = new THREE.Vector3(3, 2, 4);
  for (let frame = 0; frame < 5; frame++) { probe.update(frame * 17, position); assert.equal(renderer.calls, frame + 1); assert.equal(material.envMap, null); }
  probe.update(85, position); const first = material.envMap;
  assert.equal(first.mapping, THREE.CubeUVReflectionMapping); assert.equal(probe.stats.captures, 1);
  for (let frame = 6; frame < 200; frame++) probe.update(frame * 17, position);
  assert.equal(renderer.calls, 6, 'Standing still must reuse the completed capture');
  for (let frame = 0; frame < 6; frame++) probe.update(4000 + frame * 17, new THREE.Vector3(30, 2, 4));
  assert.notEqual(material.envMap, first); assert.equal(probe.stats.captures, 2);
  const second = material.envMap;
  probe.invalidate();
  for (let frame = 0; frame < 6; frame++) probe.update(5000 + frame * 17, position);
  assert.equal(material.envMap, first, 'Two capture targets must be reused'); assert.notEqual(material.envMap, second);
  probe.dispose();
  assert.equal(material.envMap, null); probe.update(7000, position); assert.equal(renderer.calls, 18);
  probe.dispose(); assert.equal(resources.length, 2); assert.ok(resources.every(resource => resource.released === 1)); assert.equal(filter.released, 1);
});

test('lighting changes cannot publish an obsolete partial reflection', () => {
  const { probe, renderer, material } = fixture(); const position = new THREE.Vector3();
  probe.update(0, position); probe.invalidate();
  for (let frame = 1; frame < 6; frame++) probe.update(frame * 17, position);
  assert.equal(material.envMap, null); assert.equal(probe.stats.captures, 0);
  for (let frame = 6; frame < 12; frame++) probe.update(frame * 17, position);
  assert.ok(material.envMap); assert.equal(renderer.calls, 12); assert.equal(probe.stats.captures, 1);
  probe.dispose();
});

test('failed captures restore the render target, shadow state and hidden objects', () => {
  const { probe, renderer, material, hidden, alreadyHidden, target } = fixture();
  renderer.render = () => { throw new Error('simulated capture failure'); };
  assert.doesNotThrow(() => probe.update(0, new THREE.Vector3()));
  assert.equal(renderer.target, target); assert.equal(renderer.face, 3); assert.equal(renderer.mip, 2);
  assert.equal(renderer.xr.enabled, true); assert.equal(renderer.shadowMap.autoUpdate, true); assert.equal(renderer.shadowMap.needsUpdate, true);
  assert.equal(hidden.visible, true); assert.equal(alreadyHidden.visible, false); assert.equal(material.envMap, null);
  assert.equal(probe.stats.failed, true);
  probe.dispose(); probe.dispose();
});

test('a failed reflection filter keeps the last complete map and restores renderer state', () => {
  const { probe, renderer, material, filter } = fixture(); const position = new THREE.Vector3();
  for (let frame = 0; frame < 6; frame++) probe.update(frame * 17, position);
  const complete = material.envMap;
  filter.fromCubemap = () => { renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping; throw new Error('simulated filter failure'); };
  probe.invalidate();
  for (let frame = 6; frame < 12; frame++) probe.update(frame * 17, position);
  assert.equal(material.envMap, complete); assert.equal(probe.stats.failed, true); assert.equal(probe.stats.captures, 1);
  assert.equal(renderer.autoClear, true); assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  probe.dispose();
});


test('transmissive props cannot allocate camera-specific refraction targets during probe capture', () => {
  const scene = new THREE.Scene();
  const crystal = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial({ transmission: 0.8 }));
  scene.add(crystal);
  const { probe, renderer } = fixture(scene);
  const render = renderer.render.bind(renderer);
  renderer.render = () => { assert.equal(crystal.visible, false); render(); };
  probe.update(0, new THREE.Vector3());
  assert.equal(probe.stats.failed, false, 'Capture must exclude the crystal');
  assert.equal(crystal.visible, true, 'Main view must retain the crystal');
  probe.dispose(); crystal.geometry.dispose(); crystal.material.dispose();
});
