import { ENCOUNTER_FAR } from './encounter.js';

export function withinTalkingReach(local, pose, canSee) {
  if (!local || local.abducted || !pose || (local.storeId ?? null) !== pose.roomId || pose.altitude > 2.5) return false;
  return Math.hypot(local.position[0] - pose.position[0], local.position[1] + pose.position[2]) <= ENCOUNTER_FAR
    && Math.abs(local.position[2] - pose.ground) < 4 && canSee(local.position);
}

function visibleMeshes(roots) {
  const meshes = [];
  for (const root of roots) {
    let visible = true;
    for (let item = root; item; item = item.parent) if (!item.visible) visible = false;
    if (!visible) continue;
    root.updateWorldMatrix(true, true);
    root.traverseVisible(item => {
      if (!item.isMesh) return;
      // Skinning moves limbs outside the previous pose's bounds (including seats).
      if (item.isSkinnedMesh) {
        item.computeBoundingSphere();
        if(item.boundingBox!==null)item.computeBoundingBox();
      }
      meshes.push(item);
    });
  }
  return meshes;
}

export function pickPerson(raycaster, people, occluders, canMeet) {
  const person = raycaster.intersectObjects(visibleMeshes(people), false)
    .find(hit => hit.object.userData.localId);
  if (!person || !canMeet(person.object.userData.localId)) return null;
  const previousFar = raycaster.far;
  raycaster.far = person.distance - 0.02;
  try {
    const blocked = raycaster.intersectObjects(visibleMeshes(occluders), false).some(hit => {
      const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object.material;
      return material.visible && (!material.transparent || material.opacity >= 0.5);
    });
    return blocked ? null : person.object.userData.localId;
  } finally { raycaster.far = previousFar; }
}
