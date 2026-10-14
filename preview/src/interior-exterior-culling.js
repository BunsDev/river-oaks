import * as THREE from 'three';

const view = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const corners = Array.from({ length: 4 }, () => new THREE.Vector3());

// Generated rooms currently have an open glazed frontage and opaque side/back
// walls. Keep the district whenever any part of that frontage could be seen.
export function canCullExterior(camera, room) {
  if (!room?.generatedPlan || !room.contains(camera.position.x, -camera.position.z)) return false;
  if (camera.position.y < room.floor - 0.2 || camera.position.y > room.floor + room.height + 0.2) return false;
  const left = room.toWorld(room.aMin, 0), right = room.toWorld(room.aMax, 0);
  corners[0].set(left[0], room.floor, -left[1]);
  corners[1].set(right[0], room.floor, -right[1]);
  corners[2].set(left[0], room.floor + room.height, -left[1]);
  corners[3].set(right[0], room.floor + room.height, -right[1]);
  camera.updateMatrixWorld();
  view.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  // A convex frontage outside any one frustum plane cannot contribute pixels.
  // This avoids the broad world-axis box of a rotated facade crossing the view.
  return view.planes.some(plane => corners.every(corner => plane.distanceToPoint(corner) < -0.15));
}

// Visibility is scoped to one render. Layer toggles, shadows, and the next
// camera pose keep their original visibility even if rendering throws.
export function renderWithoutExterior(worldGroup, interiorsLayer, render) {
  const outside = worldGroup.children.filter(child => child !== interiorsLayer);
  const visible = outside.map(child => child.visible);
  try {
    for (const child of outside) child.visible = false;
    return render();
  } finally {
    outside.forEach((child, index) => { child.visible = visible[index]; });
  }
}
