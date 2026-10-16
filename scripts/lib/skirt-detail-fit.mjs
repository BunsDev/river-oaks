import * as THREE from 'three';

// Transfer a cloth corrective to its decorative trim in the shared body bind
// space. Only the offline baker searches triangles; runtime uses GPU morphs.
export function bakeSkirtDetail(skirt, rest, detail, {maximumOffset = .04} = {}) {
  const geometry = detail.geometry, cloth = skirt.geometry;
  const sourcePositions = Array.from(geometry.attributes.position.array);
  const sourceWeights = Array.from(geometry.attributes.skinWeight.array);
  const normals = geometry.attributes.normal.array.slice(), fittedWeights = [], positionDelta = [];
  const point = new THREE.Vector3(), closest = new THREE.Vector3(), bary = new THREE.Vector3();
  const triangle = new THREE.Triangle(), best = new THREE.Vector3();
  let maximumDistance = 0;
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    point.fromBufferAttribute(geometry.attributes.position, i);
    let distance = Infinity, indices;
    for (let n = 0; n < cloth.index.count; n += 3) {
      const ids = [0, 1, 2].map(c => cloth.index.getX(n + c));
      [triangle.a, triangle.b, triangle.c].forEach((v, c) => v.fromArray(rest, ids[c] * 3));
      triangle.closestPointToPoint(point, closest);
      const candidate = point.distanceToSquared(closest);
      if (candidate < distance) {
        distance = candidate; indices = ids;
        triangle.getBarycoord(closest, bary); best.copy(bary);
      }
    }
    maximumDistance = Math.max(maximumDistance, Math.sqrt(distance));
    // Closest-point barycentrics can stray just below zero at triangle edges.
    // Keep interpolated GPU weights in the valid range with a unit sum.
    const weights = Array.from({length:4}, (_, c) => Math.max(0, Math.min(1,
      indices.reduce((sum, id, j) => sum + best.getComponent(j) * cloth.attributes.skinWeight.getComponent(id, c), 0))));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (!Number.isFinite(total) || total === 0) throw new Error('Invalid garment attachment weights');
    fittedWeights.push(...weights.map(weight => weight / total));
    for (let c = 0; c < 3; c++) {
      const delta = indices.reduce((sum, id, j) => sum + best.getComponent(j) * (cloth.attributes.position.getComponent(id, c) - rest[id * 3 + c]), 0);
      positionDelta.push(Math.fround(delta));
      geometry.attributes.position.setComponent(i, c, sourcePositions[i * 3 + c] + delta);
    }
  }
  if (maximumDistance > maximumOffset) throw new Error(`Trim is too far from its garment: ${maximumDistance}`);
  geometry.computeVertexNormals();
  return {data: {version: 1, subdivide: false, sourcePositions, sourceWeights, fittedWeights,
    positionDelta, normalDelta: Array.from(geometry.attributes.normal.array, (value, i) => Math.fround(value - normals[i]))}, maximumDistance};
}
