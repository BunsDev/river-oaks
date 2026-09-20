import * as THREE from 'three';

// Original retail props, authored at human scale; no product replicas or logos.
export function buildRetailDisplays(displays) {
  const group = new THREE.Group(), batches = new Map();
  const textile = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.93 });
  const leather = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.42, clearcoat: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: '#c9b995', roughness: 0.23, metalness: 0.82 });
  const velvet = new THREE.MeshStandardMaterial({ color: '#302b31', roughness: 1 });
  const ceramic = new THREE.MeshStandardMaterial({ color: '#eee5dc', roughness: 0.28 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const handle = new THREE.TorusGeometry(0.105, 0.011, 6, 20, Math.PI);
  const necklace = new THREE.TorusGeometry(0.105, 0.005, 6, 32);
  const lathe = points => new THREE.LatheGeometry(points.map(p => new THREE.Vector2(...p)), 24);
  const bust = lathe([[0.15,0],[0.19,0.08],[0.23,0.18],[0.11,0.31],[0.065,0.40],[0.065,0.46]]);
  const dress = lathe([[0.24,0],[0.23,0.08],[0.14,0.43],[0.12,0.54],[0.18,0.75],[0.20,0.82],[0.08,0.91]]);
  const vase = lathe([[0.10,0],[0.13,0.03],[0.17,0.21],[0.10,0.35],[0.065,0.40],[0.07,0.43]]);
  const dummy = new THREE.Object3D(), palette = ['#e7d4c1', '#252b32', '#af668b', '#aaa096', '#f0e8db'];
  const add = (display, geometry, material, offset, scale, color = '#ffffff', tilt = 0) => {
    const key = `${geometry.uuid}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry, material, parts: [] });
    const [x,y,z] = display.position, yaw = display.yaw;
    batches.get(key).parts.push({ position: [x + Math.cos(yaw)*offset[0] + Math.sin(yaw)*offset[2], y+offset[1], z-Math.sin(yaw)*offset[0]+Math.cos(yaw)*offset[2]], scale, yaw, color, tilt });
  };
  displays.forEach((display, index) => {
    const color = palette[index % palette.length];
    if (display.jewelry) {
      add(display, bust, velvet, [0,0,0], [1,1,1]);
      add(display, necklace, metal, [0,0.3,0.085], [1,0.8,1]);
      add(display, sphere, metal, [0,0.23,0.095], [0.02,0.032,0.015]);
    } else if (display.category === 'clothes') {
      add(display, box, metal, [0,0.32,0], [0.025,0.64,0.025]);
      add(display, dress, textile, [0,0.1,0], [1,1,1], color);
      add(display, sphere, ceramic, [0,1.11,0], [0.095,0.13,0.09]);
      for (const side of [-1,1]) add(display, box, textile, [side*0.23,0.67,0], [0.10,0.41,0.12], color, side*0.13);
    } else if (['bag', 'fashion_accessories'].includes(display.category)) {
      add(display, box, leather, [0,0.15,0], [0.38,0.3,0.17], color);
      add(display, handle, leather, [0,0.3,0], [1,1,1], color);
      add(display, box, metal, [0,0.16,0.09], [0.045,0.035,0.014]);
    } else if (['perfumery', 'hairdresser', 'wellness'].includes(display.category)) {
      for (const side of [-1,0,1]) {
        add(display, box, ceramic, [side*0.19,0.11,0], [0.10,0.22+side*0.03,0.07]);
        add(display, box, metal, [side*0.19,0.245+side*0.015,0], [0.07,0.05,0.06]);
      }
    } else {
      add(display, vase, ceramic, [0,0,0], [1,1,1]);
    }
  });
  for (const { geometry, material, parts } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    parts.forEach((part, index) => {
      dummy.position.fromArray(part.position); dummy.rotation.set(0,part.yaw,part.tilt); dummy.scale.fromArray(part.scale); dummy.updateMatrix();
      mesh.setMatrixAt(index,dummy.matrix); mesh.setColorAt(index,new THREE.Color(part.color));
    });
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  // Unused templates never reach the renderer and still need explicit disposal.
  const used = new Set([...batches.values()].map(batch => batch.geometry));
  for (const geometry of [box,sphere,handle,necklace,bust,dress,vase]) if (!used.has(geometry)) geometry.dispose();
  return group;
}
