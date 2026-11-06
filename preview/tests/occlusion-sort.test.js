import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLRenderLists } from 'three/src/renderers/webgl/WebGLRenderLists.js';
import { programSignature } from '../src/draw-census.js';
import { occlusionKind, occlusionOpaqueSort, occlusionTransparentSort, withOcclusionSort } from '../src/occlusion-sort.js';
import { instantiateAvatar } from '../src/avatars.js';
import { createRomanceLook } from '../src/romance-look.js';
import { SHARED_APPEARANCES } from '../src/shared-appearances.js';
import { loadCharacterRig } from './helpers/character-rig.js';

const morphed = (geometry, { positions = 1, normal = false, color = false } = {}) => {
  geometry.morphAttributes.position = Array.from({ length: positions }, () => geometry.attributes.position.clone());
  if (normal) geometry.morphAttributes.normal = [geometry.attributes.normal.clone()];
  if (color) geometry.morphAttributes.color = [geometry.attributes.position.clone()];
  return geometry;
};

test('the occlusion kind distinguishes exactly what the census program signature does', () => {
  const material = new THREE.MeshStandardMaterial(), bone = new THREE.Bone();
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material); skinned.add(bone); skinned.bind(new THREE.Skeleton([bone]));
  const skinnedMorph = new THREE.SkinnedMesh(morphed(new THREE.BoxGeometry(), { positions: 2, normal: true }), material);
  const tinted = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 3); tinted.setColorAt(0, new THREE.Color('red'));
  const objects = [
    new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.SphereGeometry(), material),
    skinned, skinnedMorph, new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 3), tinted,
    new THREE.Mesh(morphed(new THREE.BoxGeometry()), material), new THREE.Mesh(morphed(new THREE.BoxGeometry(), { positions: 2 }), material),
    new THREE.Mesh(morphed(new THREE.BoxGeometry(), { normal: true }), material), new THREE.Mesh(morphed(new THREE.BoxGeometry(), { color: true }), material),
  ];
  for (const a of objects) for (const b of objects) {
    assert.equal(occlusionKind(a, a.geometry) === occlusionKind(b, b.geometry), programSignature(a, a.geometry) === programSignature(b, b.geometry),
      `${programSignature(a, a.geometry)} vs ${programSignature(b, b.geometry)}`);
  }
});

// Deterministic depths in [0, 60): Math.imul mixing, so nearby indices scatter.
const depth = index => ((Math.imul(index + 1, 2654435761) >>> 0) % 6000) / 100;

// Every draw of one frame under GTAO's override, in three's own list order.
function frameList(objects) {
  const list = new WebGLRenderLists().get(new THREE.Scene(), 0), camera = new THREE.PerspectiveCamera();
  list.init();
  objects.forEach((object, index) => {
    const materials = Array.isArray(object.material) ? object.material : null;
    if (materials) for (const group of object.geometry.groups) list.push(object, object.geometry, materials[group.materialIndex], 0, depth(index), group, camera);
    else list.push(object, object.geometry, object.material, 0, depth(index), null, camera);
  });
  list.finish();
  return list;
}

// Program re-derivations of the single override material: kind changes between
// consecutive draws, across three's opaque, transmissive and transparent lists.
const drawn = list => [...list.opaque, ...list.transmissive, ...list.transparent];
const switches = items => items.reduce((count, item, i) => count + (i > 0 && programSignature(item.object, item.geometry) !== programSignature(items[i - 1].object, items[i - 1].geometry)), 0);
const kinds = items => new Set(items.map(item => programSignature(item.object, item.geometry))).size;

test('real remote avatars among world meshes: kind order leaves one program per kind and list', async () => {
  const objects = [], avatars = [];
  for (const look of SHARED_APPEARANCES.filter(look => look.id !== 'jevica').slice(0, 3)) {
    const source = await loadCharacterRig(look.rig);
    for (let copy = 0; copy < 2; copy++) {
      const avatar = instantiateAvatar(source, { targetHeight: source.height, id: `occlusion-${look.id}-${copy}` });
      const root = new THREE.Group(); root.add(avatar.model); createRomanceLook(avatar, root, look); avatars.push(avatar);
      root.traverse(mesh => { if (mesh.isMesh) objects.push(mesh); });
    }
  }
  // World props between the avatars, each with its own material, as in a district.
  for (let i = 0; i < 60; i++) {
    const material = new THREE.MeshStandardMaterial({ transparent: i % 10 === 0, opacity: i % 10 === 0 ? 0.5 : 1 });
    objects.splice((i * 7) % objects.length, 0, i % 4 === 0 ? new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 4) : new THREE.Mesh(new THREE.BoxGeometry(), material));
  }

  const three = frameList(objects); three.sort();
  const before = switches(drawn(three));
  const kind = frameList(objects); kind.sort(occlusionOpaqueSort, occlusionTransparentSort);
  const after = switches(drawn(kind));

  const lists = [kind.opaque, kind.transmissive, kind.transparent].filter(list => list.length);
  const ceiling = lists.reduce((sum, list) => sum + kinds(list) - 1, 0) + lists.length - 1;
  assert.ok(before > ceiling * 3, `negative control: three's order re-derives ${before} times for ${kinds(drawn(three))} kinds`);
  assert.ok(after <= ceiling, `kind order re-derives ${after} times, at most ${ceiling}`);
  const draw = item => `${item.object.id}:${item.geometry.id}:${item.material.id}:${item.group?.start ?? -1}`;
  assert.deepEqual(drawn(kind).map(draw).sort(), drawn(three).map(draw).sort(), 'every draw is kept');
  for (const [list, front] of [[kind.opaque, 1], [kind.transparent, -1]]) {
    for (let i = 1; i < list.length; i++) {
      if (occlusionKind(list[i].object, list[i].geometry) !== occlusionKind(list[i - 1].object, list[i - 1].geometry)) continue;
      assert.ok(front * (list[i].z - list[i - 1].z) >= 0, 'opaque front to back, transparent back to front, within a kind');
    }
  }
  for (const avatar of avatars) avatar.dispose();
});

test('explicit group and render order still come before kind', () => {
  const material = new THREE.MeshStandardMaterial(), bone = new THREE.Bone();
  const late = new THREE.Mesh(new THREE.BoxGeometry(), material); late.renderOrder = 2;
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material); skinned.add(bone); skinned.bind(new THREE.Skeleton([bone]));
  const rigid = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const item = (object, groupOrder, z) => ({ id: object.id, object, geometry: object.geometry, material, groupOrder, renderOrder: object.renderOrder, z });
  const items = [item(late, 0, 1), item(skinned, 0, 5), item(rigid, 1, 0), item(rigid, 0, 9)];
  assert.deepEqual(items.sort(occlusionOpaqueSort).map(entry => [entry.groupOrder, entry.object.renderOrder, entry.z]), [[0, 0, 9], [0, 0, 5], [0, 2, 1], [1, 0, 0]]);
});

test('the pass sorts by kind only while it draws, and restores three\'s order after a failure', () => {
  const calls = [], renderer = { setOpaqueSort: sort => calls.push(['opaque', sort]), setTransparentSort: sort => calls.push(['transparent', sort]) };
  assert.equal(withOcclusionSort(renderer, true, () => { calls.push(['draw']); return 7; }), 7);
  assert.deepEqual(calls, [['opaque', occlusionOpaqueSort], ['transparent', occlusionTransparentSort], ['draw'], ['opaque', null], ['transparent', null]]);
  calls.length = 0;
  assert.throws(() => withOcclusionSort(renderer, true, () => { throw new Error('lost context'); }), /lost context/);
  assert.deepEqual(calls.slice(-2), [['opaque', null], ['transparent', null]]);
  calls.length = 0;
  withOcclusionSort(renderer, false, () => calls.push(['draw']));
  assert.deepEqual(calls, [['draw']], 'the audit switch leaves three\'s order untouched');
});

test('a pooled render item keeps no reference to a model removed from the scene', () => {
  // three reuses render items across frames and clears an unused item's own object and
  // geometry; the kind cache must not hold them either, or a removed model stays in memory.
  const lists = new WebGLRenderLists(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), material = new THREE.MeshStandardMaterial();
  const frame = objects => {
    const list = lists.get(scene, 0);list.init();
    objects.forEach((object, index) => list.push(object, object.geometry, material, 0, depth(index), null, camera));
    list.finish();list.sort(occlusionOpaqueSort, occlusionTransparentSort);return list;
  };
  const kept = new THREE.Mesh(new THREE.BoxGeometry(), material), removed = Array.from({ length: 4 }, () => new THREE.Mesh(new THREE.SphereGeometry(), material));
  // The first frame's items are the pool three reuses (and clears) in later frames.
  const pool = [...frame([kept, ...removed]).opaque];
  const list = frame([kept]);
  assert.equal(list.opaque.length, 1);
  assert.ok(pool.includes(list.opaque[0]), 'three reused its pooled item');
  const references = new Set([...removed, ...removed.map(mesh => mesh.geometry)]);
  assert.equal(pool.flatMap(item => Object.values(item)).filter(value => references.has(value)).length, 0);
});
