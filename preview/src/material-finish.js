// Plain-colour materials that differ only in colour can share one material with
// the colour carried per instance. A finish is everything else that shapes the
// shading; materials with maps, glow, transparency or cutouts keep their own.
export function finishKey(material, special = new Set()) {
  if (!material?.isMeshStandardMaterial || material.isMeshPhysicalMaterial || special.has(material)) return null;
  if (material.map || material.emissiveMap || material.normalMap || material.roughnessMap || material.metalnessMap || material.aoMap || material.alphaMap) return null;
  if (material.transparent || material.alphaTest > 0 || material.vertexColors || material.userData?.breakableGlass) return null;
  if (material.emissive && material.emissive.getHex() !== 0 && material.emissiveIntensity > 0) return null;
  return [material.roughness, material.metalness, material.envMapIntensity, material.side, material.flatShading, material.depthWrite, material.polygonOffset, material.wireframe].join(':');
}
