import * as THREE from 'three';
import { IPIC_INTERIOR } from './ipic-plan.js';

const view = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const corners = Array.from({ length: 4 }, () => new THREE.Vector3());

// True when the room's full-width plane at depth d, between two heights, is out of view.
function planeOutOfView(camera, room, d, bottom, top) {
  const left = room.toWorld(room.aMin, d), right = room.toWorld(room.aMax, d);
  corners[0].set(left[0], bottom, -left[1]);
  corners[1].set(right[0], bottom, -right[1]);
  corners[2].set(left[0], top, -left[1]);
  corners[3].set(right[0], top, -right[1]);
  camera.updateMatrixWorld();
  view.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  // A convex plane outside any one frustum plane cannot contribute pixels.
  // This avoids the broad world-axis box of a rotated facade crossing the view.
  return view.planes.some(plane => corners.every(corner => plane.distanceToPoint(corner) < -0.15));
}

// Generated rooms currently have an open glazed frontage and opaque side/back
// walls. Keep the district whenever any part of that frontage could be seen.
export function canCullExterior(camera, room) {
  // An approved furnished space (#420) is glazed on more than its frontage: keep the street.
  if (!room?.generatedPlan || room.approvedSpace || !room.contains(camera.position.x, -camera.position.z)) return false;
  if (camera.position.y < room.floor - 0.2 || camera.position.y > room.floor + room.height + 0.2) return false;
  return planeOutOfView(camera, room, 0, room.floor, room.floor + room.height);
}

// IPIC's auditorium is closed except for its back partition: the cinema wall at
// d = 26, 6 m above the street floor, with the doorway (ipic-plan.js). The rest of
// IPIC is not: the frontage, the gap between the escalator lanes, the Tuck Room
// window and a sun shadow in the lounge all show the district. So the district is
// dropped only while the camera is inside the auditorium and that whole plane, to
// the room's top, is out of view (#428).
export const IPIC_AUDITORIUM = Object.freeze({ back: 26, base: 6 });
export function canCullIpicAuditorium(camera, room) {
  if (room?.interior !== IPIC_INTERIOR) return false;
  const [a, d] = room.toLocal(camera.position.x, -camera.position.z);
  const bottom = room.floor + IPIC_AUDITORIUM.base, top = room.floor + room.height;
  if (a <= room.aMin || a >= room.aMax || d <= IPIC_AUDITORIUM.back + 0.05 || d >= room.depth) return false;
  if (camera.position.y < bottom || camera.position.y > top) return false;
  return planeOutOfView(camera, room, IPIC_AUDITORIUM.back, bottom, top);
}

// Visibility is scoped to one render. Layer toggles, shadows, and the next
// camera pose keep their original visibility even if rendering throws.
export function renderWithoutExterior(worldGroup, interiorsLayer, render) {
  return renderOnly(worldGroup, [interiorsLayer], render);
}

// Hides everything under root except the kept objects, for one render: a branch
// holding a kept object is opened, and any other visible branch is hidden whole.
export function renderOnly(root, keep, render) {
  const hidden = [];
  const holds = (node, item) => { for (let at = item; at; at = at.parent) if (at === node) return true; return false; };
  const visit = node => {
    for (const child of node.children) {
      if (!child.visible || keep.includes(child)) continue;
      if (keep.some(item => holds(child, item))) visit(child);
      else { child.visible = false; hidden.push(child); }
    }
  };
  try {
    visit(root);
    return render();
  } finally {
    for (const child of hidden) child.visible = true;
  }
}
