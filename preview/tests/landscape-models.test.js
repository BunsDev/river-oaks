import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { matureTreePlacements } from '../src/landscape-models.js';
import { terrainHeight } from '../src/geometry.js';

const read = path => readFileSync(new URL(path, import.meta.url));
const world = JSON.parse(read('../public/data/district.json'));
world.vegetation = JSON.parse(read('../public/data/district-vegetation.json'));

test('mature crowns retain every existing stem and leave source layout untouched', () => {
  const before = structuredClone(world);
  const placements = matureTreePlacements(world);
  assert.equal(placements.length, 230);
  placements.forEach((tree, index) => {
    const [east, north] = world.vegetation.branch_supports[index].position;
    assert.deepEqual(tree.position, [east, terrainHeight(world.terrain, east, north), -north]);
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
  const counts = [];
  for (const asset of manifest.derivatives) {
    const bytes = read(`../public${asset.path}`);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.ok(gltf.images.every(image => image.bufferView !== undefined), 'no runtime texture downloads');
    assert.ok(gltf.materials.every(material => material.pbrMetallicRoughness.baseColorTexture && material.normalTexture), 'retain color and normal detail');
    const triangles = gltf.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((total, primitive) => total + gltf.accessors[primitive.indices].count / 3, 0), 0);
    if (asset.path.includes('shade-tree')) counts.push(triangles);
  }
  assert.equal(manifest.derivatives.length, 5);
  assert.equal(counts.length, 3);
  assert.ok(counts[0] < 110000 && counts[1] < 26000 && counts[2] < 7000);
  assert.ok(counts[0] > counts[1] && counts[1] > counts[2]);
});
