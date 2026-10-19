import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDrawCensus, drawOwner, drawPass, programSignature } from '../src/draw-census.js';

test('draw census attributes passes and tagged owners, then restores the renderer', () => {
  const mainCamera = new THREE.PerspectiveCamera(), probe = new THREE.PerspectiveCamera(), shadowCamera = new THREE.OrthographicCamera();
  const scene = new THREE.Scene(), override = new THREE.MeshNormalMaterial(), material = new THREE.MeshStandardMaterial();
  const holder = new THREE.Group(); holder.userData.renderAuditOwner = 'remote-player';
  const body = new THREE.Mesh(new THREE.BoxGeometry(), material); holder.add(new THREE.Group().add(body)); scene.add(holder);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(), material); scene.add(ground);
  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 4); crowd.count = 3; scene.add(crowd);
  assert.equal(drawOwner(body), 'remote-player'); assert.equal(drawOwner(ground), 'scene');
  assert.equal(drawPass({ camera: shadowCamera, mainCamera, scene: null, material }), 'shadow');
  assert.equal(drawPass({ camera: probe, mainCamera, scene, material }), 'other');

  const submitted = [];
  const renderer = { renderBufferDirect(...args) { submitted.push(args); } }, original = renderer.renderBufferDirect;
  const census = createDrawCensus(renderer, mainCamera);
  renderer.renderBufferDirect(mainCamera, scene, ground.geometry, material, ground, null); // before begin: not counted
  census.begin(); census.begin();
  renderer.renderBufferDirect(mainCamera, scene, body.geometry, material, body, null);
  renderer.renderBufferDirect(shadowCamera, null, body.geometry, material, body, null);
  scene.overrideMaterial = override;
  renderer.renderBufferDirect(mainCamera, scene, body.geometry, override, body, null);
  scene.overrideMaterial = null;
  renderer.renderBufferDirect(mainCamera, scene, body.geometry, material, body, { start: 0, count: 6 });
  renderer.renderBufferDirect(mainCamera, scene, crowd.geometry, material, crowd, null);
  ground.geometry.setDrawRange(0, 3);
  renderer.renderBufferDirect(probe, scene, ground.geometry, material, ground, null);
  const counts = census.end();
  assert.equal(renderer.renderBufferDirect, original, 'the wrapper is removed after one frame');
  assert.equal(submitted.length, 7, 'every draw still reaches the renderer');
  assert.deepEqual(counts, {
    'main:remote-player': { draws: 2, triangles: 12 + 2, switches: 0 },
    'shadow:remote-player': { draws: 1, triangles: 12, switches: 0 },
    'occlusion:remote-player': { draws: 1, triangles: 12, switches: 0 },
    'main:scene': { draws: 1, triangles: 36, switches: 1 },
    'other:scene': { draws: 1, triangles: 1, switches: 1 },
  }, 'the instanced crowd and the plain ground each change the shared material\'s object kind');
  assert.deepEqual(census.end(), counts, 'ending twice is harmless');
});

test('a program switch is counted when one material is drawn for a different kind of object', () => {
  const camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene(), material = new THREE.MeshDepthMaterial();
  const bone = new THREE.Bone(), skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material);
  skinned.add(bone); skinned.bind(new THREE.Skeleton([bone]));
  const rigid = new THREE.Mesh(new THREE.BoxGeometry(), material), morphed = new THREE.Mesh(new THREE.BoxGeometry(), material);
  morphed.geometry.morphAttributes.position = [morphed.geometry.attributes.position.clone()];
  assert.deepEqual([programSignature(skinned, skinned.geometry), programSignature(rigid, rigid.geometry), programSignature(morphed, morphed.geometry)], ['s0', '0', '1']);
  const renderer = { renderBufferDirect() {} }, census = createDrawCensus(renderer, camera);
  census.begin();
  for (const object of [skinned, skinned, rigid, rigid, skinned, morphed]) renderer.renderBufferDirect(camera, null, object.geometry, material, object, null);
  assert.equal(census.end()['shadow:scene'].switches, 3, 'skinned to rigid, rigid to skinned, skinned to morphed');
});
