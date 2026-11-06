import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { exclusiveResources } from '../src/figure-resources.js';
import { FIGURE_GEOMETRIES, withinResourceBounds } from '../e2e/resource-bounds.js';

const mesh = (geometry = new THREE.BufferGeometry(), map = new THREE.Texture()) => new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map }));

test('a figure counts only what nothing else in the scene uses', () => {
  const sharedGeometry = new THREE.BufferGeometry(), sharedMap = new THREE.Texture();
  const scene = new THREE.Scene(), player = mesh(sharedGeometry, sharedMap);
  const figure = new THREE.Group();
  figure.add(mesh(sharedGeometry, sharedMap), mesh(), mesh());
  scene.add(player, figure);
  assert.deepEqual(exclusiveResources(scene, [figure]), { figures: 1, geometries: 2, textures: 2 });
  assert.deepEqual(exclusiveResources(scene, []), { figures: 0, geometries: 0, textures: 0 });
});

test('a figure not shown excuses nothing, so a real step cannot pass behind the camera', () => {
  const scene = new THREE.Scene(), figure = new THREE.Group();
  figure.add(mesh(), mesh());
  figure.visible = false;
  scene.add(figure);
  assert.deepEqual(exclusiveResources(scene, [figure]), { figures: 0, geometries: 0, textures: 0 });
});

test('two figures sharing a look count it once, and a hidden scene object still claims it', () => {
  const look = new THREE.BufferGeometry(), map = new THREE.Texture(), own = new THREE.BufferGeometry();
  const scene = new THREE.Scene(), a = new THREE.Group(), b = new THREE.Group();
  a.add(mesh(look, map), mesh(own, map)); b.add(mesh(own, map));
  scene.add(a, b);
  assert.deepEqual(exclusiveResources(scene, [a, b]), { figures: 2, geometries: 2, textures: 1 });
  const hidden = mesh(look, map);
  hidden.visible = false;
  scene.add(hidden);
  assert.deepEqual(exclusiveResources(scene, [a, b]), { figures: 2, geometries: 1, textures: 0 });
});

const state = (geometries, textures, figures = 0, figureGeometries = 0, figureTextures = 0, objects = 9000) => ({ objects, renderer: { geometries, textures }, residentResources: { figures, geometries: figureGeometries, textures: figureTextures } });

test('the bound ignores a resident swing, and still catches anything retained', () => {
  const baseline = [state(769, 278)];
  // Raw evicted counts on 2026-11-04: 769/278 with no figures, 832/289 with three.
  assert.equal(withinResourceBounds([state(832, 289, 3, 63, 11)], baseline), true, 'three residents walked by');
  assert.equal(withinResourceBounds([state(832, 289)], baseline), false, 'the same raw count with no figures is retention');
  assert.equal(withinResourceBounds([state(790, 278)], baseline), false, '+21 geometries');
  assert.equal(withinResourceBounds([state(789, 288)], baseline), true, 'exactly at both limits');
  assert.equal(withinResourceBounds([state(769, 289)], baseline), false, '+11 textures');
  assert.equal(withinResourceBounds([state(769, 278, 0, 0, 0, 9021)], baseline), false, '+21 objects');
  assert.equal(withinResourceBounds([state(860, 289, 3, 63, 11)], baseline), false, 'figures plus 28 retained geometries');
  assert.equal(withinResourceBounds([state(769, 278)], [state(832, 289, 3, 63, 11)]), true, 'a baseline taken with figures is compared without them');
});

test('a live figure excuses only what one was measured to add', () => {
  const baseline = [state(769, 278)];
  assert.equal(withinResourceBounds([state(769 + FIGURE_GEOMETRIES + 20, 278, 1, FIGURE_GEOMETRIES)], baseline), true);
  assert.equal(withinResourceBounds([state(769 + 60, 278, 1, 60)], baseline), false, 'one figure holding 60 geometries has grown');
  assert.equal(withinResourceBounds([state(769, 278 + 20, 1, 0, 20)], baseline), false, 'one figure holding 20 textures has grown');
});
