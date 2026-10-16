import * as THREE from 'three';

// Shared by the authored outfit and its offline garment-detail bake.
export function createVesperTrimGeometry() {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    [-.18, .015, .085], [-.10, -.035, .14], [.02, -.10, .151], [.16, -.16, .10],
  ].map(point => new THREE.Vector3(...point))), 32, .009, 7, false);
}
