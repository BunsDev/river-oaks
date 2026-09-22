import * as THREE from 'three';

export function thinStorefrontGlass() {
  // A thin-sheet approximation: reflect the environment at Schlick's ratio and
  // alpha-blend the actual room behind it. No full-scene refraction render pass.
  const material = new THREE.MeshStandardMaterial({ color: '#edf5f3', metalness: 1, roughness: 0.055, transparent: true, depthWrite: false, envMapIntensity: 1 });
  material.userData.thinStorefrontGlass = true;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float roFacing = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
      diffuseColor.a = 0.04 + 0.96 * pow(1.0 - roFacing, 5.0);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'river-oaks-thin-glass-v1';
  return material;
}

export function displayRoomSurface({ floor = false } = {}) {
  const size = 128, ao = new Uint8Array(size * size * 4), glow = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size, i = (y * size + x) * 4;
    const side = Math.exp(-Math.min(u, 1 - u) * 18), edge = Math.exp(-Math.min(v, 1 - v) * 18);
    const occlusion = Math.max(0.12, (floor ? 0.65 : 0.52) - 0.22 * side - 0.19 * edge);
    // An authored soft display-light pool, kept separate from material albedo.
    const pool = Math.exp(-((u - 0.5) ** 2 * 7 + (v - (floor ? 0.5 : 0.78)) ** 2 * 4));
    ao.set([occlusion * 255, 255, 255, 255], i);
    glow.set([pool * 255, pool * 220, pool * 172, 255], i);
  }
  const texture = data => {
    const map = new THREE.DataTexture(data, size, size); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
  };
  const material = new THREE.MeshStandardMaterial({
    color: floor ? '#918778' : '#bdb19c', roughness: floor ? 0.45 : 0.88,
    aoMap: texture(ao), aoMapIntensity: 1,
    emissive: '#ffdeb0', emissiveIntensity: floor ? 0.09 : 0.18, emissiveMap: texture(glow),
  });
  return material;
}
