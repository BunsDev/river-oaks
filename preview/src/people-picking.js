import { personPosition, personEyeHeight, personDistance } from './person-position.js';
import { Matrix3, Matrix4 } from 'three';
import { ENCOUNTER_FAR } from './encounter.js';

export function withinTalkingReach(local, pose, canSee) {
  if (!local || !pose || (local.storeId ?? null) !== pose.roomId) return false;
  return personDistance(local,[pose.position[0],-pose.position[2],pose.position[1]]) <= ENCOUNTER_FAR
    && canSee(personPosition(local),personEyeHeight(local));
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
  const person = raycaster.intersectObjects(visibleMeshes(people), false)[0];
  let owner=person?.object;
  while(owner&&!owner.userData.localId)owner=owner.parent;
  const id=owner?.userData.localId;
  if (!id || !canMeet(id)) return null;
  const previousFar = raycaster.far;
  raycaster.far = person.distance - 0.02;
  try {
    const blocked = raycaster.intersectObjects(visibleMeshes(occluders), false).some(hit => {
      const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object.material;
      if(!material.visible)return false;
      if(material.userData.thinStorefrontGlass){
        // Match the thin-sheet shader: its stored opacity is 1, while the actual
        // pane is clear head-on and reflective at grazing angles.
        const world=hit.object.matrixWorld.clone();
        if(hit.object.isInstancedMesh){const instance=new Matrix4();hit.object.getMatrixAt(hit.instanceId,instance);world.multiply(instance);}
        const normal=(hit.normal??hit.face.normal).clone().applyNormalMatrix(new Matrix3().getNormalMatrix(world));
        const facing=Math.min(1,Math.abs(normal.dot(raycaster.ray.direction)));
        return 0.04+0.96*(1-facing)**5>=0.5;
      }
      return !material.transparent || material.opacity >= 0.5;
    });
    return blocked ? null : id;
  } finally { raycaster.far = previousFar; }
}
