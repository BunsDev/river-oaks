import * as THREE from 'three';

// Original ornament layered over the mapped district. No additional walk obstacles:
// arches hug facades, while lanterns hang above pedestrian head height.
export function buildDistrictFantasy(world) {
  const group = new THREE.Group();
  group.name = 'Imagined district details';
  const silver = new THREE.MeshStandardMaterial({ color: '#d8d5e1', metalness: 0.7, roughness: 0.32 });
  // Facade jewels are a few hand-spans across. Refraction made three redraw the
  // whole opaque district into a transmission buffer every frame they were on
  // screen; a pearly thin film and a faint inner glow read the same at street scale.
  const pearl = new THREE.MeshPhysicalMaterial({ color: '#f7edf5', metalness: 0, roughness: 0.08, ior: 1.46, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.5, sheen: 0.4, sheenColor: '#e2a1c9', emissive: '#e2a1c9', emissiveIntensity: 0.06 });
  const glow = new THREE.MeshStandardMaterial({ color: '#f7e8f1', emissive: '#e2a1c9', emissiveIntensity: 2.4, roughness: 0.35 });
  const colors = ['#ad267e', '#e2a1c9', '#ca78ad', '#392b38'];
  const enamels = colors.map(color => new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.38 }));
  const graphite = new THREE.MeshStandardMaterial({ color: '#36343d', metalness: 0.45, roughness: 0.38 });
  const timber = new THREE.MeshStandardMaterial({ color: '#665044', roughness: 0.76 });
  const porcelain = new THREE.MeshPhysicalMaterial({ color: '#ede9e5', roughness: 0.35, clearcoat: 0.4 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const arch = new THREE.TorusGeometry(2.65, 0.055, 6, 32, Math.PI);
  const jewel = new THREE.OctahedronGeometry(1);
  const ring = new THREE.TorusGeometry(0.53, 0.028, 6, 24);
  const batches = new Map();
  const add = (geometry, material, position, scale, yaw, storeId) => {
    const key = `${geometry.uuid}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry, material, parts: [] });
    batches.get(key).parts.push({ position, scale, yaw, storeId });
  };
  world.stores.forEach((store, index) => {
    const [x, north, base] = store.facade, [nx, ny] = store.outward;
    const yaw = Math.atan2(nx, -ny), enamel = enamels[index % enamels.length];
    const at = (across, height, depth = 0.55) => [x - ny * across + nx * depth, base + height, -north - nx * across - ny * depth];
    const dining = ['restaurant','ice_cream'].includes(store.category);
    const jewelry = ['jewelry','fashion_accessories'].includes(store.category);
    const wellness = ['perfumery','wellness','hairdresser','optician'].includes(store.category);
    if (dining) {
      // A timber pergola and fine light rail give dining its own evening address.
      add(box, graphite, at(0,5.5,0.34), [6.6,0.14,0.45], yaw, store.id);
      for (let slat=0;slat<13;slat++) add(box,timber,at((slat-6)*0.49,5.4,0.8),[0.12,0.15,1.5],yaw,store.id);
      add(box,glow,at(0,5.32,1.5),[6.1,0.025,0.025],yaw,store.id);
    } else if (jewelry) {
      // Dark brushed-metal portal with inset champagne light; no giant badge.
      add(box,graphite,at(0,5.72,0.32),[6.7,0.16,0.46],yaw,store.id);
      add(box,silver,at(0,5.62,0.52),[6.4,0.03,0.025],yaw,store.id);
      for (const side of [-1,1]) {
        add(box,graphite,at(side*3.25,3.0,0.3),[0.25,5.6,0.4],yaw,store.id);
        add(box,glow,at(side*3.10,3.1,0.53),[0.018,4.9,0.025],yaw,store.id);
      }
      for (let flute=-7;flute<=7;flute++) add(box,silver,at(flute*0.34,5.4,0.27),[0.018,0.42,0.1],yaw,store.id);
    } else if (wellness) {
      // Satin ceramic fins above the sign, with a subtle asymmetric pink inset.
      for (let fin=-8;fin<=8;fin++) add(box,porcelain,at(fin*0.38,5.5,0.3),[0.10,0.6,0.26],yaw,store.id);
      add(box,enamel,at(2.9,2.55,0.27),[0.14,4.6,0.12],yaw,store.id);
      add(box,glow,at(2.78,2.55,0.34),[0.018,4.4,0.025],yaw,store.id);
    } else {
      // Fashion retains the signature halo, with slimmer ceramic piers.
      add(arch,silver,at(0,4.9),[1.12,0.5,1],yaw,store.id);
      add(jewel,pearl,at(0,5.85,0.58),[0.22,0.34,0.15],yaw,store.id);
      add(jewel,glow,at(0,5.85,0.5),[0.025,0.17,0.025],yaw,store.id);
      for(const side of [-1,1]) {
        add(box,porcelain,at(side*2.96,2.7,0.28),[0.16,4.4,0.2],yaw,store.id);
        add(box,enamel,at(side*2.96,2.7,0.39),[0.035,4.25,0.025],yaw,store.id);
      }
    }
    // A restrained pair of glass pendants links the architectural families.
    for (const side of [-1,1]) {
      const across = side*(jewelry?3.25:2.65);
      add(box,silver,at(across,4.35,0.8),[0.035,0.035,0.85],yaw,store.id);
      add(box,silver,at(across,4.05,1.18),[0.016,0.60,0.016],yaw,store.id);
      add(ring,silver,at(across,3.45,1.18),[0.58,0.85,0.7],yaw,store.id);
      add(jewel,pearl,at(across,3.45,1.18),[0.13,0.31,0.13],yaw,store.id);
      add(jewel,glow,at(across,3.45,1.18),[0.027,0.20,0.027],yaw,store.id);
    }
  });
  const dummy = new THREE.Object3D();
  for (const { geometry, material, parts } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.userData.storeIds = parts.map(part => part.storeId);
    parts.forEach((part, index) => {
      dummy.position.fromArray(part.position);
      dummy.scale.fromArray(part.scale);
      dummy.rotation.set(0, part.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.castShadow = material !== glow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
