import { createConversationGaze } from './conversation-gaze.js';
import { createConversationMotion } from './conversation-motion.js';
import { createConversationBody } from './conversation-body.js';
import { createFacialMotion } from './facial-motion.js';
import { SuspendedStationGroup } from './suspended-station-group.js';
import { createWishVisual } from './wish-effects.js';
import { applyResidentStyle } from './resident-style.js';
import { applyResidentHairstyle } from './resident-hairstyle.js';
import { residentFaceFor } from './resident-face.js';
import { staffWorkPose, blendStationPose } from './store-work.js';
import { createFootPlacement, applyLegIK } from './foot-placement.js';
import { createWorkerTask } from './work-props.js';
import { storePersonId } from './store-encounters.js';
import { includeSharedStorePerson } from './shared-population.js';
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

export function buildStorePeople(rooms, { reducedMotion = false, sharedPopulation = false } = {}) {
  const group = new THREE.Group(); group.name = 'Boutique staff and guests';
  const figures = [], loads = [];
  let disposed = false, ready = 0, previousTime = null;
  const host = document.querySelector('#canvas-host');
  const adjustment = new THREE.Quaternion(),gazeOrigin=new THREE.Vector3();
  const applyPose = (figure, t) => {
    const { avatar, sway } = figure;
    const work = figure.role === 'staff' && t !== null ? staffWorkPose(figure.theme,figure.workTime) : {};
    const pose = blendStationPose(figure.pose,work,figure.attention,figure.lookYaw,figure.lookPitch);
    for (const bone of avatar.bones) {
      bone.quaternion.copy(avatar.rest.get(bone));
      const angles = pose[bone.name];
      const axes = avatar.axes.get(bone);
      if (angles) for (const [index, axis] of ['x', 'y', 'z'].entries()) if (angles[index]) { adjustment.setFromAxisAngle(axes[axis], angles[index]); bone.quaternion.multiply(adjustment); }
      if (t === null) continue;
      const idle = bone.name === 'head' ? figure.conversationPose?.pitch??0 : bone.name === 'spine_03' ? Math.sin(t * 1.4) * 0.008 : bone.name === 'lowerarm_r' && sway ? Math.sin(t * 1.7) * 0.03 : 0;
      if (idle) { adjustment.setFromAxisAngle(bone.name === 'lowerarm_r' ? axes.z : axes.x, idle); bone.quaternion.multiply(adjustment); }
      if(bone.name==='head'&&figure.conversationPose?.roll) {adjustment.setFromAxisAngle(axes.z,figure.conversationPose.roll);bone.quaternion.multiply(adjustment);}
    }
    // Workers keep both hands available to their existing contact solver.
    // The torso can acknowledge a visitor without releasing a tray or tool.
    if(t!==null)figure.conversationBody.apply(figure.conversationPose,{hands:!figure.task});
    if (figure.seatedFeet && figure.wishKind !== 'flight') {
      figure.holder.updateWorldMatrix(true,true);
      const forward=new THREE.Vector3(0,0,1).applyQuaternion(figure.holder.getWorldQuaternion(new THREE.Quaternion()));
      for(const leg of figure.seatedFeet) {
        const pole=leg.thigh.getWorldPosition(new THREE.Vector3()).add(forward);
        leg.error=applyLegIK(leg,leg.target,pole);
      }
    }
    figure.task?.update(figure.workTime,figure.attention);
  };
  rooms.forEach(room => {
    const roomGroup = new SuspendedStationGroup();
    const [fx, fn] = room.facade;
    roomGroup.userData.anchor = new THREE.Vector3(fx, room.floor, -fn);
    roomGroup.userData.room = room;
    group.add(roomGroup);
    room.people.forEach((spot, spotIndex) => {
      if (sharedPopulation && !includeSharedStorePerson(room, spot, spotIndex)) return;
      const seed = (spot.seed ?? (room.index * 3 + spotIndex)) >>> 0;
      const profile = profileFor(spot, room.theme, seed);
      loads.push(loadAvatarTemplate(profile).then(async source => {
        if (disposed) return;
        const targetHeight = profile.startsWith('woman') ? 1.64 + (seed % 4) * 0.025 : 1.75 + (seed % 4) * 0.03;
        // Staff and guests get their own faces, like street residents; mannequins keep the rig's.
        const id = spot.role === 'mannequin' ? undefined : storePersonId(room, spotIndex);
        const avatar = instantiateAvatar(source, { targetHeight, id, face: id === undefined ? undefined : residentFaceFor(id) });
        dress(avatar, spot, room.theme, seed);
        if(spot.role!=='mannequin') {
          try { await applyResidentHairstyle(avatar,storePersonId(room,spotIndex),profile,loadAvatarTemplate); }
          catch(error) { avatar.dispose(); throw error; }
          if (disposed) { avatar.dispose(); return; }
          applyResidentStyle(avatar,storePersonId(room,spotIndex),{staff:spot.role==='staff'});
        }
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
        if(spot.role!=='mannequin')holder.userData.localId=storePersonId(room,spotIndex);
        avatar.model.traverse(item => { item.userData.storeId = room.storeId; item.userData.role = spot.role;if(spot.role==='mannequin')delete item.userData.localId; });
        roomGroup.add(holder);
        const figure = { id: spot.role === 'mannequin' ? null : storePersonId(room, spotIndex), heading: holder.rotation.y, groundOffset:room.floor-holder.position.y, holder, avatar, pose: POSES[spot.pose] ?? POSES.stand, sway: spot.role === 'staff' && spot.pose !== 'seated', role: spot.role, theme:room.theme, phase: seed * 0.61, workTime:seed*0.61, attention:0, lookYaw:0, lookPitch:0, gaze:createConversationGaze(), motionTime:seed*0.61, suspended:true };
        figure.conversation=createConversationMotion({seed:figure.id,reducedMotion});
        figure.conversationBody=createConversationBody(avatar);
        figure.face=createFacialMotion(avatar.model,{seed:figure.id,reducedMotion});
        if (seated) {
          figure.seatedFeet=createFootPlacement(avatar.model,holder).legs;
          for(const leg of figure.seatedFeet) {
            const target=leg.rest.clone();target.z+=leg.upperLength*0.85;
            leg.target=holder.localToWorld(target);leg.target.y=room.floor+leg.rest.y;
            leg.orientation=leg.foot.getWorldQuaternion(new THREE.Quaternion());
          }
        }
        if(spot.role==='staff')figure.task=createWorkerTask(avatar,holder,room,spot);
        applyPose(figure, reducedMotion || spot.role==='mannequin' ? null : figure.motionTime);
        figures.push(figure); ready++;
        host.dataset.storePeopleReady = String(ready);
      }).catch(() => { if (!disposed) document.dispatchEvent(new CustomEvent('visualasseterror', { detail: { count: 1 } })); }));
    });
  });
  host.dataset.storePeopleReady = '0';
  host.dataset.storePeopleTotal = String(loads.length);
  group.userData.ready = Promise.allSettled(loads);
  group.userData.figures = figures;
  group.userData.update = (camera, now, state, visitor, speakingId = null) => {
    const delta = previousTime === null ? 0 : (now - previousTime) / 1000;previousTime = now;
    for (const roomGroup of group.children) {
      const distance = roomGroup.userData.anchor.distanceTo(camera.position);
      // Whole rooms beyond 32 m skip their people entirely; nearby ones idle.
      roomGroup.visible = distance < 32;
    }
    for (const figure of figures) {
      // Display mannequins have no encounter identity and never attend a visitor.
      if (figure.role==='mannequin' || !figure.holder.parent?.visible) {figure.suspended=true;continue;}
      const local = state?.locals.find(local => local.id === figure.id);
      // Facial life continues while a spell pauses the worker's task and pose.
      // Hidden rooms still skip this clock, and long frame gaps cannot catch up.
      figure.face.update(delta);
      figure.wishKind = local?.wish?.kind;
      if (figure.task) figure.task.object.visible = figure.wishKind !== 'dog';
      if (local?.wish && !figure.wishVisual) figure.wishVisual = createWishVisual(figure.holder, figure.avatar.model, { groundOffset:figure.groundOffset });
      if (figure.wishVisual) {
        figure.wishVisual.update(local?.wish, { reducedMotion });
        if (!local?.wish) { figure.wishVisual.dispose(); figure.wishVisual = null; }
      }
      const attending = Boolean(visitor && figure.id && state?.selectedId === figure.id);
      const near = figure.holder.position.distanceToSquared(camera.position) < 16 * 16;
      // Keep the last displayed pose and both clocks together outside the motion
      // range. Resetting the pose while its task clock runs causes a return snap.
      if((!near||reducedMotion)&&!attending&&figure.attention<=.001){figure.suspended=true;continue;}
      const dt=figure.suspended?0:Math.min(.1,Math.max(0,delta));figure.suspended=false;
      figure.conversationPose=figure.conversation.update(dt,{attending,speaking:speakingId===figure.id,gesturing:!local?.wish&&!local?.wishDisruption});
      const smoothing = 1-Math.exp(-5*dt);
      figure.attention += ((attending?1:0)-figure.attention)*smoothing;
      const head=figure.avatar.model.getObjectByName('head');
      (head??figure.holder).getWorldPosition(gazeOrigin);
      const gaze=figure.gaze.update(gazeOrigin.toArray(),attending?[visitor[0],visitor[2],-visitor[1]]:null,figure.heading,dt);
      figure.lookYaw=gaze.yaw;figure.lookPitch=gaze.pitch;
      if(near&&!reducedMotion) {
        figure.motionTime+=dt;
        if(!attending && !local?.wish && !local?.wishDisruption)figure.workTime+=dt;
      }
      applyPose(figure,reducedMotion?null:figure.motionTime);
      figure.avatar.eyes.update(attending?[visitor[0],visitor[2],-visitor[1]]:null,dt);
    }
  };
  group.userData.dispose = () => {
    disposed = true;
    for (const figure of figures) {figure.wishVisual?.dispose();figure.task?.dispose();figure.avatar.dispose();}
    figures.length = 0; group.clear();
  };
  return group;
}
