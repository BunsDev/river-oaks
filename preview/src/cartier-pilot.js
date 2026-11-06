import * as THREE from 'three';

// An authored entrance/display finish pilot, not a surveyed Cartier interior.
// Match the mapped tenant identity rather than its mutable display label.
export function isCartierRoom(room) {
  return room?.storeId === 'osm-node-8172494965' && room.theme === 'jewelry' && !room.generatedPlan;
}

export function brassRoughnessPixels() {
  const width = 128, height = 128, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // Integer arithmetic gives stable horizontal brushing without random state.
    const grain = ((Math.imul(y + 1, 1103515245) >>> 16) & 63);
    const value = 162 + grain + (x % 5), i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
  }
  return { data, width, height };
}

export function createCartierFinishes(track) {
  const { data, width, height } = brassRoughnessPixels();
  const roughness = track.t(new THREE.DataTexture(data, width, height, THREE.RGBAFormat));
  roughness.name = 'cartier-brushed-roughness';
  roughness.wrapS = roughness.wrapT = THREE.RepeatWrapping;
  roughness.colorSpace = THREE.NoColorSpace;
  roughness.needsUpdate = true;
  const standard = (name, options) => {
    const material = track.m(new THREE.MeshStandardMaterial({ envMapIntensity: 0.45, ...options }));
    material.name = `cartier-${name}`; return material;
  };
  return {
    brass: standard('brass', { color: '#c5a471', metalness: 0.88, roughness: 0.5, roughnessMap: roughness }),
    lacquer: standard('lacquer', { color: '#58212c', roughness: 0.28, metalness: 0.08 }),
    velvet: standard('velvet', { color: '#6b2436', roughness: 0.96 }),
    stone: standard('stone', { color: '#e6d9bf', roughness: 0.42 }),
    wall: standard('wall', { color: '#eee3d0', roughness: 0.88, emissive: '#e3cbae', emissiveIntensity: 0.12 }),
    glass: (() => {
      const material = track.m(new THREE.MeshPhysicalMaterial({ color: '#ecf2ef', transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.4 }));
      material.name = 'cartier-glass'; return material;
    })(),
  };
}
