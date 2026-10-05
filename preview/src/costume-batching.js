import { Mesh } from 'three';
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
