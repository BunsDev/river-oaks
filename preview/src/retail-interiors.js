import * as THREE from 'three';

// Original generated back-wall artwork augments real 3D alcoves and displays.
export function createRetailInteriors() {
  const textures = [];
  let disposed = false;
  const quadrants = [[0,0.5], [0.5,0.5], [0,0], [0.5,0]];
  const materials = quadrants.map(() => new THREE.MeshStandardMaterial({ color: '#c5b8aa', roughness: 0.9, emissive: '#fff0e1', emissiveIntensity: 0.3 }));
  const atlas = new THREE.TextureLoader().load('/assets/interiors/retail-atlas.png', loaded => {
    if (disposed) { loaded.dispose(); return; }
    loaded.colorSpace = THREE.SRGBColorSpace;
    const inset = 2 / loaded.image.width;
    quadrants.forEach(([x,y], index) => {
      // Attach only loaded textures: cloning pending textures marks empty image
      // data for upload on every frame until the network request finishes.
      const map = loaded.clone(); map.offset.set(x+inset,y+inset); map.repeat.set(0.5-inset*2,0.5-inset*2); textures.push(map);
      materials[index].color.set('#ffffff'); materials[index].map = map; materials[index].emissiveMap = map; materials[index].needsUpdate = true;
    });
  });
  textures.push(atlas);
  return {
    materials, textures,
    dispose() { disposed = true; textures.forEach(texture => texture.dispose()); },
    forCategory(category) {
      return materials[['jewelry','fashion_accessories'].includes(category) ? 1 : ['restaurant','ice_cream'].includes(category) ? 2 : ['perfumery','wellness','hairdresser'].includes(category) ? 3 : 0];
    },
  };
}
