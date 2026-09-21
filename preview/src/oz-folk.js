import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The peoples of Baum's Oz (the 1900 novel is public domain): each country
// dresses in its own colour, and Emerald City folk wear their green spectacles.
export const OZ_FOLK = [
  { name: 'Munchkin', country: 'Munchkin Country', color: '#2f5fae', trim: '#e9c766', hat: 'bells' },
  { name: 'Winkie', country: 'Winkie Country', color: '#d9b53a', trim: '#fbf3d6', hat: 'peak' },
  { name: 'Quadling', country: 'Quadling Country', color: '#b23a3a', trim: '#f5d9c9', hat: 'beret' },
  { name: 'Gillikin', country: 'Gillikin Country', color: '#6e4a9c', trim: '#d9c8ef', hat: 'hood' },
  { name: 'Emerald', country: 'Emerald City', color: '#2f8f5b', trim: '#bfe8c9', hat: 'topper' },
];
export function ozFolkFor(id) {
  let hash = 0;
  for (const character of String(id)) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return OZ_FOLK[hash % OZ_FOLK.length];
}

const templates = new Map();
function template(folk) {
  if (templates.has(folk.name)) return templates.get(folk.name);
  const cloth = [], trim = [];
  const add = (parts, geometry, position, rotation = [0, 0, 0], scale = [1, 1, 1]) => {
    geometry.scale(...scale); geometry.rotateX(rotation[0]); geometry.rotateY(rotation[1]); geometry.rotateZ(rotation[2]); geometry.translate(...position); parts.push(geometry);
  };
  // Positions are metres in a head-aligned frame: y up from the head joint, z forward.
  if (folk.hat === 'bells') {
    add(cloth, new THREE.CylinderGeometry(0.2, 0.21, 0.018, 32), [0, 0.19, 0]);
    add(cloth, new THREE.CylinderGeometry(0.11, 0.15, 0.16, 32), [0, 0.27, 0]);
    add(cloth, new THREE.ConeGeometry(0.11, 0.24, 32), [0, 0.47, 0]);
    for (let i = 0; i < 6; i++) { const angle = i / 6 * Math.PI * 2; add(trim, new THREE.SphereGeometry(0.014, 10, 8), [Math.cos(angle) * 0.2, 0.17, Math.sin(angle) * 0.2]); }
  } else if (folk.hat === 'peak') {
    add(cloth, new THREE.SphereGeometry(0.155, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.135, -0.01], [0, 0, 0], [1, 0.78, 1]);
    add(cloth, new THREE.CylinderGeometry(0.16, 0.16, 0.014, 24, 1, false, -Math.PI / 2, Math.PI), [0, 0.135, -0.01]);
    add(trim, new THREE.TorusGeometry(0.152, 0.008, 6, 32), [0, 0.135, -0.01], [Math.PI / 2, 0, 0]);
  } else if (folk.hat === 'beret') {
    add(cloth, new THREE.SphereGeometry(0.19, 28, 16), [0.03, 0.205, -0.02], [0, 0, 0.12], [1, 0.36, 1]);
    add(trim, new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), [0.03, 0.28, -0.02]);
  } else if (folk.hat === 'hood') {
    add(cloth, new THREE.ConeGeometry(0.175, 0.34, 32, 1, true), [0, 0.2, -0.03], [0.12, 0, 0]);
    add(cloth, new THREE.SphereGeometry(0.17, 28, 16, Math.PI * 0.55, Math.PI * 0.9, 0, Math.PI * 0.62), [0, 0.06, -0.01]);
    add(trim, new THREE.TorusGeometry(0.16, 0.014, 8, 32), [0, -0.09, -0.01], [Math.PI / 2, 0, 0]);
  } else {
    add(cloth, new THREE.CylinderGeometry(0.21, 0.21, 0.018, 32), [0, 0.19, 0]);
    add(cloth, new THREE.CylinderGeometry(0.135, 0.145, 0.26, 32), [0, 0.32, 0]);
    add(trim, new THREE.TorusGeometry(0.14, 0.012, 6, 32), [0, 0.21, 0], [Math.PI / 2, 0, 0]);
    // Green spectacles, as every citizen of the Emerald City wears.
    for (const side of [-1, 1]) add(trim, new THREE.TorusGeometry(0.03, 0.005, 6, 24), [side * 0.05, 0.07, 0.125]);
    add(trim, new THREE.CylinderGeometry(0.004, 0.004, 0.04, 6), [0, 0.07, 0.125], [0, 0, Math.PI / 2]);
  }
  const result = [
    { geometry: mergeGeometries(cloth), material: new THREE.MeshStandardMaterial({ color: folk.color, roughness: 0.86 }) },
    { geometry: mergeGeometries(trim), material: new THREE.MeshStandardMaterial({ color: folk.trim, roughness: 0.4, metalness: folk.hat === 'bells' ? 0.7 : 0.15 }) },
  ];
  [...cloth, ...trim].forEach(geometry => geometry.dispose());
  templates.set(folk.name, result); return result;
}

// Tint the shared suit toward the country colour and attach the country's hat.
// Skin, hair and eye materials are never touched; the hat follows the skeleton.
export function applyOzFolk(avatar, id) {
  const folk = ozFolkFor(id), model = avatar.model, head = model.getObjectByName('head');
  for (const [original, material] of avatar.materials) if (/suit|dress|shirt|jacket/.test(original.name)) { material.color.set(folk.color); material.roughness = 0.82; material.needsUpdate = true; }
  if (head) {
    model.updateMatrixWorld(true);
    const group = new THREE.Group(); group.name = `${folk.name} hat`;
    group.position.copy(head.getWorldPosition(new THREE.Vector3())); group.updateMatrixWorld(true);
    for (const part of template(folk)) { const mesh = new THREE.Mesh(part.geometry, part.material); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.localId = id; mesh.userData.ozFolk = folk.name; group.add(mesh); }
    head.attach(group);
  }
  model.userData.ozFolk = folk.name;
  return folk;
}
