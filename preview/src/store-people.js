import { applyOzFolk } from './oz-folk.js';
import { turnToward } from './gait.js';
import { storePersonId } from './store-encounters.js';
import * as THREE from 'three';
import { AVATAR_PROFILES, loadAvatarTemplate, instantiateAvatar } from './avatars.js';

// Boutique staff, guests and mannequins: posed clones of the generic CC0
// residents, tinted by role. No likeness of any real employee or shopper.
// Joint conventions measured on the shipped rigs: x pitches thighs, knees, spine
// and head; elbows flex on z; y turns. Angles are radians.
const POSES = {
  stand:  { head: [0.02, 0.12, 0] },
  attend: { upperarm_l: [0.15, -0.8, 0.2], upperarm_r: [0.15, 0.8, -0.2], lowerarm_l: [0, -0.6, 1.45], lowerarm_r: [0, 0.6, 1.45], head: [0.04, 0, 0] },
  greet:  { upperarm_r: [-0.55, 0, 0], lowerarm_r: [0, 0, 1.45], head: [0, 0.18, 0] },
  browse: { head: [0.3, 0.2, 0], spine_03: [0.1, 0, 0], upperarm_r: [-0.6, 0, 0], lowerarm_r: [0, 0, 0.75] },
  style:  { upperarm_l: [-0.7, 0, -0.35], upperarm_r: [-0.6, 0, 0.3], lowerarm_l: [0, 0, 1.0], lowerarm_r: [0, 0, 1.15], head: [0.3, 0, 0] },
  carry:  { upperarm_l: [-0.1, -0.45, 0.15], upperarm_r: [-0.1, 0.45, -0.15], lowerarm_l: [0, -0.4, 1.2], lowerarm_r: [0, 0.4, 1.2] },
  seated: { thigh_l: [1.45, 0, 0], thigh_r: [1.45, 0, 0], calf_l: [-1.4, 0, 0], calf_r: [-1.4, 0, 0], spine_03: [0.05, 0, 0], upperarm_l: [0.05, -0.3, 0.1], upperarm_r: [0.05, 0.3, -0.1], lowerarm_l: [0, -0.2, 0.9], lowerarm_r: [0, 0.2, 0.9] },
  pose:   { upperarm_r: [-0.15, 0, 0], lowerarm_r: [0, 0, 0.4], upperarm_l: [0.05, 0, -0.12], head: [-0.03, 0.22, 0] },
};
const STAFF_TINT = { fashion: '#2a2a2f', leather: '#2a2a2f', jewelry: '#1f2024', perfumery: '#2b2b30', optician: '#2b2b30', gallery: '#26262b', dining: '#1c1c1f', gelato: '#f0ece3', cinema: '#3a2b3a', salon: '#262629', wellness: '#3b4247' };
const GUEST_TINTS = ['#e0d6c8', '#8f8577', '#5f6672', '#b7a7a3', '#4a4f57', '#cbb8a0', '#7a6e66', '#d9d3cf'];
const MANNEQUIN_TINTS = { fashion: ['#f2ede5', '#1f1f22', '#b99c86'], leather: ['#efe9df', '#3b302b'], default: ['#f2ede5', '#2a2a2e'] };
const STAFF_PROFILES = { dining: ['man-workwear', 'woman-tailored'], gelato: ['woman-casual', 'man-casual'], salon: ['woman-daywear', 'man-casual'], wellness: ['man-workwear', 'woman-casual'], cinema: ['man-workwear', 'woman-casual'], default: ['woman-tailored', 'man-tailored'] };
const isSkin = name => /^(young|middleage|old)_/.test(name), isHair = name => /^(bob|short|ponytail|long|afro|curly)/.test(name), isEyes = name => /^brown/.test(name), isShoes = name => /^shoes/.test(name);

function profileFor(spot, theme, seed) {
  if (spot.role === 'staff') return (STAFF_PROFILES[theme] ?? STAFF_PROFILES.default)[seed % 2];
  if (spot.role === 'mannequin') return ['woman-tailored', 'man-tailored', 'woman-daywear'][seed % 3];
  return AVATAR_PROFILES[(seed * 5 + 1) % AVATAR_PROFILES.length];
}

function dress(avatar, spot, theme, seed) {
  for (const [original, material] of avatar.materials) {
    const name = original.name ?? '';
    if (spot.role === 'mannequin') {
      if (isSkin(name) || isEyes(name)) { material.map = null; material.color.set('#e6e1da'); material.roughness = 0.55; material.metalness = 0; material.needsUpdate = true; }
      else if (!isHair(name) && !isShoes(name)) { const tints = MANNEQUIN_TINTS[theme] ?? MANNEQUIN_TINTS.default; material.color.set(tints[seed % tints.length]); }
      continue;
    }
    if (isSkin(name) || isHair(name) || isEyes(name)) continue;
    if (isShoes(name)) { if (spot.role === 'staff') material.color.set('#2a2726'); continue; }
    material.color.set(spot.role === 'staff' ? (STAFF_TINT[theme] ?? STAFF_TINT.fashion) : GUEST_TINTS[seed % GUEST_TINTS.length]);
  }
  if (spot.role === 'mannequin') avatar.model.traverse(item => { if (item.isMesh && isHair(item.material?.name ?? '')) item.visible = false; });
}

export function buildStorePeople(rooms, { reducedMotion = false } = {}) {
  const group = new THREE.Group(); group.name = 'Boutique staff and guests';
  const figures = [], loads = [];
  let disposed = false, ready = 0, previousTime = null;
  const host = document.querySelector('#canvas-host');
  const adjustment = new THREE.Quaternion();
  const applyPose = (figure, t) => {
    const { avatar, pose, sway } = figure;
    for (const bone of avatar.bones) {
      bone.quaternion.copy(avatar.rest.get(bone));
      const reactionPose = figure.reaction ? { head: [-0.07,0,0], upperarm_r: [-0.65,0,0], lowerarm_r: [0,0,1.4] } : null;
      const angles = reactionPose?.[bone.name] ?? pose[bone.name];
      const axes = avatar.axes.get(bone);
      if (angles) for (const [index, axis] of ['x', 'y', 'z'].entries()) if (angles[index]) { adjustment.setFromAxisAngle(axes[axis], angles[index]); bone.quaternion.multiply(adjustment); }
      if (t === null) continue;
      const idle = bone.name === 'head' ? Math.sin(t * 0.9) * 0.02 : bone.name === 'spine_03' ? Math.sin(t * 1.4) * 0.008 : bone.name === 'lowerarm_r' && sway ? Math.sin(t * 1.7) * 0.03 : 0;
      if (idle) { adjustment.setFromAxisAngle(bone.name === 'lowerarm_r' ? axes.z : axes.x, idle); bone.quaternion.multiply(adjustment); }
    }
  };
  rooms.forEach(room => {
    const roomGroup = new THREE.Group();
    const [fx, fn] = room.facade;
    roomGroup.userData.anchor = new THREE.Vector3(fx, room.floor, -fn);
    roomGroup.userData.room = room;
    group.add(roomGroup);
    room.people.forEach((spot, spotIndex) => {
      const seed = (spot.seed ?? (room.index * 3 + spotIndex)) >>> 0;
      const profile = profileFor(spot, room.theme, seed);
      loads.push(loadAvatarTemplate(profile).then(source => {
        if (disposed) return;
        const targetHeight = profile.startsWith('woman') ? 1.64 + (seed % 4) * 0.025 : 1.75 + (seed % 4) * 0.03;
        const avatar = instantiateAvatar(source, { targetHeight, id: spot.role === 'mannequin' ? undefined : storePersonId(room, spotIndex) });
        dress(avatar, spot, room.theme, seed);
        applyOzFolk(avatar,storePersonId(room,spotIndex));
        const holder = new THREE.Group();
        const [east, north] = room.toWorld(spot.a, spot.d);
        const seated = spot.pose === 'seated';
        holder.position.set(east, room.floor + (seated ? (spot.seat ?? 0.46) - avatar.hipHeight : 0), -north);
        const [fa, fd] = spot.facing ?? [0, -1];
        const dirEast = room.right[0] * fa + room.inward[0] * fd, dirNorth = room.right[1] * fa + room.inward[1] * fd;
        holder.rotation.y = Math.atan2(dirEast, -dirNorth);
        // Posed figures never move, so ordinary frustum culling is safe and saves draw calls.
        // Sunlight rarely reaches them; skipping the shadow pass halves their cost.
        avatar.model.traverse(item => { if (item.isMesh) { item.frustumCulled = true; item.castShadow = false; } });
        holder.add(avatar.model);
        holder.userData.storeId = room.storeId; holder.userData.role = spot.role;
        avatar.model.traverse(item => { item.userData.storeId = room.storeId; item.userData.role = spot.role;if(spot.role==='mannequin')delete item.userData.localId; });
        roomGroup.add(holder);
        const figure = { id: spot.role === 'mannequin' ? null : storePersonId(room, spotIndex), heading: holder.rotation.y, holder, avatar, pose: POSES[spot.pose] ?? POSES.stand, sway: spot.role === 'staff' && spot.pose !== 'seated', role: spot.role, phase: seed * 0.61, animated: false };
        applyPose(figure, null);
        figures.push(figure); ready++;
        host.dataset.storePeopleReady = String(ready);
      }).catch(() => { if (!disposed) document.dispatchEvent(new CustomEvent('visualasseterror', { detail: { count: 1 } })); }));
    });
  });
  host.dataset.storePeopleReady = '0';
  host.dataset.storePeopleTotal = String(loads.length);
  group.userData.ready = Promise.allSettled(loads);
  group.userData.figures = figures;
  group.userData.update = (camera, now, state, visitor) => {
    const t = now / 1000, delta = previousTime === null ? 0 : (now - previousTime) / 1000;previousTime = now;
    for (const roomGroup of group.children) {
      const distance = roomGroup.userData.anchor.distanceTo(camera.position);
      // Whole rooms beyond 55 m skip their people entirely; nearby ones idle.
      roomGroup.visible = distance < 32;
    }
    for (const figure of figures) {
      if (!figure.holder.parent?.visible) continue;
      const local = state?.locals.find(local => local.id === figure.id);
      figure.reaction = local?.visitorReaction;
      const attending = visitor && (figure.reaction || state?.selectedId === figure.id);
      // Seated figures retain the chair-facing body; their head/arms can react.
      if (figure.pose !== POSES.seated) figure.holder.rotation.y = turnToward(figure.holder.rotation.y, attending ? Math.atan2(visitor[0] - figure.holder.position.x, -visitor[1] - figure.holder.position.z) : figure.heading, delta);
      const near = figure.holder.position.distanceToSquared(camera.position) < 16 * 16;
      if (near && !reducedMotion && figure.role !== 'mannequin') { applyPose(figure, t + figure.phase); figure.animated = true; }
      else if (figure.animated) { applyPose(figure, null); figure.animated = false; }
    }
  };
  group.userData.dispose = () => {
    disposed = true;
    for (const figure of figures) figure.avatar.dispose();
    figures.length = 0; group.clear();
  };
  return group;
}
