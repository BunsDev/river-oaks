import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchCostumeAttachments } from '../src/costume-batching.js';
import { createReferenceStyle } from '../src/reference-archetypes.js';
import { sharedAppearance } from '../src/shared-appearances.js';
import { instantiateAvatar } from '../src/avatars.js';
import { loadCharacterRig } from './helpers/character-rig.js';

function surfaceVertices(meshes) {
  return meshes.flatMap(mesh => {
    mesh.updateWorldMatrix(true, false);
    const { position, normal, uv } = mesh.geometry.attributes;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    return Array.from({ length: mesh.geometry.index?.count ?? position.count }, (_, n) => {
      const i = mesh.geometry.index?.getX(n) ?? n;
      const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const direction = new THREE.Vector3().fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix);
      return [...point, ...direction, uv.getX(i), uv.getY(i)].map(value => value.toFixed(5)).join(',');
    });
  }).sort();
}

test('selective bone batching preserves surfaces and leaves independently controlled pieces intact', () => {
  const bone = new THREE.Bone(), group = new THREE.Group(); bone.add(group);
  const material = new THREE.MeshPhysicalMaterial(), owned = new Set();
  const add = (x, name = '') => {
    const geometry = new THREE.BoxGeometry(.2, .3, .4); owned.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.x = x;
    mesh.rotation.z = .3; mesh.scale.set(1, 2, .5); mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const first = add(-1), second = add(1), named = add(2, 'independent trim');
  const hidden = add(3); hidden.visible = false;
  const transparent = add(4); transparent.material = material.clone(); transparent.material.transparent = true;
  bone.rotation.y = .4;
  const expected = surfaceVertices([first, second]);
  let released = 0;
  for (const mesh of [first, second]) mesh.geometry.addEventListener('dispose', () => released++);
  batchCostumeAttachments([{ group }], owned, mesh => !mesh.name && mesh.visible && !mesh.material.transparent);
  assert.equal(group.children.length, 4, 'only two opaque static pieces become one draw');
  for (const mesh of [named, hidden, transparent]) assert.equal(mesh.parent, group);
  assert.equal(hidden.visible, false);
  const batch = group.children.find(mesh => ![named, hidden, transparent].includes(mesh));
  assert.equal(batch.material, material);
  assert.equal(batch.castShadow, true); assert.equal(batch.receiveShadow, true);
  assert.deepEqual(surfaceVertices([batch]), expected);
  // A bone animation must carry the baked pieces through the same transform.
  bone.rotation.set(.2, -.5, .1);
  group.add(first, second);
  assert.deepEqual(surfaceVertices([batch]), surfaceVertices([first, second]));
  first.removeFromParent(); second.removeFromParent();
  assert.equal(released, 2); assert.equal(owned.size, 4);
  assert.ok(owned.has(batch.geometry));
  for (const geometry of owned) geometry.dispose();
  material.dispose(); transparent.material.dispose();
});

test('shipped reference looks keep every triangle while bounding accessory draws in both forms', async () => {
  const cases = [
    ['sable-human', 9880, 20], ['woman-casual', 9880, 20],
    ['rowan-human', 7644, 20], ['man-casual', 8264, 20],
    ['woman-tailored', 8432, 20], ['vesper-beast', 8432, 20],
    ['man-tailored', 10528, 20], ['midnight-host-wolf', 10528, 20],
    ['lyra-human', 6956, 21], ['woman-daywear', 6956, 21],
    ['man-workwear', 16044, 20], ['kai-formal-beast', 16044, 20],
    ['kai-explorer', 11924, 20], ['kai-explorer-beast', 11924, 20],
    ['kai-noir', 17388, 20], ['kai-noir-beast', 17388, 20],
    ['forest-aristocrat', 153132, 80], ['forest-aristocrat-beast', 153132, 80],
    ['forest-aristocrat-feminine', 171916, 80], ['forest-aristocrat-feminine-beast', 171916, 80],
  ];
  for (const [id, triangles, maxDraws] of cases) {
    const appearance = sharedAppearance(id), source = await loadCharacterRig(appearance.rig);
    const avatar = instantiateAvatar(source, { targetHeight: source.height, id });
    const original = new Set(avatar.model.getObjectsByProperty('isMesh', true));
    const look = createReferenceStyle(avatar, appearance);
    const pieces = avatar.model.getObjectsByProperty('isMesh', true).filter(mesh => !original.has(mesh));
    assert.equal(pieces.reduce((n, mesh) => n + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0), triangles, id);
    assert.ok(pieces.length <= maxDraws, `${id}: ${pieces.length} accessory draws exceeds ${maxDraws}`);
    const geometries = new Set(pieces.map(mesh => mesh.geometry)); let released = 0;
    for (const geometry of geometries) geometry.addEventListener('dispose', () => released++);
    if (id === 'woman-daywear') {
      look.update({ beast: true });
      assert.ok(pieces.every(mesh => !mesh.visible), 'Lyra removes her outfit while prowling');
      look.update({ beast: false }); assert.ok(pieces.every(mesh => mesh.visible));
    }
    look.dispose(); assert.equal(released, geometries.size, id);
    assert.ok(pieces.every(mesh => mesh.parent?.parent === null), `${id}: attachment groups detach`);
    avatar.dispose();
  }
});
