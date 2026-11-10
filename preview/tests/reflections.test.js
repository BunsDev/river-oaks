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

test('context recovery discards partial faces and invalid maps before a complete recapture', () => {
  const { probe, material, renderer } = fixture(); const position = new THREE.Vector3();
  for (let frame = 0; frame < 6; frame++) probe.update(frame * 17, position);
  assert.ok(material.envMap);
  probe.invalidate(); probe.update(200, position); probe.update(217, position);
  probe.resetGraphics(); assert.equal(material.envMap, null);
  const before = renderer.calls;
  probe.update(250, position); assert.equal(renderer.calls, before, 'restored shadows need one main-view render before a probe face');
  probe.mainFrameRendered();
  for (let frame = 0; frame < 5; frame++) probe.update(300 + frame * 17, position);
  assert.equal(material.envMap, null);
  probe.update(400, position); assert.ok(material.envMap); assert.equal(renderer.calls - before, 6);
  probe.dispose();
});

// A slow shader compiler is an external device boundary: the real probe must
// preserve the main view and keep every capture unpublished while it is pending.
test('pending reflection shaders yield without drawing or retaining main-view state', async () => {
  const { probe, renderer, hidden, alreadyHidden, target, material } = fixture();
  let ready, preparations = 0;
  renderer.compileAsync = (scene, camera) => {
    preparations++;
    assert.equal(camera.isPerspectiveCamera, true);
    assert.equal(renderer.target.isWebGLCubeRenderTarget, true);
    assert.equal(renderer.xr.enabled, false);
    assert.equal(renderer.shadowMap.autoUpdate, false);
    assert.equal(hidden.visible, false);
    return new Promise(resolve => { ready = resolve; });
  };
  const position = new THREE.Vector3();
  probe.update(0, position);
  assert.equal(renderer.calls, 0, 'A cold capture must wait for shader readiness instead of blocking its frame');
  assert.equal(renderer.target, target); assert.equal(renderer.face, 3); assert.equal(renderer.mip, 2);
  assert.equal(renderer.xr.enabled, true); assert.equal(renderer.shadowMap.autoUpdate, true); assert.equal(renderer.shadowMap.needsUpdate, true);
  assert.equal(hidden.visible, true); assert.equal(alreadyHidden.visible, false);
  for (let frame = 1; frame <= 5; frame++) probe.update(frame * 17, position);
  assert.equal(preparations, 1); assert.equal(renderer.calls, 0); assert.equal(material.envMap, null);
  ready(); await Promise.resolve();
  for (let frame = 0; frame < 5; frame++) probe.update(200 + frame * 17, position);
  assert.equal(renderer.calls, 5); assert.equal(material.envMap, null);
  probe.update(300, position);
  assert.equal(renderer.calls, 6); assert.equal(probe.stats.captures, 1); assert.ok(material.envMap);
  probe.dispose();
});

test('graphics recovery and disposal fence stale reflection shader completion', async () => {
  for (const action of ['reset', 'release', 'dispose']) {
    const { probe, renderer, material } = fixture();
    const pending = []; renderer.compileAsync = () => new Promise(resolve => pending.push(resolve));
    const position = new THREE.Vector3(); probe.update(0, position);
    assert.equal(renderer.calls, 0);
    if (action === 'reset') probe.resetGraphics();
    else if (action === 'release') { probe.releaseGraphics(); probe.resetGraphics(); }
    else probe.dispose();
    pending[0](); await Promise.resolve();
    probe.mainFrameRendered(); probe.update(100, position);
    assert.equal(renderer.calls, 0, 'A stale compiler cannot unlock a new graphics generation');
    assert.equal(material.envMap, null);
    if (action !== 'dispose') {
      assert.equal(pending.length, 2);
      pending[1](); await Promise.resolve();
      for (let frame = 0; frame < 6; frame++) probe.update(200 + frame * 17, position);
      assert.equal(probe.stats.captures, 1);
    }
    probe.dispose();
  }
});

test('rejected reflection preparation preserves the prior map and main renderer', async () => {
  const { probe, renderer, target, material } = fixture();
  const previous = new THREE.Texture(); material.envMap = previous;
  let reject; renderer.compileAsync = () => new Promise((resolve, fail) => { reject = fail; });
  probe.update(0, new THREE.Vector3());
  assert.equal(renderer.calls, 0);
  reject(new Error('device compile failed')); await Promise.resolve();
  probe.update(100, new THREE.Vector3());
  assert.equal(renderer.calls, 0); assert.equal(probe.stats.failed, true);
  assert.equal(material.envMap, previous); assert.equal(renderer.target, target);
  assert.equal(renderer.xr.enabled, true); assert.equal(renderer.shadowMap.autoUpdate, true);
  probe.dispose(); previous.dispose();
});

test('main-view program changes cannot unlock a still-cold capture variant', async () => {
  const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const { probe, renderer } = fixture(scene);
  let ready = false;
  const captureProgram = { program: {}, isReady: () => ready }, mainProgram = { program: {}, isReady: () => true };
  const properties = { currentProgram: captureProgram, programs: new Map([['capture', captureProgram], ['main', mainProgram]]) };
  renderer.properties = { get: () => properties };
  renderer.compileAsync = () => Promise.resolve();
  probe.update(0, new THREE.Vector3());
  properties.currentProgram = mainProgram; await Promise.resolve();
  probe.update(17, new THREE.Vector3());
  assert.equal(renderer.calls, 0, 'The exact capture program must be ready even after main rendering changes currentProgram');
  ready = true;
  for (let frame = 0; frame < 6; frame++) probe.update(100 + frame * 17, new THREE.Vector3());
  assert.equal(probe.stats.captures, 1);
  probe.dispose(); scene.children[0].geometry.dispose(); material.dispose();
});

test('shader preparation visits only capture-visible renderables and uses the actual scene lights', () => {
  const scene = new THREE.Scene(), visible = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const hidden = visible.clone(), transmission = visible.clone(); hidden.visible = false;
  transmission.material = new THREE.MeshPhysicalMaterial({ transmission: .5 });
  scene.add(visible, hidden, transmission, new THREE.DirectionalLight());
  const { probe, renderer } = fixture(scene);
  renderer.compileAsync = (batch, camera, targetScene) => {
    const renderables = []; batch.traverse(object => { if (object.material) renderables.push(object); });
    assert.deepEqual(renderables, [visible], 'Excluded or hidden scene branches must not add cold compilation work');
    assert.equal(targetScene, scene, 'The original scene supplies lighting without duplicating its lights');
    return new Promise(() => {});
  };
  probe.update(0, new THREE.Vector3());
  assert.equal(probe.stats.failed, false, 'Preparation must satisfy the capture visibility and lighting contract');
  assert.equal(renderer.calls, 0);
  probe.dispose(); visible.geometry.dispose(); visible.material.dispose(); transmission.material.dispose();
});

test('invalidated asynchronous capture cannot publish its old lighting', async () => {
  const { probe, renderer, material } = fixture(); let ready;
  renderer.compileAsync = () => new Promise(resolve => { ready = resolve; });
  const position = new THREE.Vector3(); probe.update(0, position); probe.invalidate();
  ready(); await Promise.resolve();
  for (let frame = 0; frame < 6; frame++) probe.update(100 + frame * 17, position);
  assert.equal(material.envMap, null); assert.equal(probe.stats.captures, 0);
  probe.update(200, position); ready(); await Promise.resolve();
  for (let frame = 0; frame < 6; frame++) probe.update(300 + frame * 17, position);
  assert.equal(probe.stats.captures, 1); assert.ok(material.envMap);
  probe.dispose();
});

test('synchronous preparation failure restores state and retains the last map', () => {
  const { probe, renderer, material, target, hidden } = fixture();
  const previous = new THREE.Texture(); material.envMap = previous;
  renderer.compileAsync = () => { throw new Error('device unavailable'); };
  probe.update(0, new THREE.Vector3());
  assert.equal(probe.stats.failed, true); assert.equal(material.envMap, previous);
  assert.equal(renderer.target, target); assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.shadowMap.autoUpdate, true); assert.equal(hidden.visible, true);
  probe.dispose(); previous.dispose();
});

test('streamed material disposal restarts cold preparation without querying a deleted program', async () => {
  const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const { probe, renderer } = fixture(scene); let finish, preparations = 0;
  const old = { program: {}, isReady: () => { if (!old.program) throw new Error('deleted device program'); return false; } };
  const properties = { programs: new Map([['old', old]]) }; renderer.properties = { get: () => properties };
  renderer.compileAsync = () => { preparations++; return new Promise(resolve => { finish = resolve; }); };
  probe.update(0, new THREE.Vector3());
  old.program = undefined; properties.programs.clear();
  assert.doesNotThrow(() => probe.update(17, new THREE.Vector3()));
  assert.equal(preparations, 2, 'Disposed cold programs must not leave preparation stuck forever');
  finish(); await Promise.resolve();
  for (let frame = 0; frame < 6; frame++) probe.update(100 + frame * 17, new THREE.Vector3());
  assert.equal(probe.stats.captures, 1); assert.equal(probe.stats.failed, false);
  probe.dispose(); scene.children[0].geometry.dispose(); material.dispose();
});

test('device readiness errors stay inside the reflection failure boundary', async () => {
  const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const { probe, renderer, target } = fixture(scene);
  renderer.properties = { get: () => ({ programs: new Map([['capture', { program: {}, isReady() { throw new Error('device lost'); } }]]) }) };
  renderer.compileAsync = () => Promise.resolve();
  probe.update(0, new THREE.Vector3()); await Promise.resolve();
  assert.doesNotThrow(() => probe.update(17, new THREE.Vector3()));
  assert.equal(probe.stats.failed, true); assert.equal(renderer.calls, 0); assert.equal(renderer.target, target);
  probe.dispose(); scene.children[0].geometry.dispose(); material.dispose();
});
