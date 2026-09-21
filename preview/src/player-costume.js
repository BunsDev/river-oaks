import * as THREE from 'three';
import { createJevicaCostume } from './jevica-costume.js';
import { measureHead } from './head-fit.js';

const isSkin = name => /^(young|middleage|old)_/.test(name);
const isHair = name => /^(bob|short|ponytail|long|afro|curly)/.test(name);
const isEyes = name => /^brown/.test(name);
const isShoes = name => /^shoes/.test(name);

// A small deterministic gingham check: two blues over white, four cells per repeat.
function gingham() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = Math.floor(x / 16) % 2, b = Math.floor(y / 16) % 2;
    const color = a && b ? [64, 104, 176] : a || b ? [156, 182, 222] : [246, 247, 250];
    data.set([...color, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(9, 9);
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

// Player-only costumes on the shared rig. Shared resident geometry is never mutated;
// designs follow Baum's descriptions (silver shoes, a funnel hat, a bow in the mane).
export function createPlayerCostume(avatar, form) {
  if (form === 'jevica') return createJevicaCostume(avatar);
  const { model, materials } = avatar.rig;
  const fit = measureHead(avatar.rig), { skull, hair: hairFit } = fit, skullCentre = skull.top - skull.radius, [sx, sz] = skull.centre, [hx, hz] = hairFit.centre;
  const attachments = [], owned = new Set();
  const material = (color, extra = {}) => { const value = new THREE.MeshPhysicalMaterial({ color, roughness: 0.65, ...extra }); owned.add(value); return value; };
  const black = material('#080c12', { roughness: 0.15 });
  const purple = material('#17161f', { roughness: 0.9, sheen: 0.7, sheenColor: new THREE.Color('#483350') });
  const silver = material('#bdb7d3', { metalness: 0.7, roughness: 0.26 });
  const hair = material('#8c5c35', { roughness: 0.58 });
  const straw = material('#d8b354', { roughness: 0.95 });
  const burlap = material('#9a7a4a', { roughness: 0.97, sheen: 0.3, sheenColor: new THREE.Color('#c9a86a') });
  const tin = material('#c3c8cf', { metalness: 0.88, roughness: 0.3 });
  const fur = material('#c48a45', { roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#e7c48f'), sheenRoughness: 0.7 });
  const mane = material('#9b5f2a', { roughness: 0.85, sheen: 0.9, sheenColor: new THREE.Color('#d39a55') });
  const ribbon = material('#c8262e', { roughness: 0.5, sheen: 0.6 });
  const wicker = material('#b08a52', { roughness: 0.9 });
  const patch = [material('#3f6d9b', { roughness: 0.9 }), material('#b5472f', { roughness: 0.9 }), material('#8a9a45', { roughness: 0.9 })];
  model.updateMatrixWorld(true);
  const attach = name => {
    const bone = model.getObjectByName(name), group = new THREE.Group();
    const rest = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    avatar.object.add(group); attachments.push({ bone, group, rest }); return group;
  };
  const mesh = (group, geometry, surface, position, scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    owned.add(geometry); const item = new THREE.Mesh(geometry, surface); item.position.fromArray(position); item.scale.fromArray(scale); item.rotation.set(...rotation); item.castShadow = item.receiveShadow = true; group.add(item); return item;
  };
  const sphere = (group, surface, position, scale, rotation) => mesh(group, new THREE.SphereGeometry(1, 24, 16), surface, position, scale, rotation);
  const hideHair = () => model.traverse(item => { if (item.isMesh && isHair(item.material?.name ?? '')) item.visible = false; });
  const tufts = (group, count, radius, length, y = 0) => {
    for (let i = 0; i < count; i++) { const angle = i * 2.39996; mesh(group, new THREE.CylinderGeometry(0.004, 0.007, length, 5), straw, [Math.cos(angle) * radius, y - length / 2, Math.sin(angle) * radius], [1, 1, 1], [Math.sin(angle) * 0.35, 0, Math.cos(angle) * 0.35]); }
  };
  // Base rig materials per form: only the player's clone is recoloured.
  if (form !== 'visitor') for (const [original, surface] of materials) {
    const name = original.name;
    if (isEyes(name)) continue;
    if (form === 'witch') { if (isSkin(name)) surface.color.set('#d3cebc'); else if (isHair(name)) surface.color.set('#201a28'); else { surface.map = null; surface.color.set('#24182e'); surface.roughness = 0.6; } }
    if (form === 'dorothy') { if (isHair(name)) surface.color.set('#5a3a1e'); else if (isShoes(name)) { surface.map = null; surface.color.set('#d9dbe3'); surface.metalness = 0.85; surface.roughness = 0.25; } else if (!isSkin(name)) { surface.map = gingham(); owned.add(surface.map); surface.color.set('#ffffff'); surface.roughness = 0.8; } }
    if (form === 'scarecrow') { if (isSkin(name)) { surface.map = null; surface.color.set('#d8b98b'); surface.roughness = 0.95; } else if (isHair(name)) surface.color.set('#d8b354'); else { surface.map = null; surface.color.set(isShoes(name) ? '#5b4630' : '#8a6a3c'); surface.roughness = 0.95; } }
    if (form === 'tinman') { surface.map = null; surface.color.set(isHair(name) ? '#9aa1a9' : '#c3c8cf'); surface.metalness = 0.85; surface.roughness = 0.32; }
    if (form === 'lion') { surface.map = null; surface.color.set(isSkin(name) ? '#d2a066' : isShoes(name) ? '#a97a3e' : '#c48a45'); surface.roughness = 0.82; }
    surface.needsUpdate = true;
  }
  if (form === 'dorothy') {
    const head = attach('head');
    for (const side of [-1, 1]) {
      const braid = mesh(head, new THREE.CylinderGeometry(0.018, 0.026, 0.3, 10), hair, [side * 0.1, -0.13, 0.0], [1, 1, 1], [0.1, 0, -side * 0.12]);
      sphere(head, ribbon, [side * 0.115, -0.27, 0.02], [0.03, 0.018, 0.02]); braid.userData.braid = true;
    }
    const waist = attach('spine_01');
    const skirt = new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => { const t = i / 11; return new THREE.Vector2(0.21 + 0.14 * t, -0.05 - 0.52 * t); }), 48);
    const ginghamSkirt = material('#ffffff', { roughness: 0.8, side: THREE.DoubleSide, map: gingham() }); owned.add(ginghamSkirt.map);
    mesh(waist, skirt, ginghamSkirt, [0, 0, 0]);
    const chest = attach('spine_03');
    mesh(chest, new THREE.BoxGeometry(0.2, 0.2, 0.015), material('#f6f4ee', { roughness: 0.85 }), [0, 0.03, 0.115]);
    const hand = attach('hand_l');
    mesh(hand, new THREE.CylinderGeometry(0.1, 0.075, 0.12, 14, 1, true), wicker, [0, -0.2, 0.04]);
    mesh(hand, new THREE.CircleGeometry(0.075, 14), wicker, [0, -0.26, 0.04], [1, 1, 1], [Math.PI / 2, 0, 0]);
    mesh(hand, new THREE.TorusGeometry(0.095, 0.008, 6, 24, Math.PI), wicker, [0, -0.15, 0.04], [1, 1, 1], [0, Math.PI / 2, 0]);
  }
  if (form === 'scarecrow') {
    hideHair();
    const head = attach('head');
    const brimY = skull.top - 0.008;
    mesh(head, new THREE.CylinderGeometry(skull.radius + 0.19, skull.radius + 0.2, 0.02, 32), burlap, [sx, brimY, sz]);
    const crown = mesh(head, new THREE.ConeGeometry(skull.radius + 0.08, 0.44, 32), burlap, [sx + 0.05, brimY + 0.21, sz - 0.02]); crown.rotation.z = -0.22;
    const straws = attach('head'); straws.position.set(0, 0, 0); tufts(straws, 14, skull.radius + 0.04, 0.12, brimY); straws.children.forEach(tuft => { tuft.position.x += sx; tuft.position.z += sz; });
    const neck = attach('neck_01'); tufts(neck, 12, 0.07, 0.1, 0.02);
    for (const side of ['l', 'r']) { const wrist = attach(`hand_${side}`); tufts(wrist, 10, 0.045, 0.09, 0.02); const ankle = attach(`foot_${side}`); tufts(ankle, 10, 0.055, 0.08, 0.1); }
    const chest = attach('spine_03');
    mesh(chest, new THREE.BoxGeometry(0.09, 0.07, 0.012), patch[0], [0.07, 0.02, 0.12], [1, 1, 1], [0, 0, 0.3]);
    mesh(chest, new THREE.BoxGeometry(0.07, 0.09, 0.012), patch[1], [-0.08, -0.06, 0.115], [1, 1, 1], [0, 0, -0.2]);
    const waist = attach('spine_01');
    mesh(waist, new THREE.TorusGeometry(0.19, 0.012, 8, 32), straw, [0, 0.02, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    const knee = attach('calf_l'); mesh(knee, new THREE.BoxGeometry(0.08, 0.08, 0.012), patch[2], [0, 0.12, 0.075]);
  }
  if (form === 'tinman') {
    hideHair();
    const head = attach('head');
    mesh(head, new THREE.CylinderGeometry(skull.radius + 0.08, 0.05, 0.16, 32), tin, [sx, skull.top + 0.07, sz]);
    mesh(head, new THREE.CylinderGeometry(0.02, 0.026, 0.15, 12), tin, [sx, skull.top + 0.22, sz]);
    const chest = attach('spine_03');
    const plate = mesh(chest, new THREE.CylinderGeometry(0.2, 0.185, 0.34, 28), tin, [0, -0.05, 0.005]); plate.scale.set(1, 1, 0.78);
    for (let i = 0; i < 12; i++) { const angle = i / 12 * Math.PI * 2; sphere(chest, silver, [Math.cos(angle) * 0.2, 0.08, Math.sin(angle) * 0.156], [0.012, 0.012, 0.012]); sphere(chest, silver, [Math.cos(angle) * 0.19, -0.19, Math.sin(angle) * 0.148], [0.012, 0.012, 0.012]); }
    for (const side of ['l', 'r']) {
      mesh(attach(`lowerarm_${side}`), new THREE.TorusGeometry(0.058, 0.014, 8, 24), silver, [0, 0.02, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      mesh(attach(`calf_${side}`), new THREE.TorusGeometry(0.075, 0.016, 8, 24), silver, [0, 0.16, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      sphere(attach(`upperarm_${side}`), tin, [0, 0, 0], [0.09, 0.09, 0.09]);
    }
    const hand = attach('hand_l');
    mesh(hand, new THREE.CylinderGeometry(0.045, 0.05, 0.11, 16), tin, [0, -0.17, 0.03]);
    mesh(hand, new THREE.CylinderGeometry(0.006, 0.012, 0.12, 8), tin, [0.04, -0.09, 0.03], [1, 1, 1], [0, 0, -0.9]);
  }
  if (form === 'lion') {
    hideHair();
    avatar.object.scale.set(1.06, 1.02, 1.06);
    const head = attach('head');
    const maneR = skull.radius + 0.09, back = skull.back;
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2, radius = maneR + (i % 2) * 0.04, low = Math.sin(angle) < -0.3;
      const lock = sphere(head, mane, [sx + Math.cos(angle) * radius, skullCentre + Math.sin(angle) * radius * 0.95, low ? back + 0.06 : back + 0.01 - (i % 3) * 0.02], [0.08, 0.12 + (i % 2) * 0.03, 0.07]); lock.rotation.z = angle;
    }
    for (let i = 0; i < 12; i++) { const angle = i / 12 * Math.PI * 2; sphere(head, mane, [sx + Math.cos(angle) * (maneR - 0.04), skullCentre - 0.01 + Math.sin(angle) * (maneR - 0.04), back - 0.06], [0.07, 0.1, 0.06], [0, 0, angle]); }
    for (let i = 0; i < 5; i++) { const t = (i - 2) / 2; sphere(head, mane, [sx + t * 0.11, skullCentre - skull.radius - 0.05 - Math.abs(t) * 0.02, skull.front - 0.05 - Math.abs(t) * 0.03], [0.05, 0.07, 0.045]); }
    for (const side of [-1, 1]) sphere(head, fur, [sx + side * (skull.radius + 0.01), skull.top + 0.01, sz], [0.045, 0.05, 0.03]);
    sphere(head, black, [sx, skullCentre - 0.02, skull.front + 0.01], [0.026, 0.018, 0.016]);
    for (const side of [-1, 1]) { const loop = sphere(head, ribbon, [sx + side * 0.045, skull.top + 0.06, sz + 0.05], [0.045, 0.026, 0.02]); loop.rotation.z = side * 0.5; }
    sphere(head, ribbon, [sx, skull.top + 0.055, sz + 0.055], [0.018, 0.018, 0.018]);
    const tail = attach('spine_01');
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.02, -0.11), new THREE.Vector3(0.05, -0.2, -0.28), new THREE.Vector3(0.12, -0.5, -0.32), new THREE.Vector3(0.2, -0.72, -0.2)]);
    mesh(tail, new THREE.TubeGeometry(path, 16, 0.02, 8, false), fur, [0, 0, 0]);
    sphere(tail, mane, [0.2, -0.74, -0.19], [0.045, 0.06, 0.045]);
  }
  if (form === 'witch') {
    avatar.object.scale.set(0.88, 1.08, 0.93);
    const head = attach('head');
    const brimY = hairFit.top - 0.014, crownR = hairFit.radius + 0.1;
    mesh(head, new THREE.CylinderGeometry(crownR + 0.18, crownR + 0.19, 0.035, 40), purple, [hx, brimY, hz]);
    const crown = mesh(head, new THREE.ConeGeometry(crownR, 0.71, 40), purple, [hx + 0.06, brimY + 0.34, hz]); crown.rotation.z = -0.18;
    mesh(head, new THREE.CylinderGeometry(crownR - 0.01, crownR + 0.01, 0.075, 32), black, [hx + 0.015, brimY + 0.045, hz]);
    mesh(head, new THREE.TorusGeometry(0.045, 0.008, 8, 20), silver, [hx, brimY + 0.05, hz + crownR]);
    const waist = attach('spine_01');
    const robe = new THREE.LatheGeometry(Array.from({ length: 25 }, (_, i) => { const t = i / 24; return new THREE.Vector2(0.34 - 0.18 * t, -0.91 + t * 1.04); }), 64);
    const points = robe.attributes.position;
    for (let i = 0; i < points.count; i++) { const x = points.getX(i), z = points.getZ(i), fold = 1 + 0.05 * Math.sin(Math.atan2(z, x) * 16); points.setXYZ(i, x * fold, points.getY(i), z * fold); }
    robe.computeVertexNormals(); mesh(waist, robe, purple, [0, 0, 0]);
    const shoulders = attach('spine_03');
    const cape = new THREE.LatheGeometry([new THREE.Vector2(0.43, -0.77), new THREE.Vector2(0.36, -0.3), new THREE.Vector2(0.28, 0.18), new THREE.Vector2(0.095, 0.29)], 48, Math.PI / 2, Math.PI);
    const velvet = material('#312337', { roughness: 0.92, side: THREE.DoubleSide, sheen: 1, sheenColor: new THREE.Color('#6d486b') });
    mesh(shoulders, cape, velvet, [0, 0, -0.025]);
    mesh(shoulders, new THREE.OctahedronGeometry(0.028), silver, [0, 0.16, 0.135], [0.65, 1, 0.5]);
    const hand = attach('hand_l');
    mesh(hand, new THREE.CylinderGeometry(0.013, 0.021, 1.25, 12), hair, [0, -0.18, 0]);
    for (let i = 0; i < 24; i++) { const angle = i * 2.39996; const bristle = mesh(hand, new THREE.CylinderGeometry(0.004, 0.007, 0.36, 5), hair, [Math.cos(angle) * 0.055, -0.83, Math.sin(angle) * 0.055]); bristle.rotation.z = Math.sin(angle) * 0.13; }
    hand.userData.heldBroom = true;
  }
  const position = new THREE.Vector3(), orientation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  return {
    update(flying = false) {
      attachments.forEach(({ group }) => { if (group.userData.heldBroom) group.visible = !flying; });
      avatar.object.updateWorldMatrix(true, true); inverse.copy(avatar.object.getWorldQuaternion(orientation)).invert();
      for (const item of attachments) {
        item.bone.getWorldPosition(position); item.group.position.copy(avatar.object.worldToLocal(position));
        item.bone.getWorldQuaternion(orientation); item.group.quaternion.copy(inverse).multiply(orientation).multiply(item.rest);
      }
    },
    dispose() { attachments.forEach(({ group }) => group.removeFromParent()); owned.forEach(item => item.dispose()); },
  };
}
