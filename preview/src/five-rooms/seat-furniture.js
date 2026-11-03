import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEAT_CLUSTER_RULES, seatClusters } from '../seat-clusters.js';
import { relightShellMaterials, shellMaterials } from './shells.js';

// The benches of the seat clusters (#825 slice 4), in every finish, because a finish never changes
// where someone can sit. Two draw calls however many clusters: benches, and a low strip along each
// seat's front that lights at night under the pink rule, on a seat, which is a thing you can use.
const box = (width, height, depth, x, y, z, yaw) => {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  geometry.rotateY(yaw);
  return geometry;
};

export function buildSeatFurniture(world, { finish = 'classic', groundAt } = {}) {
  const clusters = seatClusters(world);
  if (!clusters.length) return null;
  const group = new THREE.Group(); group.name = 'Seat clusters';
  const materials = shellMaterials(finish), bench = [], glow = [], { across, height, depth, length } = SEAT_CLUSTER_RULES;
  for (const cluster of clusters) {
    const [x, north] = cluster.center, y = groundAt(x, north);
    // Scene frame: [east, height, -north]. Each bench is built around the cluster centre, then placed.
    for (const side of [-1, 1]) {
      const z = -side * across, parts = [
        box(length, 0.06, depth, 0, height - 0.03, z, cluster.yaw),
        box(length, 0.34, 0.05, 0, height + 0.18, z - side * (depth / 2 - 0.025), cluster.yaw),
        box(0.06, height - 0.06, depth - 0.06, -length / 2 + 0.08, (height - 0.06) / 2, z, cluster.yaw),
        box(0.06, height - 0.06, depth - 0.06, length / 2 - 0.08, (height - 0.06) / 2, z, cluster.yaw),
      ];
      const strip = box(length - 0.1, 0.025, 0.02, 0, height - 0.05, z + side * (depth / 2 + 0.01), cluster.yaw);
      for (const part of [...parts, strip]) part.translate(x, y, -north);
      bench.push(...parts); glow.push(strip);
    }
  }
  const add = (geometries, key, name) => {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), materials.get(key));
    mesh.name = name; mesh.castShadow = !materials.get(key).transparent; mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  };
  add(bench, 'ivory', 'Seat cluster benches');
  add(glow, 'glow-usable', 'Seat cluster strips');
  group.userData.seatClusters = clusters.map(cluster => cluster.id);
  group.userData.relight = atmosphere => relightShellMaterials(materials, atmosphere);
  group.userData.dispose = () => { group.traverse(item => item.geometry?.dispose()); materials.forEach(material => material.dispose()); };
  return group;
}
