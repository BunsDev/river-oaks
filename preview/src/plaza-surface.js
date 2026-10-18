import * as THREE from 'three';
import { paverSurface } from './materials.js';
import { STREET } from './street-profile.js';

// The plaza paving visitors stand on outdoors, STREET.plazaOffset above the terrain
// grid. main.js draws it and registers it as walking ground (world-surface.js), so
// tests can compare the same triangles with the server's ground.
export function buildPlazaSurface(data) {
  const terrain = data.terrain;
  let surface;
  if (terrain) {
    const positions = [], indices = [], uvs = [];
    for (let row = 0; row < terrain.height; row += 1) {
      for (let column = 0; column < terrain.width; column += 1) {
        const x = terrain.grid_origin_m[0] + column * terrain.spacing_m[0];
        const y = terrain.grid_origin_m[1] + row * terrain.spacing_m[1];
        positions.push(x, terrain.heights_m[row * terrain.width + column], -y);
        uvs.push(x, -y);
        if (row < terrain.height - 1 && column < terrain.width - 1) {
          const a = row * terrain.width + column, b = a + 1, c = a + terrain.width, d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    surface = new THREE.Mesh(geometry, paverSurface());
    surface.position.y = STREET.plazaOffset;
  } else {
    const [west, south, east, north] = data.bounds_m;
    surface = new THREE.Mesh(new THREE.PlaneGeometry(east - west, north - south), paverSurface());
    surface.rotation.x = -Math.PI / 2;
    surface.position.set((east + west) / 2, 0, -(north + south) / 2);
  }
  surface.receiveShadow = true;
  return surface;
}
