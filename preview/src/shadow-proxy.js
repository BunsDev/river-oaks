import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Sun-shadow proxies (#289): the shadow pass needs only positions, so a rigid
// group's casters can draw as one mesh of their own triangles. A proxy stays
// hidden except while the sun draws its map (castShadowsFromProxies in
// landscape-models.js shows it; onAfterShadow hides it again).

// The meshes' triangles in root's frame, positions only. Copies: the meshes
// keep drawing their own buffers.
export function shadowProxyGeometry(meshes, root) {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const parts = meshes.map(mesh => {
    let geometry = new THREE.BufferGeometry().setAttribute('position', mesh.geometry.getAttribute('position').clone());
    if (mesh.geometry.index) { geometry.setIndex(mesh.geometry.index); const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    return geometry.applyMatrix4(toRoot.clone().multiply(mesh.matrixWorld));
  });
  const merged = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  return merged;
}

// A material three draws into the sun's map with its plain depth material, front-sided
// (three's WebGLShadowMap getDepthMaterial: no cutout, clipping, displacement or
// wireframe variant). Casters with such materials draw identical depth whatever
// their finish, so a proxy of their triangles reproduces them exactly.
export function plainDepthMaterial(material) {
  return Boolean(material) && !Array.isArray(material) && material.visible && !material.wireframe
    && material.side === THREE.FrontSide && material.shadowSide == null && !(material.alphaTest > 0) && !material.alphaToCoverage
    && !(material.displacementMap && material.displacementScale !== 0) && !(material.clipShadows && material.clippingPlanes?.length);
}

// Casters a front-sided proxy reproduces exactly. Anything else keeps casting itself.
function plainFrontCaster(mesh) {
  return mesh.isMesh && !mesh.isInstancedMesh && !mesh.isSkinnedMesh && mesh.castShadow && mesh.visible && !mesh.customDepthMaterial
    && plainDepthMaterial(mesh.material) && !Object.keys(mesh.geometry.morphAttributes ?? {}).length;
}

export function rigidCasters(root, include = () => true) {
  const found = [];
  root.traverse(mesh => { if (plainFrontCaster(mesh) && include(mesh)) found.push(mesh); });
  return found;
}

export function hideAfterShadow() { this.visible = false; }

// A hidden caster; front-sided like the casters it replaces, so three picks the same shadow side.
export function shadowProxyMesh(geometry, count) {
  const material = new THREE.MeshBasicMaterial();
  const proxy = count === undefined ? new THREE.Mesh(geometry, material) : new THREE.InstancedMesh(geometry, material, count);
  proxy.castShadow = true; proxy.receiveShadow = false; proxy.visible = false;
  proxy.onAfterShadow = hideAfterShadow;
  return proxy;
}
