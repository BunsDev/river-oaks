import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { residentStride } from './gait.js';

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

export async function loadResidentAvatar(index, id) {
  const profile = avatarProfile(index), source = await template(profile);
  const root = new THREE.Group(), model = clone(source.scene), materials = new Map(), skeletons = new Set();
  const targetHeight = profile.startsWith('woman') ? 1.66+(index%3)*0.025 : 1.78+(index%3)*0.025;
  const scale = targetHeight/source.height;
  model.scale.setScalar(scale); model.position.y=-source.floor*scale;
  model.traverse(item => {
    item.userData.localId=id;
    if (!item.isMesh) return;
    item.castShadow=item.receiveShadow=true;
    // Skinned bounds change with poses; the containing resident has a distance gate.
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
  root.add(model);
  const kit=supplyBag(),hand=model.getObjectByName('hand_r');root.add(kit);
  const bones=['head','spine_03','upperarm_l','upperarm_r','lowerarm_r','thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r'].map(name=>model.getObjectByName(name)).filter(Boolean);
  const rest=new Map(bones.map(bone=>[bone,bone.quaternion.clone()]));
  const adjustment = new THREE.Quaternion(), axisX = new THREE.Vector3(1,0,0);
  root.updateMatrixWorld(true);
  // The exported joints have different local axes. Rotate gait around the
  // character's horizontal axis, expressed in each joint's rest coordinates.
  const gaitAxes=new Map(bones.map(bone=>[bone,axisX.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert())]));
  const noMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previousTime=null,walkingSpeed=0;
  return {
    object:root, profile,
    get carrying() {return kit.visible;},
    update(now, action, speaking, locomotion) {
      const t=now/1000+index*0.7;
      const dt=previousTime===null?0:Math.min(0.08,Math.max(0,(now-previousTime)/1000));previousTime=now;
      walkingSpeed+=((locomotion?.speed ?? 0)-walkingSpeed)*(1-Math.exp(-18*dt));
      const gait=residentStride(locomotion?.distance ?? 0,walkingSpeed);
      for (const bone of bones) {
        bone.quaternion.copy(rest.get(bone));
        if(noMotion && !locomotion?.speed) continue;
        if(gait[bone.name]) {adjustment.setFromAxisAngle(gaitAxes.get(bone),gait[bone.name]);bone.quaternion.multiply(adjustment);}
        const angle=bone.name==='head' ? Math.sin(t*(speaking?4:0.7))*(speaking?0.025:0.008)
          : bone.name==='spine_03' ? Math.sin(t*1.3)*0.006
          : bone.name==='lowerarm_r' && action==='greet' ? -0.32+Math.sin(t*2)*0.025 : 0;
        adjustment.setFromAxisAngle(axisX,angle); bone.quaternion.multiply(adjustment);
      }
      kit.visible=Boolean(locomotion?.visitId && hand);
      if(kit.visible) {root.updateWorldMatrix(true,true);hand.getWorldPosition(kit.position);root.worldToLocal(kit.position);}
    },
    dispose() { for (const skeleton of skeletons) skeleton.dispose(); for (const material of materials.values()) material.dispose(); },
  };
}
