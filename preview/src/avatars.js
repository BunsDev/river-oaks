import { shareAvatarSkeletons } from './avatar-skeletons.js';
import { createConversationGaze } from './conversation-gaze.js';
import { createConversationMotion } from './conversation-motion.js';
import { createFacialMotion } from './facial-motion.js';
import { createEyeTracking } from './eye-tracking.js';
import { registerSpeechAvatar, speechAvatarPose } from './speech-avatar.js';
import { applyResidentStyle } from './resident-style.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createUpperBodyGait } from './upper-body-gait.js';
import { createResidentGestures } from './resident-gestures.js';
import { relaxResidentArms } from './avatar-stance.js';
import { createFootPlacement, applyLegIK } from './foot-placement.js';
import { stabilizeShoeSoles } from './shoe-skinning.js';

export const AVATAR_PROFILES = ['woman-casual','man-casual','woman-tailored','man-tailored','woman-daywear','man-workwear'];
const cache = new Map();
const loader = new GLTFLoader();
let kitAssets=null;
function supplyBag() {
  if(!kitAssets) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#8b9174';ctx.fillRect(0,0,256,256);
    ctx.strokeStyle='#69745b66';ctx.lineWidth=1;
    for(let i=0;i<256;i+=3) {ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();}
    ctx.strokeStyle='#c4c3a4';ctx.lineWidth=2;ctx.strokeRect(10,10,236,236);
    ctx.fillStyle='#dedbc2';ctx.fillRect(65,92,126,72);ctx.fillStyle='#424d3a';ctx.font='600 34px sans-serif';ctx.textAlign='center';ctx.fillText('KIT',128,139);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    kitAssets={body:new THREE.BoxGeometry(0.26,0.24,0.12),handle:new THREE.TorusGeometry(0.1,0.008,6,24,Math.PI),fabric:new THREE.MeshStandardMaterial({map:texture,roughness:0.95}),strap:new THREE.MeshStandardMaterial({color:'#656e52',roughness:1})};
  }
  const group=new THREE.Group(),body=new THREE.Mesh(kitAssets.body,kitAssets.fabric),handle=new THREE.Mesh(kitAssets.handle,kitAssets.strap);
  body.position.y=-0.22;handle.position.y=-0.1;body.castShadow=handle.castShadow=true;body.receiveShadow=true;
  group.add(body,handle);group.visible=false;return group;
}

export function avatarProfile(index) {
  // Generic appearances for cultural portrayals, never scans or likenesses of them.
  return ({20:'woman-tailored',21:'woman-casual',22:'man-tailored',23:'woman-daywear'})[index] ?? AVATAR_PROFILES[index % AVATAR_PROFILES.length];
}

function template(profile) {
  if (!cache.has(profile)) {
    const promise = loader.loadAsync(`/assets/characters/${profile}.glb`).then(gltf => {
      gltf.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const height = bounds.max.y-bounds.min.y;
      if (!Number.isFinite(height) || height < 1 || height > 2.5) throw new Error('Invalid character scale');
      return { scene:gltf.scene, height, floor:bounds.min.y, profile };
    }).catch(error => { cache.delete(profile); throw error; });
    cache.set(profile,promise);
  }
  return cache.get(profile);
}

const BONES=['head','neck_01','spine_01','spine_02','spine_03','clavicle_l','clavicle_r','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r','hand_l','hand_r','thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r','ball_l','ball_r'];
export function loadAvatarTemplate(profile) { return template(profile); }

// SkeletonUtils.clone gives every skinned mesh its own Skeleton, even when the
// body, clothes and hair are bound to the same bones. Each copy recomputes and
// uploads identical bone matrices every frame, so meshes bound to the same
// bones with the same inverse bind matrices share one skeleton again.
export function shareSkeletons(model) { return [...shareAvatarSkeletons(model)]; }

// One independently skinned clone of a cached template. Joint axes are expressed
// in each bone's rest frame so poses can be authored in the character's terms:
// x pitches forward/back, y turns, z tilts sideways.
export function instantiateAvatar(source, { targetHeight, id, armSpread }) {
  const model = clone(source.scene), materials = new Map(), skeletons = shareAvatarSkeletons(model);
  const scale = targetHeight/source.height;
  model.scale.setScalar(scale); model.position.y=-source.floor*scale;
  model.traverse(item => {
    if (id !== undefined) item.userData.localId=id;
    if (!item.isMesh) return;
    item.castShadow=item.receiveShadow=true;
    // Skinned bounds change with poses; the containing object has a distance gate.
    item.frustumCulled=false;
    const adapt = original => {
      if (materials.has(original)) return materials.get(original);
      const material=original.clone();
      material.envMapIntensity=0.8;
      if (material.transparent) { material.alphaTest=0.4; material.transparent=false; material.depthWrite=true; material.side=THREE.DoubleSide; }
      materials.set(original,material); return material;
    };
    item.material=Array.isArray(item.material) ? item.material.map(adapt) : adapt(item.material);
  });
  const footwear=stabilizeShoeSoles(model);
  // Relax the imported arm pose before the rest quaternions are captured;
  // update() restores `rest` every frame, so anything applied later is undone.
  relaxResidentArms(model, armSpread);
  const bones=BONES.map(name=>model.getObjectByName(name)).filter(Boolean);
  const rest=new Map(bones.map(bone=>[bone,bone.quaternion.clone()]));
  model.updateMatrixWorld(true);
  const world=new THREE.Quaternion();
  const axes=new Map(bones.map(bone=>{
    const inverse=bone.getWorldQuaternion(world).invert();
    return [bone,{x:new THREE.Vector3(1,0,0).applyQuaternion(inverse),y:new THREE.Vector3(0,1,0).applyQuaternion(inverse),z:new THREE.Vector3(0,0,1).applyQuaternion(inverse)}];
  }));
  const hipHeight=model.getObjectByName('thigh_l')?.getWorldPosition(new THREE.Vector3()).y ?? targetHeight*0.52;
  const eyes=createEyeTracking(model);
  const avatar = {
    model, bones, rest, axes, materials, skeletons, hipHeight, source, eyes,
    get speechPose() { return speechAvatarPose(id); },
    dispose() { unregisterSpeech(); eyes.dispose(); for (const geometry of footwear) geometry.dispose(); for (const skeleton of skeletons) skeleton.dispose(); for (const material of materials.values()) material.dispose(); },
  };
  const unregisterSpeech=registerSpeechAvatar(id,avatar);
  return avatar;
}

export async function loadResidentAvatar(index, id, profileOverride, { folk = true } = {}) {
  const profile = profileOverride ?? avatarProfile(index), source = await template(profile);
  const targetHeight = profile === 'jevica' ? 1.685 : profile === 'prince-jev' ? 1.74 : profile.startsWith('woman') ? 1.66+(index%3)*0.025 : 1.78+(index%3)*0.025;
  const avatar = instantiateAvatar(source, { targetHeight, id, armSpread:profile==='jevica'?0.32:undefined });
  const { model, bones, rest } = avatar;
  if(id !== 'player' && folk) applyResidentStyle(avatar,id);
  const root = new THREE.Group();
  root.add(model);
  const kit=supplyBag(),hand=model.getObjectByName('hand_r');root.add(kit);
  const adjustment = new THREE.Quaternion();
  const feet = createFootPlacement(model, root), baseY = model.position.y;
  const seatedShoes=new Map(feet.legs.map(leg=>[leg,leg.foot.getWorldQuaternion(new THREE.Quaternion())]));
  const noMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gaze=createConversationGaze(),gazeOrigin=new THREE.Vector3(),gazeRotation=new THREE.Quaternion(),gazeForward=new THREE.Vector3();
  const gazeHead=model.getObjectByName('head'),gazeNeck=model.getObjectByName('neck_01');
  const gestures=createResidentGestures({reducedMotion:noMotion});
  const conversation=createConversationMotion({seed:id??index,reducedMotion:noMotion});
  const face=createFacialMotion(model,{seed:id??index,reducedMotion:noMotion});
  const upperBody=createUpperBodyGait(avatar,root,{reducedMotion:noMotion,armSwing:profile==='jevica'?.34:.42,abduct:profile==='jevica'?.07:0});
  let previousTime=null,walkingSpeed=0;
  return {
    object:root, profile, rig:avatar,
    // The visibility owner explicitly suspends the clock, even for brief culls.
    suspend() {previousTime=null;},
    get carrying() {return kit.visible;},
    get conversationPose() {return conversation.pose;},
    get facePose() {return face.pose;},
    get feet() {return feet.legs;},
    update(now, action, speaking, locomotion, groundAt = () => root.getWorldPosition(new THREE.Vector3()).y, lookTarget = null, {conversing=false} = {}) {
      const t=now/1000+index*0.7;
      const elapsed=previousTime===null?0:Math.max(0,(now-previousTime)/1000);
      const dt=Math.min(0.08,elapsed);previousTime=now;
      face.update(elapsed);
      walkingSpeed+=((locomotion?.speed ?? 0)-walkingSpeed)*(1-Math.exp(-18*dt));
      const gesture=gestures.update(action,elapsed,t);
      const conversationPose=conversation.update(elapsed,{attending:(id!=='player'||conversing)&&Boolean(lookTarget)&&action!=='startled',speaking});
      const strength = Math.min(1,walkingSpeed/0.65);
      // Let leg reach determine pelvis lowering; a fixed walking drop keeps
      // the supporting knee crouched even directly beneath the body.
      model.position.y = baseY - 0.004*strength;
      for (const bone of bones) {
        bone.quaternion.copy(rest.get(bone));
        if(noMotion && !locomotion?.speed) continue;
        const angle=bone.name==='head' ? conversationPose.pitch
          : bone.name==='spine_03' ? Math.sin(t*1.3)*0.006 : 0;
        adjustment.setFromAxisAngle(avatar.axes.get(bone)[bone.name.startsWith('lowerarm') ? 'z' : 'x'],angle); bone.quaternion.multiply(adjustment);
        if(bone.name==='head') {adjustment.setFromAxisAngle(avatar.axes.get(bone).z,conversationPose.roll);bone.quaternion.multiply(adjustment);}
      }
      if(!locomotion?.flying&&!locomotion?.riding)feet.update(dt,locomotion,groundAt);
      upperBody.update(dt,locomotion?.riding?0:walkingSpeed,feet.legs,{flying:locomotion?.flying||locomotion?.riding,carrying:Boolean(locomotion?.visitId||locomotion?.carrying),casting:action==='force'});
      for(const bone of bones) {
        const pose=gesture[bone.name];if(!pose)continue;
        for(const [i,axis] of ['x','y','z'].entries())if(pose[i]){adjustment.setFromAxisAngle(avatar.axes.get(bone)[axis],pose[i]);bone.quaternion.multiply(adjustment);}
      }
      if(gazeHead) {
        gazeHead.getWorldPosition(gazeOrigin);
        root.getWorldQuaternion(gazeRotation);
        gazeForward.set(0,0,1).applyQuaternion(gazeRotation);
        const attention=gaze.update(gazeOrigin.toArray(),lookTarget,Math.atan2(gazeForward.x,gazeForward.z),elapsed);
        for(const [bone,weight] of [[gazeNeck,.3],[gazeHead,.7]])if(bone) {
          adjustment.setFromAxisAngle(avatar.axes.get(bone).x,attention.pitch*weight);bone.quaternion.multiply(adjustment);
          adjustment.setFromAxisAngle(avatar.axes.get(bone).y,attention.yaw*weight);bone.quaternion.multiply(adjustment);
        }
      }
      if(locomotion?.riding) {
        const seated={thigh_l:[0,0,0],thigh_r:[0,0,0],calf_l:[0,0,0],calf_r:[0,0,0],foot_l:[0,0,0],foot_r:[0,0,0],spine_03:[.035,0,0],upperarm_l:[.20,0,.025],upperarm_r:[.20,0,-.025],lowerarm_l:[0,0,.60],lowerarm_r:[0,0,.60]};
        if(locomotion.ridingKind==='motorcycle'&&locomotion.ridingDriver) {
          const motion=noMotion?0:Math.min(1,Math.abs(locomotion.ridingSpeed??0)/6);
          const lean=noMotion?0:Math.max(-.05,Math.min(.05,(locomotion.ridingSteering??0)*.1));
          seated.spine_01=[.055+motion*.018,0,lean*.4];
          seated.spine_02=[.045+motion*.012,0,lean*.35];
          seated.spine_03=[.025+(noMotion?0:Math.sin(t*1.4)*.003),0,lean*.25];
        }
        model.position.y=baseY;
        for(const bone of bones)if(seated[bone.name]) {
          bone.quaternion.copy(rest.get(bone));
          seated[bone.name].forEach((angle,i)=>{adjustment.setFromAxisAngle(avatar.axes.get(bone)[['x','y','z'][i]],angle);bone.quaternion.multiply(adjustment);});
        }
        root.updateWorldMatrix(true,true);
        const worldRotation=root.getWorldQuaternion(new THREE.Quaternion()),forward=new THREE.Vector3(0,0,1).applyQuaternion(worldRotation);
        const board=avatar.hipHeight-.025-(locomotion.seatToFloor??.5075);
        for(const leg of feet.legs) {
          leg.ikOrientation=worldRotation.clone().multiply(seatedShoes.get(leg));
          const scale=leg.foot.getWorldScale(new THREE.Vector3());
          const bottom=Math.min(...leg.sole.map(p=>p.clone().multiply(scale).applyQuaternion(seatedShoes.get(leg)).y));
          const target=root.localToWorld(new THREE.Vector3(locomotion.ridingKind==='motorcycle'?Math.sign(leg.rest.x)*.32:leg.rest.x,board-bottom,locomotion.ridingKind==='motorcycle'?.26:.44));
          const pole=leg.thigh.getWorldPosition(new THREE.Vector3()).add(forward);
          if(locomotion.ridingKind==='motorcycle')pole.add(new THREE.Vector3(Math.sign(leg.rest.x)*.28,0,0).applyQuaternion(worldRotation));
          leg.error=applyLegIK(leg,target,pole);
        }
      }
      if(locomotion?.superheroFlight) {
        const blend=Math.min(1,locomotion.superheroFlight),glide=THREE.MathUtils.clamp(locomotion.flightGlide??1,0,1);
        // Hovering: a relaxed, asymmetric hang with one knee drawn up and the feet
        // pointed. Gliding: legs stream back nearly straight and the head lifts to
        // look ahead once the body is horizontal. Rig signs: thigh -x flexes the
        // hip, calf +x bends the knee, foot +x points the toes.
        const hover={thigh_l:[-.42,0,-.04],calf_l:[.95,0,0],foot_l:[.38,0,0],thigh_r:[.06,0,.03],calf_r:[.36,0,0],foot_r:[.44,0,0]};
        const stream={thigh_l:[-.06,0,-.035],calf_l:[.12,0,0],foot_l:[.52,0,0],thigh_r:[.08,0,.035],calf_r:[.24,0,0],foot_r:[.52,0,0],head:[-.55,0,0],neck_01:[-.18,0,0]};
        for(const bone of bones) {
          const a=hover[bone.name],b=stream[bone.name];if(!a&&!b)continue;
          const target=rest.get(bone).clone();
          [0,1,2].forEach(i=>{const angle=(a?.[i]??0)*(1-glide)+(b?.[i]??0)*glide;if(angle){adjustment.setFromAxisAngle(avatar.axes.get(bone)[['x','y','z'][i]],angle);target.multiply(adjustment);}});
          bone.quaternion.slerp(target,blend);
        }
      }
      else if(locomotion?.flying&&!locomotion?.riding) {
        // Floating in her bubble: poised rather than standing at attention. One
        // knee eases forward, the other trails with pointed feet; the free arm
        // floats away from her side and the wand arm is carried forward. Moving,
        // she leans into the travel and her arms and trailing leg stream back.
        // Rig signs: thigh -x flexes the hip, calf +x bends the knee, foot +x
        // points the toes, upper arm -x swings forward and +z (left) / -z
        // (right) lifts it away from the body, forearm -x bends the elbow,
        // spine_02 +x leans forward.
        const m=noMotion?0:THREE.MathUtils.clamp((locomotion.flightSpeed??0)/5,0,1),drift=noMotion?0:Math.sin(t*.9),sway=noMotion?0:Math.sin(t*.55+1.3);
        const float={
          thigh_l:[-.14-.03*sway+.04*m,0,-.02],calf_l:[.30+.04*sway,0,0],foot_l:[.32,0,0],
          thigh_r:[.08+.12*m,0,.02],calf_r:[.40+.1*m,0,0],foot_r:[.42,0,0],
          spine_02:[-.02+.2*m,0,0],spine_03:[.06*m,0,0],
          upperarm_l:[-.10+.22*m,0,.26+.03*drift],lowerarm_l:[-.22,0,0],
          // The wand rides fixed in the hand: turn the wrist back as the elbow bends
          // so it points forward and up instead of over her shoulder.
          upperarm_r:[-.48+.16*m,0,-.08-.03*drift],lowerarm_r:[-.95,0,0],hand_r:[.85,0,0],
        };
        for(const bone of bones)if(float[bone.name]) float[bone.name].forEach((angle,i)=>{if(angle){adjustment.setFromAxisAngle(avatar.axes.get(bone)[['x','y','z'][i]],angle);bone.quaternion.multiply(adjustment);}});
        // A slow, shallow bob: buoyant, not bouncing.
        model.position.y+=noMotion?0:.022*Math.sin(t*1.15);
      }
      avatar.eyes.update(lookTarget,elapsed);
      kit.visible=Boolean(locomotion?.visitId && hand);
      if(kit.visible) {root.updateWorldMatrix(true,true);hand.getWorldPosition(kit.position);root.worldToLocal(kit.position);}
    },
    dispose() { upperBody.dispose(); avatar.dispose(); },
  };
}
