import test from 'node:test';
import assert from 'node:assert/strict';
import { canopyGeometry } from '../src/canopy.js';

function projectedArea(geometry) {
  const points = geometry.getAttribute('position');
  let area = 0;
  for (let i = 0; i < (points?.count ?? 0); i += 3) {
    const a = [points.getX(i), points.getZ(i)];
    const b = [points.getX(i + 1), points.getZ(i + 1)];
    const c = [points.getX(i + 2), points.getZ(i + 2)];
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }
  return area;
}

test('historical canopy mesh preserves hole area and maps north to scene south', () => {
  const geometry = canopyGeometry({ type: 'Polygon', coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
  ] }, null);
  assert.equal(projectedArea(geometry), 84);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i += 1) {
    assert.ok(positions.getZ(i) <= 0);
    assert.ok(Math.abs(positions.getY(i) - 0.2) < 1e-6);
  }
});

test('separate canopy polygons retain their combined footprint', () => {
  const geometry = canopyGeometry({ type: 'MultiPolygon', coordinates: [
    [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    [[[20, 0], [23, 0], [23, 3], [20, 3], [20, 0]]],
  ] }, null);
  assert.equal(projectedArea(geometry), 109);
});
