import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { programSignature } from '../src/draw-census.js';
import { assignShadowDepth, setShadowDepth } from '../src/shadow-depth.js';
import { instantiateAvatar } from '../src/avatars.js';
import { createRomanceLook } from '../src/romance-look.js';
import { SHARED_APPEARANCES } from '../src/shared-appearances.js';
import { loadCharacterRig } from './helpers/character-rig.js';

const caster = (object, material = object.material) => Object.assign(object, { castShadow: true, material });

test('each kind of shadow caster gets one depth material, and cutouts keep three\'s own path', () => {
  const root = new THREE.Group(), plain = new THREE.MeshStandardMaterial();
  const bone = new THREE.Bone(), skinned = caster(new THREE.SkinnedMesh(new THREE.BoxGeometry(), plain));
  skinned.add(bone); skinned.bind(new THREE.Skeleton([bone]));
  const rigid = caster(new THREE.Mesh(new THREE.BoxGeometry(), plain)), rigid2 = caster(new THREE.Mesh(new THREE.SphereGeometry(), plain));
  const morphed = caster(new THREE.Mesh(new THREE.BoxGeometry(), plain));
  morphed.geometry.morphAttributes.position = [morphed.geometry.attributes.position.clone()];
  const instanced = caster(new THREE.InstancedMesh(new THREE.BoxGeometry(), plain, 2));
  const cutout = caster(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ alphaTest: .4 })));
  const clipped = caster(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ clipShadows: true, clippingPlanes: [new THREE.Plane()] })));
  const displaced = caster(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ displacementMap: new THREE.Texture(), displacementScale: 1 })));
  const mixed = caster(new THREE.Mesh(new THREE.BoxGeometry(), [plain, cutout.material]));
  const own = caster(new THREE.Mesh(new THREE.BoxGeometry(), plain)); own.customDepthMaterial = new THREE.MeshDepthMaterial();
  const unlit = new THREE.Mesh(new THREE.BoxGeometry(), plain);
  root.add(skinned, rigid, rigid2, morphed, instanced, cutout, clipped, displaced, mixed, own, unlit);
  const assigned = assignShadowDepth(root);
  assert.deepEqual(new Set(assigned), new Set([skinned, rigid, rigid2, morphed, instanced]));
  for (const mesh of [cutout, clipped, displaced, mixed, unlit]) assert.equal(mesh.customDepthMaterial, undefined);
  assert.notEqual(own.customDepthMaterial, rigid.customDepthMaterial, 'an existing depth material is kept');
  assert.equal(rigid.customDepthMaterial, rigid2.customDepthMaterial, 'one material per kind');
  assert.equal(new Set([skinned, rigid, morphed, instanced].map(mesh => mesh.customDepthMaterial)).size, 4);
  assert.deepEqual(assignShadowDepth(root), [], 'a second pass changes nothing');
  setShadowDepth(assigned, false);
  assert.ok(assigned.every(mesh => mesh.customDepthMaterial === undefined), 'the audit switch restores three\'s shared material');
  setShadowDepth(assigned, true);
  assert.equal(rigid.customDepthMaterial, rigid2.customDepthMaterial);
});

test('on every exposed look, a depth material is only ever drawn for one kind of object', async () => {
  const kinds = new Map();
  for (const look of SHARED_APPEARANCES.filter(look => look.id !== 'jevica')) {
    const source = await loadCharacterRig(look.rig), avatar = instantiateAvatar(source, { targetHeight: source.height, id: `remote-depth-${look.id}` });
    const root = new THREE.Group(); root.add(avatar.model); createRomanceLook(avatar, root, look);
    const assigned = assignShadowDepth(root);
    assert.ok(assigned.length > 0, `${look.id}: ${assigned.length} casters share kind depth materials`);
    for (const mesh of assigned) {
      const signature = programSignature(mesh, mesh.geometry), previous = kinds.get(mesh.customDepthMaterial);
      assert.ok(previous === undefined || previous === signature, `${look.id}: ${mesh.name} reuses a depth material across kinds`);
      kinds.set(mesh.customDepthMaterial, signature);
    }
    root.traverse(mesh => {
      if (!mesh.isMesh || !mesh.castShadow) return;
      if (!(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(material => !(material.alphaTest > 0)))
        assert.equal(mesh.customDepthMaterial, undefined, `${look.id}: ${mesh.name} keeps its cutout shadow`);
      else assert.ok(assigned.includes(mesh), `${look.id}: ${mesh.name} receives its kind's depth material`);
    });
    avatar.dispose();
  }
});
