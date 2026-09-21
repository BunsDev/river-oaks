import * as THREE from 'three';
import { createJevicaCostume } from './jevica-costume.js';

const isSkin = name => /^(young|middleage|old)_/.test(name);
const isHair = name => /^(bob|short|ponytail|long|afro|curly)/.test(name);

export function createPlayerCostume(avatar, form) {
  if (form === 'jevica') return createJevicaCostume(avatar);
  const { model, materials } = avatar.rig;
  const attachments = [], owned = new Set();
  const material = (color, extra = {}) => { const value = new THREE.MeshPhysicalMaterial({ color, roughness: 0.65, ...extra });owned.add(value);return value; };
  const skin = material('#506f88', { roughness: 0.48, clearcoat:0.18 });
  const black = material('#080c12', { roughness: 0.15 });
  const purple = material('#17161f', {roughness:0.9, sheen:0.7, sheenColor:new THREE.Color('#483350')});
  const armor = material('#253c50', {metalness:0.48, roughness:0.38});
  const silver = material('#bdb7d3', { metalness: 0.7, roughness: 0.26 });
  const hair = material(form === 'jevica' ? '#e4c481' : '#8c5c35', { roughness: 0.58 });
  const glow = material(form === 'alien' ? '#edbb79' : '#c390e8', { emissive: form === 'alien' ? '#e99137' : '#aa54e0', emissiveIntensity: 0.4 });
  model.updateMatrixWorld(true);
  const attach = name => {
    const bone = model.getObjectByName(name), group = new THREE.Group();
    const rest = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    avatar.object.add(group);attachments.push({ bone, group, rest });return group;
  };
  const mesh = (group, geometry, surface, position, scale = [1, 1, 1]) => {
    owned.add(geometry);const item = new THREE.Mesh(geometry, surface);item.position.fromArray(position);item.scale.fromArray(scale);item.castShadow = item.receiveShadow = true;group.add(item);return item;
  };
  const sphere = (group, surface, position, scale) => mesh(group, new THREE.SphereGeometry(1, 24, 16), surface, position, scale);
  if (form !== 'visitor') {
    for (const [original, surface] of materials) {
      const name = original.name;
      if (isSkin(name)) {
        surface.color.set(form === 'alien' ? '#687f99' : '#d3cebc');
        if (form === 'alien') {surface.map = null;surface.roughness = 0.52;}
      } else if (isHair(name)) surface.color.set(form === 'witch' ? '#201a28' : '#8e633e');
      else if (!/^brown/.test(name)) {surface.map = null;surface.color.set(form === 'witch' ? '#24182e' : form === 'alien' ? '#162c30' : '#f4afcd');surface.roughness = 0.6;}
      surface.needsUpdate = true;
    }
  }
  if (form === 'alien') {
    model.traverse(item => { if (item.isMesh && isHair(item.material?.name ?? '')) item.visible = false; });
    avatar.object.scale.set(1.18,0.96,1.1);
    // Keep the human source head inside the broader alien anatomy.
    model.getObjectByName('head').scale.set(0.85, 0.9, 0.85);
    const head = attach('head');
    sphere(head, skin, [0, 0.09, -0.025], [0.218, 0.22, 0.18]);
    for (const side of [-1, 1]) {
      const eye = sphere(head, black, [side * 0.102, 0.09, 0.136], [0.086, 0.058, 0.032]);eye.rotation.z = -side * 0.22;
      sphere(head, glow, [side * 0.10, 0.09, 0.169], [0.005, 0.031, 0.003]);
      const brow = sphere(head, armor, [side*0.105,0.16,0.11],[0.10,0.025,0.055]);brow.rotation.z=-side*0.2;
      for (let i=0;i<3;i++) {
        const fin = sphere(head, skin, [side*(0.19+i*0.018),0.10-i*0.035,-0.025-i*0.025], [0.09-i*0.014,0.023,0.08]);fin.rotation.z=side*(0.3+i*0.2);
      }
      const shoulder = attach(`upperarm_${side<0?'r':'l'}`);
      sphere(shoulder,armor,[side*0.015,-0.025,0],[0.145,0.12,0.14]);
      for(let i=0;i<3;i++)sphere(shoulder,silver,[side*0.09,-0.04-i*0.035,0.02],[0.062,0.014,0.10]);
    }
    const chest = attach('spine_03');
    sphere(chest,armor,[0,-0.015,0.06],[0.225,0.21,0.14]);
    for (let i = 0; i < 3; i++) sphere(chest, glow, [0, 0.055-i * 0.06, 0.20], [0.022 - i * 0.004, 0.008, 0.007]);
    sphere(head,black,[0,-0.08,0.137],[0.055,0.004,0.006]);
  }
  if (form === 'witch') {
    avatar.object.scale.set(0.88,1.08,0.93);
    const head = attach('head');
    mesh(head, new THREE.CylinderGeometry(0.42, 0.43, 0.035, 40), purple, [0, 0.08, 0]);
    const crown = mesh(head, new THREE.ConeGeometry(0.24, 0.71, 40), purple, [0.06, 0.42, 0]);crown.rotation.z = -0.18;
    mesh(head, new THREE.CylinderGeometry(0.23, 0.25, 0.075, 32), black, [0.015, 0.125, 0]);
    mesh(head, new THREE.TorusGeometry(0.045, 0.008, 8, 20), silver, [0, 0.13, 0.235]);
    const waist = attach('spine_01');
    const robe = new THREE.LatheGeometry(Array.from({length:25},(_,i)=>{const t=i/24;return new THREE.Vector2(0.34-0.18*t,-0.91+t*1.04);}),64);
    const points=robe.attributes.position;
    for(let i=0;i<points.count;i++){const x=points.getX(i),z=points.getZ(i),fold=1+0.05*Math.sin(Math.atan2(z,x)*16);points.setXYZ(i,x*fold,points.getY(i),z*fold);}
    robe.computeVertexNormals();mesh(waist,robe,purple,[0,0,0]);
    const shoulders=attach('spine_03');
    const cape=new THREE.LatheGeometry([new THREE.Vector2(0.43,-0.77),new THREE.Vector2(0.36,-0.3),new THREE.Vector2(0.28,0.18),new THREE.Vector2(0.095,0.29)],48,Math.PI/2,Math.PI);
    const velvet=material('#312337',{roughness:0.92,side:THREE.DoubleSide,sheen:1,sheenColor:new THREE.Color('#6d486b')});
    mesh(shoulders,cape,velvet,[0,0,-0.025]);
    mesh(shoulders,new THREE.OctahedronGeometry(0.028),silver,[0,0.16,0.135],[0.65,1,0.5]);
    const hand = attach('hand_l');
    mesh(hand, new THREE.CylinderGeometry(0.013, 0.021, 1.25, 12), hair, [0, -0.18, 0]);
    for(let i=0;i<24;i++){const angle=i*2.39996;const bristle=mesh(hand,new THREE.CylinderGeometry(0.004,0.007,0.36,5),hair,[Math.cos(angle)*0.055,-0.83,Math.sin(angle)*0.055]);bristle.rotation.z=Math.sin(angle)*0.13;}
    hand.userData.heldBroom=true;
  }
  const position = new THREE.Vector3(), orientation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  return {
    update(flying = false) {
      attachments.forEach(({group})=>{if(group.userData.heldBroom)group.visible=!flying;});
      avatar.object.updateWorldMatrix(true, true);inverse.copy(avatar.object.getWorldQuaternion(orientation)).invert();
      for (const item of attachments) {
        item.bone.getWorldPosition(position);item.group.position.copy(avatar.object.worldToLocal(position));
        item.bone.getWorldQuaternion(orientation);item.group.quaternion.copy(inverse).multiply(orientation).multiply(item.rest);
      }
    },
    dispose() { attachments.forEach(({ group }) => group.removeFromParent());owned.forEach(item => item.dispose()); },
  };
}
