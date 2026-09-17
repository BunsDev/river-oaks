import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { houseParts, architecturalGeometries, partMatrix, buildBuildings } from '../src/buildings.js';

const styles = ['tudor_revival', 'georgian_colonial', 'french_eclectic', 'modern_estate'];
const building = (style, size = [18, 14, 9]) => ({ id: `test-${style}`, center: [100, 200, 12], size, yaw_deg: 90, style });

test('styles have their own roof structure and architectural detail', () => {
  const parts = Object.fromEntries(styles.map((style) => [style, houseParts(building(style))]));
  assert.ok(parts.tudor_revival.some((part) => part.role === 'timber'));
  assert.ok(parts.tudor_revival.some((part) => part.geometry === 'gableRoof'));
  assert.ok(parts.georgian_colonial.some((part) => part.geometry === 'hipRoof'));
  assert.ok(parts.georgian_colonial.some((part) => part.role === 'entrance'));
  assert.ok(parts.french_eclectic.some((part) => part.geometry === 'mansardRoof'));
  assert.ok(parts.french_eclectic.some((part) => part.role === 'dormer'));
  assert.ok(parts.modern_estate.some((part) => part.role === 'parapet'));
  assert.ok(styles.every((style) => parts[style].some((part) => part.role === 'glass')));
});

test('all roof and facade vertices stay inside the original footprint, including small houses', () => {
  const geometries = architecturalGeometries();
  for (const style of styles) {
    for (const size of [[18, 14, 9], [5, 5, 7], [28, 20, 11]]) {
      const home = building(style, size);
      const parts = houseParts(home);
      assert.ok(parts.length > 10);
      for (const part of parts) {
        const vertices = geometries[part.geometry].getAttribute('position');
        const matrix = partMatrix({ ...home, center: [0, 0, 0], yaw_deg: 0 }, part);
        for (let index = 0; index < vertices.count; index += 1) {
          const point = new Vector3().fromBufferAttribute(vertices, index).applyMatrix4(matrix);
          assert.ok(Math.abs(point.x) <= size[0] / 2 + 1e-5, `${style} ${part.role}: east/west bounds`);
          assert.ok(Math.abs(point.z) <= size[1] / 2 + 1e-5, `${style} ${part.role}: north/south bounds`);
          assert.ok(point.y >= -1e-5 && point.y <= size[2] + 1e-5, `${style} ${part.role}: height bounds`);
        }
      }
    }
  }
  Object.values(geometries).forEach((geometry) => geometry.dispose());
});

test('positive source yaw rotates local east toward north while preserving absolute ground elevation', () => {
  const home = building('modern_estate');
  const part = { position: [3, 2, 0], size: [1, 1, 1], rotation: [0, 0, 0] };
  const matrix = partMatrix(home, part);
  assert.ok(matrix);
  const center = new Vector3().applyMatrix4(matrix);
  assert.ok(Math.abs(center.x - 100) < 1e-8);
  assert.ok(Math.abs(center.y - 14) < 1e-8);
  assert.ok(Math.abs(center.z + 203) < 1e-8);
});

test('instanced batches map picked parts to the source building and do not grow draw calls per house', () => {
  const data = { buildings: styles.flatMap((style) => [building(style), building(style)]) };
  const group = buildBuildings(data);
  assert.ok(group?.isGroup);
  assert.ok(group.children.length <= 32, `Expected at most32 shared batches, got${group.children.length}`);
  const seen = new Set();
  for (const mesh of group.children) {
    assert.ok(mesh.isInstancedMesh);
    assert.equal(mesh.count, mesh.userData.buildingIndices.length);
    for (const index of mesh.userData.buildingIndices) seen.add(index);
  }
  assert.equal(seen.size, data.buildings.length);
  group.userData.dispose();
});
