import { Path, Shape, ShapeGeometry, Vector2 } from 'three';
import { terrainHeight } from './geometry.js';

export function canopyGeometry(geometry, terrain) {
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  const shapes = polygons.map(([outer, ...holes]) => {
    const shape = new Shape(outer.map(([x, y]) => new Vector2(x, y)));
    shape.holes = holes.map((ring) => new Path(ring.map(([x, y]) => new Vector2(x, y))));
    return shape;
  });
  const source = new ShapeGeometry(shapes);
  const result = source.toNonIndexed();
  source.dispose();
  const positions = result.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const east = positions.getX(index), north = positions.getY(index);
    positions.setXYZ(index, east, terrainHeight(terrain, east, north) + 0.2, -north);
  }
  result.computeVertexNormals();
  return result;
}
