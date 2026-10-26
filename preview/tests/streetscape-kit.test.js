import test from 'node:test';
import assert from 'node:assert/strict';
import { compileStreetscape, STREETSCAPE_MODULES, streetscapeGroundAt } from '../../shared/streetscape-kit.js';
import { buildStreetscape } from '../src/streetscape-kit.js';
import * as THREE from 'three';

const placement = (module = 'storefront', rotation = 0) => ({ id: 'pilot', module, position: [10, 20, 2], rotation });
const compile = item => compileStreetscape({ id: 'kit-test', placements: [item] });
const rotate = ([x, y], degrees) => {
  const a = degrees * Math.PI / 180;
  return [10 + x * Math.cos(a) - y * Math.sin(a), 20 + x * Math.sin(a) + y * Math.cos(a)];
};
// Independent convex-ring point/distance query, including a walking radius.
function blocked(rings, [x, y], radius = .35) {
  return rings.some(ring => {
    let inside = false, nearest = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j], [bx, by] = ring[i], dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      nearest = Math.min(nearest, Math.hypot(x - ax - t * dx, y - ay - t * dy));
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside || nearest < radius;
  });
}

for (const rotation of [0, 90, 180, 270]) test(`storefront entry and blocking walls rotate together at ${rotation} degrees`, () => {
  const plan = compile(placement('storefront', rotation));
  for (let north = -6; north <= 2; north += .1) assert.equal(blocked(plan.collisionRings, rotate([0, north], rotation)), false);
  assert.equal(blocked(plan.collisionRings, rotate([1.95, 0], rotation)), true);
  assert.equal(blocked(plan.collisionRings, rotate([0, 3.95], rotation)), true);
  const entry = plan.sockets.find(item => item.role === 'entry');
  assert.ok(entry);
  assert.deepEqual(entry.position.map(x => Math.round(x * 1000) / 1000), [...rotate([0, -4], rotation), 2].map(x => Math.round(x * 1000) / 1000));
  assert.ok(plan.flightVolumes.some(volume => volume.bottom >= 5.2));
  assert.equal(new Set(plan.parts.map(part => part.id)).size, plan.parts.length);
});

test('pavilion keeps through and occupied activity space clear beneath its roof', () => {
  const plan = compile(placement('pavilion'));
  for (let x = -5; x <= 5; x += .1) assert.equal(blocked(plan.collisionRings, [10 + x, 20]), false);
  for (const p of [[-2, -1], [-2, 1], [2, -1], [2, 1]]) assert.equal(blocked(plan.collisionRings, rotate(p, 0)), false);
  assert.equal(blocked(plan.collisionRings, rotate([5.75, 3.75], 0)), true);
});

test('catalog records original provenance, metre bounds, pivots and explicit collision', () => {
  for (const [id, module] of Object.entries(STREETSCAPE_MODULES)) {
    assert.ok(module.size.every(value => Number.isFinite(value) && value > 0), id);
    assert.equal(module.provenance.kind, 'original-authored');
    assert.equal(module.provenance.source, 'TypeSafe Place streetscape kit');
    assert.equal(module.pivot, 'ground-centre');
    const plan = compile(placement(id));
    assert.ok(plan.parts.length > 0, id);
    assert.ok(plan.parts.every(part => typeof part.collidable === 'boolean'), id);
    for (const part of plan.parts) for (const value of [...part.position, ...part.size, part.rotation]) assert.ok(Number.isFinite(value));
  }
});

test('compilation is deterministic, input preserving, and separates overlapping local IDs', () => {
  const input = { id: 'pilot-block', placements: [placement(), { ...placement('bench'), id: 'bench', position: [4, 3, 2] }] };
  const before = structuredClone(input), first = compileStreetscape(input);
  assert.deepEqual(input, before);
  assert.deepEqual(first, compileStreetscape({ ...input, placements: [...input.placements].reverse() }));
  assert.equal(new Set(first.parts.map(part => part.id)).size, first.parts.length);
  first.parts[0].position[0] = 999;
  assert.notDeepEqual(first, compileStreetscape(input));
});

test('rejects invalid placements before rendering', () => {
  for (const patch of [{ module: 'missing' }, { id: '' }, { position: [NaN, 0, 0] }, { position: Array(3) }, { position: [0, 0] }, { rotation: 45 }, { rotation: Infinity }, { palette: 'unknown' }, { scale: 2 }]) {
    assert.throws(() => compile({ ...placement(), ...patch }), /Invalid streetscape/);
  }
  assert.throws(() => compileStreetscape({ id: 'same', placements: [placement(), placement()] }), /duplicate/i);
  assert.throws(() => compileStreetscape({ id: 'huge', placements: Array.from({ length: 257 }, (_, i) => ({ ...placement(), id: `p-${i}` })) }), /budget/i);
});

test('renderer instances repeated parts and matches shared transformed bounds', () => {
  const input = { id: 'render-pilot', placements: [placement('storefront', 90), { ...placement('storefront'), id: 'second', position: [22, 20, 2] }] };
  const plan = compileStreetscape(input), root = buildStreetscape(plan);
  assert.ok(root.children.every(child => child.isInstancedMesh));
  assert.ok(root.children.length < 20);
  assert.equal(root.children.reduce((sum, mesh) => sum + mesh.count, 0), plan.parts.length);
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  for (const mesh of root.children) for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
    const part = plan.parts.find(item => item.id === mesh.userData.partIds[i]);
    assert.ok(point.distanceTo(new THREE.Vector3(part.position[0], part.position[2], -part.position[1])) < 1e-5);
  }
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const [w, s, bottom, e, n, top] = plan.bounds;
  for (const [actual, expected] of [[bounds.min.x, w], [bounds.max.x, e], [bounds.min.y, bottom], [bounds.max.y, top], [bounds.min.z, -n], [bounds.max.z, -s]]) assert.ok(Math.abs(actual - expected) < 1e-4);
  root.userData.dispose();
});

test('reduced detail preserves collision parts and disposal releases only owned resources once', () => {
  const plan = compile(placement()), root = buildStreetscape(plan, { detail: 'low' });
  const ids = root.children.flatMap(mesh => mesh.userData.partIds);
  for (const part of plan.parts.filter(item => item.collidable)) assert.ok(ids.includes(part.id));
  assert.ok(ids.length < plan.parts.length);
  const geometries = new Set(root.children.map(mesh => mesh.geometry)), materials = new Set(root.children.map(mesh => mesh.material));
  let geometryDisposals = 0, materialDisposals = 0, textureDisposals = 0, meshDisposals = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const mesh of root.children) mesh.addEventListener('dispose', () => meshDisposals++);
  for (const material of materials) {
    material.addEventListener('dispose', () => materialDisposals++);
    for (const key of ['map', 'normalMap', 'roughnessMap']) material[key]?.addEventListener('dispose', () => textureDisposals++);
  }
  const meshCount = root.children.length;
  root.userData.dispose(); root.userData.dispose();
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  assert.equal(meshDisposals, meshCount);
  assert.equal(textureDisposals, 0);
  assert.equal(root.children.length, 0);
  assert.throws(() => buildStreetscape(plan, { detail: 'invalid' }), /detail/);
});

test('declared bounds include the asymmetric canopy and every transformed part', () => {
  for (const rotation of [0, 90, 180, 270]) {
    const plan = compile(placement('storefront', rotation));
    const [w, s, bottom, e, n, top] = plan.bounds;
    for (const part of plan.parts) {
      const angle = part.rotation * Math.PI / 180;
      for (const x of [-.5, .5]) for (const y of [-.5, .5]) {
        const px = part.position[0] + x * part.size[0] * Math.cos(angle) - y * part.size[1] * Math.sin(angle);
        const py = part.position[1] + x * part.size[0] * Math.sin(angle) + y * part.size[1] * Math.cos(angle);
        assert.ok(px >= w - 1e-8 && px <= e + 1e-8 && py >= s - 1e-8 && py <= n + 1e-8, part.id);
      }
      assert.ok(part.position[2] - part.size[2] / 2 >= bottom - 1e-8 && part.position[2] + part.size[2] / 2 <= top + 1e-8);
    }
  }
});

test('floor support follows rotated rendered slabs and never treats overhead roofs as ground', () => {
  for (const rotation of [0, 90, 180, 270]) {
    const plan = compile(placement('storefront', rotation));
    assert.ok(Math.abs(streetscapeGroundAt(plan, ...rotate([0, 0], rotation)) - 2.06) < 1e-9);
    assert.ok(Math.abs(streetscapeGroundAt(plan, ...rotate([0, -4], rotation)) - 2.06) < 1e-9);
    assert.equal(streetscapeGroundAt(plan, ...rotate([0, -4.01], rotation)), null);
    assert.equal(streetscapeGroundAt(plan, NaN, 20), null);
    assert.equal(plan.supportSurfaces.length, 1);
  }
  assert.equal(streetscapeGroundAt(compile(placement('pavilion')), 10, 20), null);
});

test('planter detail uses bounded existing foliage and tears down all owned GPU resources', () => {
  const plan = compile(placement('planter', 90)), root = buildStreetscape(plan), low = buildStreetscape(plan, { detail: 'low' });
  assert.deepEqual(root.userData.plantSpecies, ['agave', 'coleus', 'pentas']);
  const plants = root.children.filter(mesh => mesh.userData.streetscapePlanting);
  assert.ok(plants.length > 1);
  assert.ok(root.userData.metrics.plantInstances > 3);
  assert.equal(low.userData.metrics.plantInstances, 0);
  const [w, s, bottom, e, n, top] = plan.bounds;
  root.updateMatrixWorld(true);
  for (const mesh of plants) {
    const bounds = new THREE.Box3().setFromObject(mesh);
    assert.ok(bounds.min.x >= w - .001 && bounds.max.x <= e + .001);
    assert.ok(bounds.min.z >= -n - .001 && bounds.max.z <= -s + .001);
    assert.ok(bounds.min.y >= bottom && bounds.max.y <= top + .001);
  }
  const geometries = new Set(root.children.map(mesh => mesh.geometry)), materials = new Set(root.children.map(mesh => mesh.material));
  let geo = 0, mat = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => geo++);
  for (const material of materials) material.addEventListener('dispose', () => mat++);
  root.userData.dispose(); root.userData.dispose(); low.userData.dispose();
  assert.equal(geo, geometries.size); assert.equal(mat, materials.size);
});
