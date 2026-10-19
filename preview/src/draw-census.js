// Development audit only: attribute one frame's draws to a pass and an owner.
// The shadow map submits with a null scene; GTAO's geometry pass renders the
// main camera through scene.overrideMaterial. Owners are tagged ancestors.
export function drawPass({ camera, mainCamera, scene, material }) {
  if (scene === null) return 'shadow';
  if (camera !== mainCamera) return 'other';
  return scene?.overrideMaterial && material === scene.overrideMaterial ? 'occlusion' : 'main';
}

export function drawOwner(object) {
  for (let node = object; node; node = node.parent) if (node.userData?.renderAuditOwner) return node.userData.renderAuditOwner;
  return 'scene';
}

// Index (or vertex) count submitted for a triangle draw, times instances.
function submittedTriangles(geometry, object, group) {
  const count = group ? group.count : geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
  const range = Math.min(count, geometry.drawRange.count);
  return Math.floor(range / 3) * (object.isInstancedMesh ? object.count : 1);
}

// The object properties three compares against a material's current program.
// Drawing one material for objects that differ in these makes three re-derive
// its program (getProgram), even when the program is already cached.
export function programSignature(object, geometry) {
  const morphs = geometry.morphAttributes ?? {};
  return `${object.isSkinnedMesh ? 's' : ''}${object.isInstancedMesh ? 'i' : ''}${object.isBatchedMesh ? 'b' : ''}${object.instanceColor ? 'c' : ''}`
    + `${morphs.position?.length ?? 0}${morphs.normal ? 'n' : ''}${morphs.color ? 'k' : ''}`;
}

export function createDrawCensus(renderer, mainCamera) {
  const counts = {}, signatures = new Map();
  let original = null;
  return {
    begin() {
      if (original) return;
      original = renderer.renderBufferDirect;
      renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        const key = `${drawPass({ camera, mainCamera, scene, material })}:${drawOwner(object)}`;
        const bucket = counts[key] ??= { draws: 0, triangles: 0, switches: 0 };
        bucket.draws++;
        const signature = programSignature(object, geometry), previous = signatures.get(material);
        if (previous !== undefined && previous !== signature) bucket.switches++;
        signatures.set(material, signature);
        if (object.isMesh) bucket.triangles += submittedTriangles(geometry, object, group);
        return original.call(this, camera, scene, geometry, material, object, group);
      };
    },
    end() {
      if (!original) return counts;
      renderer.renderBufferDirect = original; original = null;
      return counts;
    },
  };
}
