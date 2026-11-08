import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoadVehicle } from '../src/road-vehicles.js';
import { installRibbonwingResourceAudit } from '../e2e/ribbonwing-resource-audit.js';

const setup = t => {
  const audit = installRibbonwingResourceAudit();
  t.after(() => audit.stop());
  return { audit, scene: new THREE.Scene() };
};

test('actual road and Ribbonwing resources dispose across six pairs of model replacements', t => {
  const { audit, scene } = setup(t);
  for (let cycle = 0; cycle < 6; cycle++) {
    for (const kind of ['motorcycle', 'hover']) {
      const craft = createRoadVehicle(kind);
      scene.add(craft.object);
      const capture = audit.capture(craft.object.name);
      assert(capture.geometries > (kind === 'hover' ? 100 : 20), 'track the complete real model, including hidden LOD geometry');
      assert.equal(capture.textures, kind === 'hover' ? 1 : 0);
      assert.equal(audit.read(capture.token).complete, false);
      craft.dispose();
      const result = audit.read(capture.token);
      assert.equal(result.complete, true);
      assert.equal(result.rootCollected, false, 'the fixture still holds the detached model; disposal is separate from collection');
      assert.deepEqual(result.disposed, result.tracked);
    }
  }
});

test('detaching a leaking model cannot masquerade as resource disposal', t => {
  const { audit, scene } = setup(t), root = new THREE.Group(); root.name = 'Ribbonwing';
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture(), material = new THREE.MeshBasicMaterial({ map: texture });
  root.add(new THREE.Mesh(geometry, material)); scene.add(root);
  const { token } = audit.capture(); root.removeFromParent();
  assert.equal(audit.read(token).complete, false);
  geometry.dispose();
  assert.equal(audit.read(token).complete, false, 'an undisposed texture still fails');
  texture.dispose(); material.dispose();
  assert.equal(audit.read(token).complete, true);
});

test('shared references inside a model count once and unrelated scene disposal does not satisfy them', t => {
  const { audit, scene } = setup(t), root = new THREE.Group(); root.name = 'Ribbonwing';
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material)); scene.add(root);
  const capture = audit.capture(); assert.equal(capture.geometries, 1);
  const unrelated = new THREE.BoxGeometry(); unrelated.dispose(); root.removeFromParent();
  assert.equal(audit.read(capture.token).disposed.geometries, 0);
  geometry.dispose(); material.dispose();
  assert.equal(audit.read(capture.token).complete, true);
});

test('missing and ambiguous roots fail instead of returning a zero-resource pass', t => {
  const { audit, scene } = setup(t);
  assert.throws(() => audit.capture(), /found 0/);
  for (let i = 0; i < 2; i++) { const root = new THREE.Group(); root.name = 'Ribbonwing'; scene.add(root); }
  assert.throws(() => audit.capture(), /found 2/);
});

test('stopping the audit removes listeners and restores an existing developer hook', t => {
  const target = new EventTarget(); globalThis.__THREE_DEVTOOLS__ = target;
  const { audit, scene } = setup(t), root = new THREE.Group(); root.name = 'Ribbonwing';
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(geometry, material)); scene.add(root);
  audit.capture(); assert.equal(geometry.hasEventListener('dispose', geometry._listeners.dispose[0]), true);
  audit.stop(); assert.equal(geometry._listeners.dispose.length, 0);
  assert.equal(globalThis.__THREE_DEVTOOLS__, target);
  assert.equal(globalThis.__riverRibbonwingResources, undefined);
  assert.throws(() => audit.capture(), /stopped/);
  geometry.dispose(); material.dispose(); delete globalThis.__THREE_DEVTOOLS__;
});
