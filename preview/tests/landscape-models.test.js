import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { castShadowsFromProxies, matureTreePlacements, treeDetailLevel, TREE_LEAF_LAYERS, TREE_LOD_DISTANCES } from '../src/landscape-models.js';
import { groundSurfaceHeight } from '../src/world-surface.js';

const read = path => readFileSync(new URL(path, import.meta.url));
const world = JSON.parse(read('../public/data/district.json'));
world.vegetation = JSON.parse(read('../public/data/district-vegetation.json'));

test('mature crowns retain every existing stem and leave source layout untouched', () => {
  const before = structuredClone(world);
  const placements = matureTreePlacements(world);
  assert.equal(placements.length, world.vegetation.branch_supports.length);
  placements.forEach((tree, index) => {
    const [east, north] = world.vegetation.branch_supports[index].position;
    assert.deepEqual(tree.position, [east, groundSurfaceHeight(world, east, -north), -north]);
    assert.ok(tree.height >= 7.5 && tree.height <= 16);
    assert.ok(tree.radius >= 3.1 && tree.radius <= 5.2);
  });
  assert.deepEqual(world, before);
  const fallback = matureTreePlacements({ ...world, vegetation: undefined });
  assert.equal(fallback.length, world.trees.length);
  fallback.forEach((tree, index) => assert.equal(tree.position[0], world.trees[index].position[0]));
});

test('shipped vegetation has reproducible receipts, embedded PBR maps and bounded LODs', () => {
  const manifest = JSON.parse(read('../public/assets/landscape/manifest.json'));
  assert.equal(manifest.license, 'CC0-1.0');
  const counts = [], crownMaterials = [];
  for (const asset of manifest.derivatives) {
    const bytes = read(`../public${asset.path}`);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    if (/shade-tree-(mid|low)/.test(asset.path)) {
      // Lower crowns borrow the high LOD materials by name, so they ship geometry only.
      assert.equal(gltf.images, undefined, `${asset.path}: no duplicate texture download`);
      crownMaterials.push(gltf.materials.map(material => material.name).sort().join());
    } else {
      assert.ok(gltf.images.every(image => image.bufferView !== undefined), 'no runtime texture downloads');
      assert.ok(gltf.materials.every(material => material.pbrMetallicRoughness.baseColorTexture && material.normalTexture), 'retain color and normal detail');
      if (asset.path.includes('shade-tree-high')) crownMaterials.unshift(gltf.materials.map(material => material.name).sort().join());
    }
    const triangles = gltf.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((total, primitive) => total + gltf.accessors[primitive.indices].count / 3, 0), 0);
    if (asset.path.includes('shade-tree')) counts.push(triangles);
  }
  assert.equal(manifest.derivatives.length, 5);
  assert.equal(counts.length, 3);
  assert.ok(counts[0] < 110000 && counts[1] < 26000 && counts[2] < 7000);
  assert.ok(counts[0] > counts[1] && counts[1] > counts[2]);
  assert.equal(crownMaterials.length, 3);
  assert.ok(crownMaterials.every(names => names === crownMaterials[0]), 'every crown LOD resolves the high LOD materials');
  assert.ok(manifest.derivatives.reduce((sum, asset) => sum + asset.bytes, 0) < 16e6, 'landscape transfer stays near 15 MB');
});

test('crowns step down in detail with distance and never add leaf layers', () => {
  assert.equal(treeDetailLevel(0), 0);
  assert.equal(treeDetailLevel(TREE_LOD_DISTANCES[0] - 0.01), 0);
  assert.equal(treeDetailLevel(TREE_LOD_DISTANCES[0]), 1);
  assert.equal(treeDetailLevel(TREE_LOD_DISTANCES[1]), 2);
  assert.equal(treeDetailLevel(5000), 2);
  assert.ok(TREE_LEAF_LAYERS.every((layers, index) => index === 0 || layers <= TREE_LEAF_LAYERS[index - 1]));
});

test('EZ Tree oaks ship licensed, bounded assets without multiplying leaf shells', () => {
  const manifest = JSON.parse(read('../public/assets/landscape/ez-tree-manifest.json'));
  assert.equal(manifest.generator, '@dgreenheck/ez-tree');
  assert.equal(manifest.version, '1.1.0');
  assert.equal(manifest.license, 'MIT');
  assert.match(read('../public/assets/landscape/ez-tree-LICENSE.txt').toString(), /Copyright \(c\) 2024 Daniel Greenheck/);
  assert.deepEqual(TREE_LEAF_LAYERS, [1, 1, 1], 'the generated crown is already dense');
  const counts = [], materials = [];
  for (const asset of manifest.derivatives) {
    const bytes = read(`../public${asset.path}`);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    materials.push(gltf.materials.map(material => material.name).sort().join());
    if (asset.path.includes('high')) {
      assert.ok(gltf.images.every(image => image.bufferView !== undefined));
      assert.ok(gltf.materials.every(material => material.pbrMetallicRoughness.baseColorTexture));
      assert.ok(gltf.materials.find(material => material.name === 'branches').normalTexture);
      assert.equal(gltf.materials.find(material => material.name === 'leaves').alphaMode, 'MASK');
    } else assert.equal(gltf.images, undefined, 'distant trees reuse near-tree maps');
    const triangles = gltf.meshes.flatMap(mesh => mesh.primitives).reduce((sum, primitive) => sum + gltf.accessors[primitive.indices].count / 3, 0);
    assert.equal(triangles, asset.triangles); counts.push(triangles);
  }
  assert.deepEqual(materials, ['branches,leaves', 'branches,leaves', 'branches,leaves']);
  assert.ok(counts[0] > counts[1] && counts[1] > counts[2]);
  assert.ok(counts[0] < 35000 && counts[1] < 24000 && counts[2] < 14000);
  assert.ok(manifest.derivatives.reduce((sum, asset) => sum + asset.bytes, 0) < 4e6);
});

test('tree shadow proxies appear only for shadow casting inside the sun frustum', () => {
  const sun = new THREE.DirectionalLight(); sun.position.set(0, 100, 0); sun.target.position.set(0, 0, 0);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 300 });
  sun.shadow.camera.updateProjectionMatrix(); sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  const proxy = at => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(4), new THREE.MeshBasicMaterial()); mesh.position.set(at, 0, 0); mesh.updateMatrixWorld(); mesh.visible = false; return mesh; };
  const near = proxy(10), far = proxy(400);
  const shadows = castShadowsFromProxies(sun, () => [near, far]);
  sun.shadow.updateMatrices(sun);
  assert.equal(near.visible, true, 'drawn into the shadow map this frame');
  assert.equal(far.visible, false, 'culled proxies stay hidden, so they cannot leak into the view');
  shadows.hide();
  assert.equal(near.visible, false, 'the beauty pass never sees a proxy');
});
