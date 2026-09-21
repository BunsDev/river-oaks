import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { measureHead, DEFAULT_HEAD_FIT } from '../src/head-fit.js';
import { applyOzFolk, OZ_FOLK } from '../src/oz-folk.js';

// A skinned sphere bound entirely to the head bone stands in for a skull or hair.
function skinnedBall(head, skeleton, name, radius, offsetY) {
  const geometry = new THREE.SphereGeometry(radius, 16, 12).translate(0, offsetY, 0);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const material = new THREE.MeshStandardMaterial({ name });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(head); mesh.bind(skeleton);
  return mesh;
}
function rig(scale = 1, forward = 0) {
  const model = new THREE.Group(); model.scale.setScalar(scale);
  const head = new THREE.Bone(); head.name = 'head'; head.position.y = 1.5;
  const skeleton = new THREE.Skeleton([head]);
  const skull = skinnedBall(head, skeleton, 'young_caucasian_female', 0.1, 1.55);
  if (forward) skull.geometry.translate(0, 0, forward);
  const hair = new THREE.SkinnedMesh(new THREE.SphereGeometry(0.125, 16, 12).translate(0, 1.56, 0), new THREE.MeshStandardMaterial({ name: 'bob01' }));
  const count = hair.geometry.attributes.position.count;
  hair.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
  hair.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  hair.bind(skeleton);
  model.add(skull, hair); model.updateMatrixWorld(true);
  return { model, head, materials: new Map() };
}

test('measureHead reads the skull and hair from the skinned rig around the head joint', () => {
  const fit = measureHead(rig());
  assert.ok(Math.abs(fit.skull.top - 0.15) < 0.005, `skull top ${fit.skull.top}`);
  assert.ok(Math.abs(fit.skull.radius - 0.1) < 0.005, `skull radius ${fit.skull.radius}`);
  assert.ok(Math.abs(fit.skull.front - 0.1) < 0.005 && Math.abs(fit.skull.back + 0.1) < 0.005, 'front and back of the skull');
  assert.ok(Math.abs(fit.hair.top - 0.185) < 0.005 && Math.abs(fit.hair.radius - 0.125) < 0.005, `hair ${JSON.stringify(fit.hair)}`);
});

test('a skull that sits forward of the joint is measured about its own centre', () => {
  const fit = measureHead(rig(1, 0.04));
  assert.ok(Math.abs(fit.skull.centre[1] - 0.04) < 0.005 && Math.abs(fit.skull.centre[0]) < 0.005, `centre ${fit.skull.centre}`);
  assert.ok(Math.abs(fit.skull.radius - 0.1) < 0.005, `radius about the centre ${fit.skull.radius}`);
  assert.ok(Math.abs(fit.skull.front - 0.14) < 0.005, `front ${fit.skull.front}`);
});

test('measurements scale with the instance and fall back for rigs without a skinned head', () => {
  const small = measureHead(rig(0.5));
  assert.ok(Math.abs(small.skull.top - 0.075) < 0.004 && Math.abs(small.hair.radius - 0.0625) < 0.004, JSON.stringify(small));
  const model = new THREE.Group(); const head = new THREE.Bone(); head.name = 'head'; model.add(head);
  assert.deepEqual(measureHead({ model }), DEFAULT_HEAD_FIT);
});

test('every folk hat clears the measured hair and sits on the crown', () => {
  for (const folk of OZ_FOLK) {
    const avatar = rig();
    const id = [...Array(200).keys()].map(i => `local-${i}`).find(id => OZ_FOLK[[...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 0) % OZ_FOLK.length] === folk);
    const applied = applyOzFolk(avatar, id);
    assert.equal(applied.name, folk.name);
    const hat = avatar.head.children.find(child => child.name === `${folk.name} hat`);
    assert.ok(hat, `${folk.name} hat attached`);
    const box = new THREE.Box3().setFromObject(hat), fit = measureHead(avatar), origin = avatar.head.getWorldPosition(new THREE.Vector3());
    const top = box.max.y - origin.y, bottom = box.min.y - origin.y;
    const under = folk.hat === 'hood' ? fit.skull.top : fit.hair.top; // a hood replaces the hair
    assert.ok(top > under + 0.01, `${folk.name}: rises above what it covers (${top.toFixed(3)} vs ${under.toFixed(3)})`);
    assert.ok(bottom < fit.hair.top, `${folk.name}: reaches down to the head (${bottom.toFixed(3)})`);
    assert.ok(hat.children.every(mesh => mesh.geometry.attributes.position.array.every(Number.isFinite)));
    const hairMesh = avatar.model.children.find(mesh => mesh.material.name === 'bob01');
    assert.equal(hairMesh.visible, folk.hat !== 'hood', `${folk.name}: hood replaces hair, other hats keep it`);
  }
});
