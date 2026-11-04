import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { exclusiveResources } from '../src/figure-resources.js';
import { withinResourceBounds } from '../e2e/resource-bounds.js';

const mesh = (geometry = new THREE.BufferGeometry(), map = new THREE.Texture()) => new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map }));

test('a figure counts only what nothing else in the scene uses', () => {
  const sharedGeometry = new THREE.BufferGeometry(), sharedMap = new THREE.Texture();
  const scene = new THREE.Scene(), player = mesh(sharedGeometry, sharedMap);
  const figure = new THREE.Group();
  figure.add(mesh(sharedGeometry, sharedMap), mesh(), mesh());
  scene.add(player, figure);
  assert.deepEqual(exclusiveResources(scene, [figure]), { geometries: 2, textures: 2 });
  assert.deepEqual(exclusiveResources(scene, []), { geometries: 0, textures: 0 });
});

test('two figures sharing a look count it once, and a hidden scene object does not claim it', () => {
  const look = new THREE.BufferGeometry(), map = new THREE.Texture();
  const scene = new THREE.Scene(), a = new THREE.Group(), b = new THREE.Group(), hidden = mesh(look, map);
  hidden.visible = false;
  a.add(mesh(look, map)); b.add(mesh(look, map));
  scene.add(a, b, hidden);
  assert.deepEqual(exclusiveResources(scene, [a, b]), { geometries: 1, textures: 1 });
});

const state = (geometries, textures, figureGeometries = 0, figureTextures = 0, objects = 9000) => ({ objects, renderer: { geometries, textures }, residentResources: { geometries: figureGeometries, textures: figureTextures } });

test('the bound ignores a resident swing, and still catches anything retained', () => {
  const baseline = [state(769, 278)];
  // Raw evicted counts on 2026-11-04: 769/278 with no figures, 832/289 with three.
  assert.equal(withinResourceBounds([state(832, 289, 63, 11)], baseline), true, 'three residents walked by');
  assert.equal(withinResourceBounds([state(832, 289, 0, 0)], baseline), false, 'the same raw count with no figures is retention');
  assert.equal(withinResourceBounds([state(790, 278)], baseline), false, '+21 geometries');
  assert.equal(withinResourceBounds([state(789, 288)], baseline), true, 'exactly at both limits');
  assert.equal(withinResourceBounds([state(769, 289)], baseline), false, '+11 textures');
  assert.equal(withinResourceBounds([state(769, 278, 0, 0, 9021)], baseline), false, '+21 objects');
  // A leak that rides along with figures is not hidden: only their own resources are removed.
  assert.equal(withinResourceBounds([state(860, 289, 63, 11)], baseline), false, 'figures plus 28 retained geometries');
  // A baseline taken with figures present is compared without them.
  assert.equal(withinResourceBounds([state(769, 278)], [state(832, 289, 63, 11)]), true);
});
