import * as THREE from 'three';
import { programSignature } from './draw-census.js';

// three draws every shadow caster without a customDepthMaterial through one
// shared depth material, in unsorted scene order. Whenever the next caster is
// a different kind of object (skinned or rigid, morph count, instanced), three
// re-derives that material's program. One depth material per kind keeps each
// material on a single program. Materials that need their own depth variant
// (alpha cutouts, clipping, displacement, any alphaTest) keep three's path.
const depthMaterials = new Map();

function plainDepth(material) {
  return !(material.clipShadows && material.clippingPlanes?.length) && !(material.displacementMap && material.displacementScale !== 0)
    && !(material.alphaTest > 0) && !material.alphaToCoverage;
}

export function shadowDepthFor(mesh) {
  const signature = programSignature(mesh, mesh.geometry);
  let depth = depthMaterials.get(signature);
  if (!depth) depthMaterials.set(signature, depth = new THREE.MeshDepthMaterial());
  return depth;
}

// Gives each eligible shadow caster under root the depth material of its kind.
// Returns the meshes changed, for setShadowDepth.
export function assignShadowDepth(root) {
  const assigned = [];
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.castShadow || mesh.customDepthMaterial) return;
    if (!(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(plainDepth)) return;
    mesh.customDepthMaterial = shadowDepthFor(mesh); assigned.push(mesh);
  });
  return assigned;
}

// Development audit only: compare frames with three's shared depth material.
export function setShadowDepth(meshes, enabled) {
  for (const mesh of meshes) mesh.customDepthMaterial = enabled ? shadowDepthFor(mesh) : undefined;
}
