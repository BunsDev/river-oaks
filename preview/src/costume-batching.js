import { Matrix4, Mesh } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Accessories attached to the same bone move together. Bake their local
// transforms into one mesh per material to keep detailed crowns and wands cheap.
export function batchCostumeAttachments(attachments, owned, eligible = () => true) {
  for (const { group } of attachments) {
    const batches = new Map();
    for (const mesh of group.children) {
      if (!mesh.isMesh || mesh.userData.deformableCostume || !eligible(mesh)) continue;
      if (!batches.has(mesh.material)) batches.set(mesh.material, []);
      batches.get(mesh.material).push(mesh);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(mesh => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return geometry.applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(parts);
      parts.forEach(part => part.dispose());
      if (!geometry) continue;
      owned.add(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      for (const source of meshes) {
        source.removeFromParent();
        if (owned.delete(source.geometry)) source.geometry.dispose();
      }
      group.add(mesh);
    }
  }
}

// A rigid piece built from nested groups (a flower, an earring): bake every mesh under `root`
// into one direct child per material and shadow role. batchCostumeAttachments only sees a bone
// group's direct children, so these would otherwise draw per petal in every pass.
export function bakeRigidParts(root, owned) {
  root.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(root.matrixWorld).invert(), batches = new Map();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  });
  const sources = new Set(), baked = [];
  for (const meshes of batches.values()) {
    const parts = meshes.map(mesh => {
      sources.add(mesh.geometry);
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return geometry.applyMatrix4(new Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
    });
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    if (!geometry) throw new Error(`Could not bake ${root.name}`);
    owned.add(geometry);
    const mesh = new Mesh(geometry, meshes[0].material);
    mesh.castShadow = meshes[0].castShadow; mesh.receiveShadow = meshes[0].receiveShadow;
    baked.push(mesh);
  }
  root.clear();
  root.add(...baked);
  for (const geometry of sources) if (owned.delete(geometry)) geometry.dispose();
}
