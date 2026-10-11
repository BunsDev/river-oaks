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

test('shipped reference looks retain their intended surfaces while bounding accessory draws in both forms', async () => {
  const cases = [
    ['sable-human', 9880, 20], ['woman-casual', 9880, 20],
    ['rowan-human', 7644, 20], ['man-casual', 7644, 20],
    ['woman-tailored', 7812, 20], ['vesper-beast', 7812, 20],
    ['man-tailored', 9908, 20], ['midnight-host-wolf', 9908, 20],
    ['lyra-human', 6336, 19], ['woman-daywear', 6336, 19],
    ['man-workwear', 13140, 20], ['kai-formal-beast', 13140, 20],
    ['kai-explorer', 9020, 20], ['kai-explorer-beast', 9020, 20],
    ['kai-noir', 14484, 20], ['kai-noir-beast', 14484, 20],
    ['forest-aristocrat', 152400, 40], ['forest-aristocrat-beast', 152400, 40],
    ['forest-aristocrat-feminine', 171184, 55], ['forest-aristocrat-feminine-beast', 171184, 55],
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

test('forest blossoms share two outfit-owned materials without sharing across avatars', async () => {
  for (const id of ['forest-aristocrat', 'forest-aristocrat-feminine']) {
    const appearance = sharedAppearance(id), source = await loadCharacterRig(appearance.rig);
    const instances = Array.from({ length: 2 }, () => {
      const avatar = instantiateAvatar(source, { targetHeight: source.height, id });
      const look = createReferenceStyle(avatar, appearance);
      const flowers = new Map(['f5efe0', 'd9b25a'].map(color => [color, new Set()]));
      avatar.model.traverse(mesh => {
        if (mesh.isMesh && !Array.isArray(mesh.material)) flowers.get(mesh.material.color?.getHexString())?.add(mesh.material);
      });
      return { avatar, look, flowers };
    });
    let disposedFirst = false, released = 0, releasedOther = 0;
    try {
      for (const color of ['f5efe0', 'd9b25a']) {
        assert.equal(instances[0].flowers.get(color).size, 1, `${id}: identical blossom surfaces must batch`);
        assert.equal(instances[1].flowers.get(color).size, 1);
        const [first] = instances[0].flowers.get(color), [second] = instances[1].flowers.get(color);
        assert.notEqual(first, second, 'one outfit cannot dispose another avatar\'s material');
        first.addEventListener('dispose', () => released++);
        second.addEventListener('dispose', () => releasedOther++);
      }
      instances[0].look.dispose(); disposedFirst = true;
      assert.equal(released, 2, 'both shared blossom materials dispose once per outfit');
      assert.equal(releasedOther, 0, 'another outfit remains usable');
    } finally {
      if (!disposedFirst) instances[0].look.dispose();
      instances[1].look.dispose();
      for (const { avatar } of instances) avatar.dispose();
    }
  }
});
