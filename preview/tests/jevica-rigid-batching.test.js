import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar } from '../src/avatars.js';
import { bakeRigidParts } from '../src/costume-batching.js';
import { createJevicaCostume } from '../src/jevica-costume.js';

const worldTriangles = root => {
  root.updateMatrixWorld(true);
  const out = new Map(), at = new THREE.Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const { position, normal } = mesh.geometry.attributes, index = mesh.geometry.index, list = [];
    for (let i = 0; i < (index ? index.count : position.count); i++) {
      const v = index ? index.getX(i) : i;
      at.fromBufferAttribute(position, v).applyMatrix4(mesh.matrixWorld); list.push(at.toArray().map(n => n.toFixed(4)).join());
    }
    const key = `${mesh.material.name}:${mesh.castShadow}`;
    out.set(key, [...out.get(key) ?? [], ...list]);
  });
  for (const list of out.values()) list.sort();
  return out;
};

test('rigid parts under nested groups bake to one mesh per material and shadow role, same triangles in place', () => {
  const petal = new THREE.MeshStandardMaterial({ name: 'petal' }), metal = new THREE.MeshStandardMaterial({ name: 'metal' });
  const root = new THREE.Group(); root.position.set(1, 2, 3); root.rotation.y = .4;
  const owned = new Set(), shared = new THREE.SphereGeometry(1, 6, 4); owned.add(shared);
  for (const x of [0, .5]) {
    const nested = new THREE.Group(); nested.position.x = x; nested.rotation.z = x; root.add(nested);
    for (let i = 0; i < 3; i++) { const mesh = new THREE.Mesh(shared, petal); mesh.scale.set(.2, .05, .3); mesh.position.y = i * .1; mesh.castShadow = true; nested.add(mesh); }
    const centre = new THREE.Mesh(new THREE.SphereGeometry(.1, 5, 4), petal); owned.add(centre.geometry); nested.add(centre);
    const stud = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), metal); owned.add(stud.geometry); nested.add(stud);
  }
  const before = worldTriangles(root);
  bakeRigidParts(root, owned);
  const meshes = root.children.filter(child => child.isMesh);
  assert.equal(root.children.length, 3, 'no empty groups stay behind');
  assert.deepEqual(meshes.map(mesh => `${mesh.material.name}:${mesh.castShadow}`).sort(), ['metal:false', 'petal:false', 'petal:true']);
  assert.deepEqual(worldTriangles(root), before);
  assert.equal(owned.has(shared), false, 'replaced geometry is released');
  assert.ok(meshes.every(mesh => owned.has(mesh.geometry)), 'the caller owns the baked geometry');
  assert.equal(owned.size, 3);
});

test("Jevica's lilies, earrings and brooch cost one mesh per material and shadow role", async () => {
  const source = await loadCharacterRig('jevica'), rig = instantiateAvatar(source, { targetHeight: 1.685 });
  const object = new THREE.Group(); object.add(rig.model); object.updateMatrixWorld(true);
  const costume = createJevicaCostume({ object, rig });
  try {
    costume.update(false, 1000);
    const count = group => { let meshes = 0; group.traverse(item => { if (item.isMesh) meshes++; }); return meshes; };
    const { flowers, earrings, brooch } = costume.suit.pieces ?? costume.suit;
    assert.equal(flowers.length, 2);
    for (const cluster of flowers) assert.equal(count(cluster), 2, `${cluster.name}: petals and stamens`);
    for (const { group } of earrings) assert.equal(count(group), 4, `${group.name}: petals, stamen, metal and its crystal drop`);
    if (brooch) assert.equal(count(brooch), 2);
  } finally { costume.dispose(); }
});
