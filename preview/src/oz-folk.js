import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { measureHead } from './head-fit.js';

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
const quantize = value => Math.round(value * 200) / 200;
// Hats are cut to the measured head: brims clear the hair, crowns sit on it,
// hoods replace it, and Emerald spectacles sit at the real eye line.
function template(folk, fit) {
  const key = `${folk.name}:${[fit.skull.top, fit.skull.radius, fit.skull.front, fit.skull.back, ...fit.skull.centre, fit.hair.top, fit.hair.radius, ...fit.hair.centre].map(quantize).join(':')}`;
  if (templates.has(key)) return templates.get(key);
  const cloth = [], trim = [];
  const add = (parts, geometry, position, rotation = [0, 0, 0], scale = [1, 1, 1]) => {
    geometry.scale(...scale); geometry.rotateX(rotation[0]); geometry.rotateY(rotation[1]); geometry.rotateZ(rotation[2]); geometry.translate(...position); parts.push(geometry);
  };
  const { skull, hair } = fit, eyeY = skull.top - 0.105, eyeZ = skull.front - 0.025, centreY = skull.top - skull.radius;
  const [hx, hz] = hair.centre, [sx, sz] = skull.centre;
  if (folk.hat === 'bells') {
    const brimY = hair.top - 0.022, brimR = hair.radius + 0.035, crownR = hair.radius * 0.92;
    add(cloth, new THREE.CylinderGeometry(brimR, brimR + 0.01, 0.018, 32), [hx, brimY, hz]);
    add(cloth, new THREE.CylinderGeometry(crownR * 0.72, crownR, 0.16, 32), [hx, brimY + 0.08, hz]);
    add(cloth, new THREE.ConeGeometry(crownR * 0.72, 0.24, 32), [hx, brimY + 0.28, hz]);
    for (let i = 0; i < 6; i++) { const angle = i / 6 * Math.PI * 2; add(trim, new THREE.SphereGeometry(0.014, 10, 8), [hx + Math.cos(angle) * brimR, brimY - 0.02, hz + Math.sin(angle) * brimR]); }
  } else if (folk.hat === 'peak') {
    const capR = hair.radius + 0.022, capY = hair.top - capR * 0.66;
    add(cloth, new THREE.SphereGeometry(capR, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), [hx, capY, hz], [0, 0, 0], [1, 0.82, 1]);
    add(cloth, new THREE.CylinderGeometry(capR + 0.045, capR + 0.045, 0.012, 24, 1, false, -Math.PI / 2, Math.PI), [hx, capY, hz]);
    add(trim, new THREE.TorusGeometry(capR, 0.008, 6, 32), [hx, capY, hz], [Math.PI / 2, 0, 0]);
  } else if (folk.hat === 'beret') {
    // A beret presses the hair flat, so it is cut to the skull rather than the hair.
    const beretR = Math.max(hair.radius, skull.radius + 0.02) + 0.03, beretY = skull.top - 0.005;
    add(cloth, new THREE.SphereGeometry(beretR, 28, 16), [sx + 0.02, beretY, sz - 0.01], [0, 0, 0.1], [1, 0.4, 1]);
    add(trim, new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), [sx + 0.02, beretY + beretR * 0.4, sz - 0.01]);
  } else if (folk.hat === 'hood') {
    // A cowl: a shell over the crown and the back half of the head (sphere phi runs
    // +x -> -z -> -x for [PI, 2PI]), a soft peak folded back, and a short collar.
    // The shell hugs the skull: a hair's breadth wider than the head, squashed so its
    // crown sits half a centimetre above the measured top.
    const hoodR = skull.radius + 0.012, squash = (skull.radius + 0.005) / hoodR;
    add(cloth, new THREE.SphereGeometry(hoodR, 32, 18, Math.PI, Math.PI, 0, Math.PI * 0.74), [sx, centreY, sz], [0, 0, 0], [1, squash, 1]);
    add(cloth, new THREE.SphereGeometry(hoodR, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.4), [sx, centreY, sz], [0, 0, 0], [1, squash, 1]);
    add(cloth, new THREE.ConeGeometry(0.045, 0.1, 24, 1, true), [sx, centreY + hoodR * squash * 0.72, sz - hoodR * 0.5], [-0.75, 0, 0]);
    add(cloth, new THREE.CylinderGeometry(skull.radius + 0.015, skull.radius + 0.05, 0.06, 32, 1, true), [sx, centreY - skull.radius - 0.045, sz]);
    add(trim, new THREE.TorusGeometry(skull.radius + 0.022, 0.009, 8, 32), [sx, centreY - skull.radius - 0.013, sz], [Math.PI / 2, 0, 0]);
  } else {
    const brimY = hair.top - 0.01, brimR = hair.radius + 0.04, crownR = hair.radius * 0.95;
    add(cloth, new THREE.CylinderGeometry(brimR, brimR, 0.016, 32), [hx, brimY, hz]);
    add(cloth, new THREE.CylinderGeometry(crownR * 0.94, crownR, 0.26, 32), [hx, brimY + 0.13, hz]);
    add(trim, new THREE.TorusGeometry(crownR, 0.012, 6, 32), [hx, brimY + 0.03, hz], [Math.PI / 2, 0, 0]);
    // Green spectacles, as every citizen of the Emerald City wears, at the eye line.
    for (const side of [-1, 1]) add(trim, new THREE.TorusGeometry(0.031, 0.0045, 6, 24), [sx + side * 0.036, eyeY, eyeZ]);
    add(trim, new THREE.CylinderGeometry(0.003, 0.003, 0.014, 6), [sx, eyeY + 0.006, eyeZ], [0, 0, Math.PI / 2]);
    for (const side of [-1, 1]) add(trim, new THREE.CylinderGeometry(0.003, 0.003, skull.front - skull.back - 0.03, 6), [sx + side * (skull.radius - 0.005), eyeY + 0.008, (skull.front + skull.back) / 2 - 0.01], [Math.PI / 2, 0, 0]);
  }
  const result = [
    { geometry: mergeGeometries(cloth), material: new THREE.MeshStandardMaterial({ color: folk.color, roughness: 0.86 }) },
    { geometry: mergeGeometries(trim), material: new THREE.MeshStandardMaterial({ color: folk.trim, roughness: 0.4, metalness: folk.hat === 'bells' ? 0.7 : 0.15 }) },
  ];
  [...cloth, ...trim].forEach(geometry => geometry.dispose());
  templates.set(key, result); return result;
}

// Tint the shared suit toward the country colour and attach the country's hat.
// Skin, hair and eye materials are never touched; the hat follows the skeleton.
export function applyOzFolk(avatar, id) {
  const folk = ozFolkFor(id), model = avatar.model, head = model.getObjectByName('head');
  for (const [original, material] of avatar.materials) if (/suit|dress|shirt|jacket/.test(original.name)) { material.color.set(folk.color); material.roughness = 0.82; material.needsUpdate = true; }
  if (head) {
    const fit = measureHead(avatar);
    // A hood replaces the hair; every other hat sits on top of it.
    if (folk.hat === 'hood') model.traverse(item => { if (item.isMesh && /^(bob|short|ponytail|long|afro|curly)/.test(item.material?.name ?? '')) item.visible = false; });
    model.updateMatrixWorld(true);
    const group = new THREE.Group(); group.name = `${folk.name} hat`;
    group.position.copy(head.getWorldPosition(new THREE.Vector3())); group.updateMatrixWorld(true);
    for (const part of template(folk, fit)) { const mesh = new THREE.Mesh(part.geometry, part.material); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.localId = id; mesh.userData.ozFolk = folk.name; group.add(mesh); }
    head.attach(group);
  }
  model.userData.ozFolk = folk.name;
  return folk;
}
