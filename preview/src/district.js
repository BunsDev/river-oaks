import * as THREE from 'three';
import { terrainHeight } from './geometry.js';
import { physicalSurface } from './materials.js';

function sign(name) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ece9e0'; context.fillRect(0, 0, 1024, 128);
  context.fillStyle = '#252a29'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.font = `500 ${name.length > 20 ? 39 : name.length > 13 ? 47 : 57}px Georgia`;
  context.fillText(name.toUpperCase(), 512, 65, 955);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 });
}

export function buildDistrictBuildings(world) {
  const group = new THREE.Group(), materials = new Set(), geometries = new Set(), textures = [];
  const box = new THREE.BoxGeometry(1, 1, 1); geometries.add(box);
  const stone = physicalSurface('stone', { instanced: true, tileSize: 3, color: '#eee9df', normalScale: new THREE.Vector2(0.25, 0.25) });
  const dark = new THREE.MeshStandardMaterial({ color: '#303634', metalness: 0.58, roughness: 0.35 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#6e8383', metalness: 0.18, roughness: 0.09, clearcoat: 1, envMapIntensity: 1.2 });
  const brick = physicalSurface('brick', { instanced: true, tileSize: 2 });
  const roof = new THREE.MeshStandardMaterial({ color: '#aaa99f', roughness: 0.93 });
  const gold = new THREE.MeshStandardMaterial({ color: '#a68d62', roughness: 0.35, metalness: 0.75 });
  for (const material of [stone, dark, glass, brick, roof, gold]) materials.add(material);
  const batches = new Map();
  const part = (material, position, scale, yaw = 0, buildingIndex = -1) => {
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push({ position, scale, yaw, buildingIndex });
  };
  world.buildings.forEach((building, index) => {
    const shape = new THREE.Shape(building.ring.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: building.size[2], bevelEnabled: false, steps: 1, curveSegments: 1 });
    geometry.rotateX(-Math.PI / 2); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, building.kind === 'parking' ? roof : stone);
    mesh.position.y = building.center[2]; mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.districtBuilding = building.id; group.add(mesh);
    const roofGeometry = new THREE.ShapeGeometry(shape); roofGeometry.rotateX(-Math.PI / 2); geometries.add(roofGeometry);
    const top = new THREE.Mesh(roofGeometry, roof); top.position.y = building.center[2] + building.size[2] + 0.02; top.receiveShadow = true; group.add(top);
    const ring = building.ring;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i-1], b = ring[i], dx = b[0]-a[0], dy = b[1]-a[1], length = Math.hypot(dx, dy);
      if (length < 1) continue;
      const yaw = Math.atan2(dy, dx), cx = (a[0]+b[0])/2, cz = -(a[1]+b[1])/2, base = building.center[2];
      const material = building.kind === 'apartments' ? brick : stone;
      part(material, [cx, base + 4.65, cz], [length, 1.0, 0.16], yaw, index);
      part(stone, [cx, base + 0.18, cz], [length, 0.36, 0.26], yaw, index);
      part(stone, [cx, base + building.size[2] - 0.2, cz], [length + 0.1, 0.38, 0.3], yaw, index);
      const bays = Math.floor(length / 3.2), span = length / Math.max(1, bays);
      for (let k = 0; k < bays; k++) {
        const t = (k+0.5)/bays, x = a[0]+dx*t, z = -(a[1]+dy*t);
        part(glass, [x, base+2.25, z], [span-0.35, 3.65, 0.12], yaw, index);
        part(dark, [x, base+2.25, z], [0.055, 3.7, 0.19], yaw, index);
        part(dark, [x, base+3.5, z], [span-0.3, 0.055, 0.19], yaw, index);
        part(material, [a[0]+dx*k/bays, base+2.25, -(a[1]+dy*k/bays)], [0.26, 4.1, 0.24], yaw, index);
        for (let level = 1; level < Math.floor(building.size[2]/4)-1; level++) part(glass, [x, base+6.9+level*3.25, z], [span-0.8, 2.1, 0.15], yaw, index);
      }
    }
  });
  for (const store of world.stores) {
    const [x, north, base] = store.facade, [nx, ny] = store.outward;
    const yaw = Math.atan2(nx, -ny);
    const material = sign(store.name); materials.add(material); textures.push(material.map);
    const geometry = new THREE.PlaneGeometry(store.name.length > 17 ? 9 : 7, 0.85); geometries.add(geometry);
    const label = new THREE.Mesh(geometry, material);
    label.position.set(x+nx*0.25, base+4.65, -north-ny*0.25); label.rotation.y = yaw;
    label.userData.storeId = store.id; group.add(label);
    // Door hardware and a modest awning provide readable pedestrian-scale detail.
    part(dark, [x+nx*0.15, base+1.8, -north-ny*0.15], [1.7, 3.2, 0.18], yaw);
    part(glass, [x+nx*0.26, base+1.8, -north-ny*0.26], [1.5, 3.0, 0.09], yaw);
    part(gold, [x+nx*0.36, base+1.5, -north-ny*0.36], [0.04, 0.65, 0.06], yaw);
    part(dark, [x+nx*0.65, base+4.02, -north-ny*0.65], [4.6, 0.09, 1.4], yaw);
  }
  const dummy = new THREE.Object3D();
  for (const [material, parts] of batches) {
    const mesh = new THREE.InstancedMesh(box, material, parts.length);
    mesh.userData.buildingIndices = parts.map(part => part.buildingIndex);
    parts.forEach((part, index) => { dummy.position.fromArray(part.position); dummy.scale.fromArray(part.scale); dummy.rotation.set(0, part.yaw, 0); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); });
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  group.userData.dispose = () => { group.traverse(item => { if (item.isInstancedMesh) item.dispose(); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); };
  return group;
}

export function buildDistrictDetail(world) {
  const group = new THREE.Group(), objects = [];
  const dummy = new THREE.Object3D();
  const bronze = new THREE.MeshStandardMaterial({ color: '#454c46', roughness: 0.55, metalness: 0.6 });
  const timber = new THREE.MeshStandardMaterial({ color: '#80705a', roughness: 0.85 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const benches = world.stores.filter((_, i) => i % 3 === 0);
  for (const store of benches) {
    const [nx, ny] = store.outward, x = store.visit[0] + nx*2.8 + ny*4, north = store.visit[1] + ny*2.8 - nx*4;
    const ground = terrainHeight(world.terrain, x, north), yaw = Math.atan2(nx, -ny);
    for (let i = 0; i < 5; i++) objects.push({ material: timber, p: [x+nx*(i-2)*0.11, ground+0.65, -north-ny*(i-2)*0.11], s: [1.8, 0.06, 0.09], yaw });
    for (const side of [-1, 1]) objects.push({ material: bronze, p: [x+ny*side*0.65, ground+0.4, -north+nx*side*0.65], s: [0.1, 0.5, 0.5], yaw });
    objects.push({ material: bronze, p: [x+nx*1.2, ground+2.8, -north-ny*1.2], s: [0.1, 5.2, 0.1], yaw });
    objects.push({ material: bronze, p: [x+nx*1.2, ground+5.45, -north-ny*1.2], s: [0.55, 0.12, 0.65], yaw });
  }
  for (const material of [bronze, timber]) {
    const parts = objects.filter(p => p.material === material), mesh = new THREE.InstancedMesh(box, material, parts.length);
    parts.forEach((p,i) => { dummy.position.fromArray(p.p); dummy.scale.fromArray(p.s); dummy.rotation.set(0,p.yaw,0); dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix); });
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  return group;
}
