import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeJetAgeParts } from '../src/jet-age-forms.js';
import { SURFACE_PROVENANCE, surfaceProvenance } from '../src/surface-provenance.js';
import { VENUE_BUILDERS, buildFiveRoomsShells } from '../src/five-rooms/index.js';
import { createShellKit, shellMaterials, venueFrame } from '../src/five-rooms/shells.js';

const contract = JSON.parse(readFileSync(new URL('../../config/ribbon/five-rooms.json', import.meta.url), 'utf8'));
const triangle = x => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([x, 0, 0, x + 1, 0, 0, x, 1, 0], 3));
const inspect = (mesh, faceIndex) => surfaceProvenance({ object: mesh, faceIndex });

test('indexed parts and interleaved materials retain input ordinal, venue and exact triangle boundaries', () => {
  const indexed = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
  indexed.setIndex([0, 1, 2, 1, 3, 2]);
  const parts = [{ material: 'a', geometry: indexed, venue: 'first' }, { material: 'b', geometry: triangle(4), venue: 'middle' }, { material: 'a', geometry: triangle(8), venue: 'last' }];
  const disposed = parts.map(() => 0);
  parts.forEach((part, i) => part.geometry.addEventListener('dispose', () => disposed[i]++));
  const merged = mergeJetAgeParts(parts), a = new THREE.Mesh(merged.get('a')), b = new THREE.Mesh(merged.get('b'));
  assert.deepEqual([...merged.keys()], ['a', 'b']);
  assert.equal(a.geometry.index, null);
  assert.deepEqual(Array.from(a.geometry.attributes.position.array), [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 8, 0, 0, 9, 0, 0, 8, 1, 0]);
  for (const face of [0, 1]) assert.deepEqual([inspect(a, face).venueId, inspect(a, face).partOrdinal, inspect(a, face).triangleRange], ['first', 0, [0, 2]]);
  assert.deepEqual([inspect(a, 2).venueId, inspect(a, 2).partOrdinal, inspect(a, 2).triangleRange], ['last', 2, [2, 3]]);
  assert.deepEqual([inspect(b, 0).venueId, inspect(b, 0).partOrdinal], ['middle', 1]);
  assert.deepEqual(disposed, [1, 1, 1]);
  assert.equal(inspect(a, 2).contractVersion, null);
  assert.deepEqual(JSON.parse(JSON.stringify(a.geometry.userData)), a.geometry.userData);
  for (const geometry of merged.values()) geometry.dispose();
});

test('real shell builders resolve actual ray hits to the originating venue in both finishes', () => {
  for (const finish of ['classic', 'pink-jet-age']) {
    const group = buildFiveRoomsShells(contract, { finish });
    group.updateMatrixWorld(true);
    const seen = new Set();
    for (const mesh of group.children) {
      const position = mesh.geometry.attributes.position;
      for (const range of mesh.geometry.userData[SURFACE_PROVENANCE].ranges) {
        if (seen.has(range.venue)) continue;
        for (let face = range.start; face < range.start + range.count; face++) {
          const a = new THREE.Vector3().fromBufferAttribute(position, face * 3), b = new THREE.Vector3().fromBufferAttribute(position, face * 3 + 1), c = new THREE.Vector3().fromBufferAttribute(position, face * 3 + 2);
          const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
          if (normal.lengthSq() < 1e-12) continue;
          normal.normalize();
          const centre = a.add(b).add(c).multiplyScalar(1 / 3), ray = new THREE.Raycaster(centre.clone().addScaledVector(normal, 0.01), normal.clone().negate(), 0, 0.02);
          const hit = ray.intersectObject(mesh).find(hit => hit.faceIndex === face);
          if (!hit) continue;
          const result = surfaceProvenance(hit);
          assert.equal(result.status, 'available'); assert.equal(result.venueId, range.venue);
          assert.equal(result.contractVersion, contract.version); assert.equal(result.materialKey, mesh.material.userData.fiveRooms.key);
          assert.deepEqual(result.bindings, { entrance: 'unavailable', attachment: 'unavailable', action: 'unavailable' });
          seen.add(result.venueId); break;
        }
      }
    }
    assert.deepEqual([...seen].sort(), contract.venues.map(venue => venue.id).sort());
    group.userData.dispose();
  }
});

test('real shell kit consumes each source geometry once and stores only primitive ranges', () => {
  const materials = shellMaterials(), kit = createShellKit(materials), original = kit.add;
  let created = 0, disposed = 0;
  kit.add = (material, geometry, options) => { created++; geometry.addEventListener('dispose', () => disposed++); return original(material, geometry, options); };
  for (const venue of contract.venues) VENUE_BUILDERS[venue.id](kit, venueFrame(venue));
  const { merged } = kit.finish();
  assert.ok(created > 100); assert.equal(disposed, created); assert.equal(merged.size, 8);
  let retained = 0;
  for (const geometry of merged.values()) {
    const record = geometry.userData[SURFACE_PROVENANCE];
    assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
    retained += record.ranges.length;
    assert.deepEqual(Object.keys(geometry.attributes).sort(), ['normal', 'position', 'uv']);
    assert.deepEqual(geometry.groups, []); assert.equal(geometry.index, null);
    geometry.dispose();
  }
  assert.equal(retained, created);
  for (const material of materials.values()) material.dispose();
});

test('invalid face indices and absent or malformed geometry provenance remain unavailable', () => {
  const geometry = mergeJetAgeParts([{ material: 'a', geometry: triangle(0), venue: 'venue' }]).get('a'), mesh = new THREE.Mesh(geometry);
  for (const face of [undefined, null, -1, 0.5, NaN, Infinity, '0', 1]) assert.equal(inspect(mesh, face).status, 'unavailable');
  assert.equal(surfaceProvenance(null).status, 'unavailable');
  geometry.userData[SURFACE_PROVENANCE].ranges[0].count = 2;
  assert.equal(inspect(mesh, 0).status, 'unavailable');
  delete geometry.userData[SURFACE_PROVENANCE]; assert.equal(inspect(mesh, 0).status, 'unavailable');
  geometry.dispose();
});

test('names, material roles and nearby attachment metadata never manufacture provenance or usability', () => {
  const mesh = new THREE.Mesh(triangle(0), new THREE.MeshStandardMaterial()); mesh.name = 'venue:salon entrance usable';
  mesh.material.userData.fiveRooms = { role: 'usable' };
  const parent = new THREE.Group(); parent.name = 'Five Rooms shells';
  parent.userData.fiveRooms = { version: 'actual-ancestor-version', attachments: [{ id: 'nearby-door', role: 'entrance', position: [0, 0] }] };
  parent.add(mesh);
  assert.equal(inspect(mesh, 0).status, 'unavailable');
  mesh.geometry.dispose(); mesh.geometry = mergeJetAgeParts([{ material: 'glow-usable', geometry: triangle(0), venue: 'decorative-part' }]).get('glow-usable');
  const result = inspect(mesh, 0);
  assert.equal(result.venueId, 'decorative-part'); assert.equal(result.contractVersion, 'actual-ancestor-version');
  assert.deepEqual(result.bindings, { entrance: 'unavailable', attachment: 'unavailable', action: 'unavailable' });
  assert.equal(Object.hasOwn(result, 'usable'), false); assert.equal(Object.hasOwn(result, 'permission'), false);
  parent.remove(mesh); assert.equal(inspect(mesh, 0).contractVersion, null);
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('unlabelled batches retain no provenance, and unlabelled parts in mixed batches stay unknown', () => {
  const empty = mergeJetAgeParts([{ material: 'a', geometry: triangle(0) }]).get('a');
  assert.deepEqual(empty.userData, {}); empty.dispose();
  const geometry = mergeJetAgeParts([{ material: 'a', geometry: triangle(0), venue: 'known' }, { material: 'a', geometry: triangle(2) }]).get('a');
  const result = inspect(new THREE.Mesh(geometry), 1);
  assert.equal(result.status, 'available'); assert.equal(result.venueId, null); assert.equal(result.partOrdinal, 1);
  geometry.dispose();
});
