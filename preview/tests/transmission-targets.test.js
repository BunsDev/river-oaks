import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {releaseTransmissionTargets} from '../src/transmission-targets.js';

// Stand-in for renderer.properties after a render: transmissive materials hold
// the cached transmission target's texture in their uniforms.
function rendered(scene, targets) {
  const properties = new Map();
  scene.traverse(object => {
    for (const material of [object.material].flat()) if (material && targets.has(material)) properties.set(material, {uniforms: {transmissionSamplerMap: {value: targets.get(material).texture}}});
  });
  return {properties: {get: material => properties.get(material) ?? {}}};
}

test('releases each cached transmission target once, including shared and multi-material meshes', () => {
  const crystal = new THREE.MeshPhysicalMaterial({transmission: .35}), glass = new THREE.MeshPhysicalMaterial({transmission: 1}), silk = new THREE.MeshPhysicalMaterial();
  const scene = new THREE.Scene(), group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), crystal), new THREE.Mesh(new THREE.BoxGeometry(), [silk, glass]));
  scene.add(group, new THREE.Mesh(new THREE.BoxGeometry(), crystal));
  const target = new THREE.WebGLRenderTarget(4, 4);
  let disposed = 0; target.addEventListener('dispose', () => disposed++);
  const renderer = rendered(scene, new Map([[crystal, target], [glass, target]]));
  assert.equal(releaseTransmissionTargets(renderer, scene), 1);
  assert.equal(disposed, 1);
});

test('opaque scenes and transmissive materials that never rendered release nothing', () => {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial()), new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial({transmission: .5})));
  assert.equal(releaseTransmissionTargets(rendered(scene, new Map()), scene), 0);
});
