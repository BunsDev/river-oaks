import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyCharacterRealism} from '../src/character-realism.js';

test('disposing a realism tier restores material state before selecting off', () => {
  const original = new THREE.MeshPhysicalMaterial({name:'young_asian_female', roughness:.62});
  const material = original.clone(), model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const avatar = {model, materials:new Map([[original,material]])};
  const normalScale = material.normalScale.clone(), compile = material.onBeforeCompile;
  for (const tier of ['high','standard','high']) {
    const effect = applyCharacterRealism(avatar, {tier});
    assert.ok(material.normalMap);
    effect.dispose();
    assert.ok(material.normalMap === null, 'normal map restored');
    assert.equal(material.roughness, .62);
    assert.deepEqual(material.normalScale, normalScale);
    assert.equal(material.onBeforeCompile, compile);
  }
});

test('cornea follows mesh transforms and teardown restores the original geometry', () => {
  const original = new THREE.MeshPhysicalMaterial({name:'brown'}), material = original.clone();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0, 0,0,1, 1,0,1, 0,1,1],3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,0,0,0,0,1,1,1,1,1,1],2));geometry.setIndex([0,1,2,3,4,5]);
  const model = new THREE.Group(), mesh = new THREE.Mesh(geometry,material);mesh.name='high-poly';mesh.position.set(1,2,3);mesh.rotation.y=.3;mesh.scale.setScalar(2);model.add(mesh);
  const effect = applyCharacterRealism({model,materials:new Map([[original,material]])},{tier:'high',alphaAt:u=>u>.5});
  const cornea=model.getObjectByName('high-poly cornea');
  assert.deepEqual(cornea.position,mesh.position);assert.deepEqual(cornea.quaternion.toArray(),mesh.quaternion.toArray());assert.deepEqual(cornea.scale,mesh.scale);
  effect.dispose();assert.ok(mesh.geometry === geometry, 'geometry restored');assert.equal(model.children.length,1);
});
