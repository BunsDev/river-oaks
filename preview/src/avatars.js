import { applyOzFolk } from './oz-folk.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { residentStride } from './gait.js';
import { relaxResidentArms } from './avatar-stance.js';
import { createFootPlacement } from './foot-placement.js';

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
      return { scene:gltf.scene, height, floor:bounds.min.y };
    }).catch(error => { cache.delete(profile); throw error; });
    cache.set(profile,promise);
  }
  return cache.get(profile);
}

const BONES=['head','neck_01','spine_01','spine_02','spine_03','clavicle_l','clavicle_r','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r','hand_l','hand_r','thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r'];
export function loadAvatarTemplate(profile) { return template(profile); }

// One independently skinned clone of a cached template. Joint axes are expressed
// in each bone's rest frame so poses can be authored in the character's terms:
// x pitches forward/back, y turns, z tilts sideways.
export function instantiateAvatar(source, { targetHeight, id }) {
  const model = clone(source.scene), materials = new Map(), skeletons = new Set();
  const scale = targetHeight/source.height;
  model.scale.setScalar(scale); model.position.y=-source.floor*scale;
  model.traverse(item => {
    if (id !== undefined) item.userData.localId=id;
    if (!item.isMesh) return;
    item.castShadow=item.receiveShadow=true;
    // Skinned bounds change with poses; the containing object has a distance gate.
    item.frustumCulled=false;
    if (item.skeleton) skeletons.add(item.skeleton);
    const adapt = original => {
      if (materials.has(original)) return materials.get(original);
      const material=original.clone();
      material.envMapIntensity=0.8;
      if (material.transparent) { material.alphaTest=0.4; material.transparent=false; material.depthWrite=true; material.side=THREE.DoubleSide; }
      materials.set(original,material); return material;
    };
    item.material=Array.isArray(item.material) ? item.material.map(adapt) : adapt(item.material);
  });
  // Relax the imported arm pose before the rest quaternions are captured;
  // update() restores `rest` every frame, so anything applied later is undone.
  relaxResidentArms(model);
  const bones=BONES.map(name=>model.getObjectByName(name)).filter(Boolean);
  const rest=new Map(bones.map(bone=>[bone,bone.quaternion.clone()]));
  model.updateMatrixWorld(true);
  const world=new THREE.Quaternion();
  const axes=new Map(bones.map(bone=>{
    const inverse=bone.getWorldQuaternion(world).invert();
    return [bone,{x:new THREE.Vector3(1,0,0).applyQuaternion(inverse),y:new THREE.Vector3(0,1,0).applyQuaternion(inverse),z:new THREE.Vector3(0,0,1).applyQuaternion(inverse)}];
  }));
  const hipHeight=model.getObjectByName('thigh_l')?.getWorldPosition(new THREE.Vector3()).y ?? targetHeight*0.52;
  return {
    model, bones, rest, axes, materials, skeletons, hipHeight, source,
    dispose() { for (const skeleton of skeletons) skeleton.dispose(); for (const material of materials.values()) material.dispose(); },
  };
}

export async function loadResidentAvatar(index, id, profileOverride) {
  const profile = profileOverride ?? avatarProfile(index), source = await template(profile);
  const targetHeight = profile === 'jevica' ? 1.685 : profile.startsWith('woman') ? 1.66+(index%3)*0.025 : 1.78+(index%3)*0.025;
  const avatar = instantiateAvatar(source, { targetHeight, id });
  const { model, bones, rest } = avatar;
  if(id !== 'player') applyOzFolk(avatar,id);
  const root = new THREE.Group();
  root.add(model);
  const kit=supplyBag(),hand=model.getObjectByName('hand_r');root.add(kit);
  const adjustment = new THREE.Quaternion();
  const feet = createFootPlacement(model, root), baseY = model.position.y;
  const legReach = feet.legs[0] ? feet.legs[0].upperLength + feet.legs[0].lowerLength : 0.85;
  const walkingDrop = legReach - Math.sqrt(Math.max(0,legReach*legReach-0.42*0.42)) + 0.025;
  // The exported joints have different local axes. Rotate gait around the
  // character's horizontal axis, expressed in each joint's rest coordinates.
  const gaitAxes=new Map(bones.map(bone=>[bone,avatar.axes.get(bone).x]));
  const noMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previousTime=null,walkingSpeed=0;
  return {
    object:root, profile, rig:avatar,
    get carrying() {return kit.visible;},
    get feet() {return feet.legs;},
    update(now, action, speaking, locomotion, groundAt = () => root.getWorldPosition(new THREE.Vector3()).y) {
      const t=now/1000+index*0.7;
      const dt=previousTime===null?0:Math.min(0.08,Math.max(0,(now-previousTime)/1000));previousTime=now;
      walkingSpeed+=((locomotion?.speed ?? 0)-walkingSpeed)*(1-Math.exp(-18*dt));
      const gait=residentStride(locomotion?.distance ?? 0,walkingSpeed);
      const strength = Math.min(1,walkingSpeed/0.65);
      model.position.y = baseY - 0.018 - walkingDrop*strength + Math.cos((locomotion?.distance ?? 0)/1.1*Math.PI*4)*0.008*strength;
      for (const bone of bones) {
        bone.quaternion.copy(rest.get(bone));
        if(noMotion && !locomotion?.speed) continue;
        if(gait[bone.name] && !/^(thigh|calf|foot)_/.test(bone.name)) {adjustment.setFromAxisAngle(gaitAxes.get(bone),gait[bone.name]);bone.quaternion.multiply(adjustment);}
        const angle=bone.name==='head' ? Math.sin(t*(speaking?4:0.7))*(speaking?0.025:0.008)
          : bone.name==='spine_03' ? Math.sin(t*1.3)*0.006
          : bone.name==='lowerarm_r' && action==='greet' ? -0.32+Math.sin(t*2)*0.025 : 0;
        adjustment.setFromAxisAngle(avatar.axes.get(bone)[bone.name.startsWith('lowerarm') ? 'z' : 'x'],angle); bone.quaternion.multiply(adjustment);
      }
      if (['amazed','startled','enchanted'].includes(action) && !noMotion) {
        const startled = action === 'startled';
        const poses = { upperarm_r: [-0.7,0,0], lowerarm_r: [0,0,1.35], upperarm_l: [startled?-0.7:-0.25,0,0], lowerarm_l: [0,0,startled?1.35:0.7], head: [startled?-0.1:0.04,0,0] };
        for (const bone of bones) {
          const pose=poses[bone.name];if(!pose)continue;
          for (const [i,axis] of ['x','y','z'].entries()) if(pose[i]) {adjustment.setFromAxisAngle(avatar.axes.get(bone)[axis],pose[i]);bone.quaternion.multiply(adjustment);}
        }
      }
      if(locomotion?.flying) {
        if(locomotion.vehicle==='witch') for(const bone of bones) {
          const angle=bone.name.startsWith('thigh_')?1.1:bone.name.startsWith('calf_')?-1.25:bone.name.startsWith('upperarm_')?-0.6:0;
          if(angle){adjustment.setFromAxisAngle(avatar.axes.get(bone).x,angle);bone.quaternion.multiply(adjustment);}
        }
      } else feet.update(dt, locomotion, groundAt);
      kit.visible=Boolean(locomotion?.visitId && hand);
      if(kit.visible) {root.updateWorldMatrix(true,true);hand.getWorldPosition(kit.position);root.worldToLocal(kit.position);}
    },
    dispose() { avatar.dispose(); },
  };
}
