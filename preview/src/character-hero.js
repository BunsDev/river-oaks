import * as THREE from 'three';
import { AVATAR_PROFILES, loadResidentAvatar } from './avatars.js';
import { createPlayerCostume } from './player-costume.js';
import { createCharacterMaterials } from './character-studio-materials.js';
import { validateCharacterDefinition } from './character-definition.js';
import { sharedAppearance } from './shared-appearances.js';

export const CHARACTER_HERO_PRESET='garden-front-v1';
// A fresh rig makes a neutral portrait independent of the preview's previous
// gait, wave, turntable phase, camera, reduced-motion history or frame timing.
export async function createCharacterHero({definition,ownerId,load=loadResidentAvatar}){
  const validated=validateCharacterDefinition(definition,{ownerId});if(!validated.ok)throw new TypeError(validated.error);
  const value=validated.definition,scene=new THREE.Scene();scene.background=new THREE.Color('#cbd8d1');
  const camera=new THREE.PerspectiveCamera(30,16/9,.05,30);camera.position.set(0,1.08,3.8);camera.lookAt(0,.9,0);
  const key=new THREE.DirectionalLight('#fff0df',3.1),fill=new THREE.HemisphereLight('#f2f6ff','#64766d',2),rim=new THREE.DirectionalLight('#c5e6e5',2.2);
  key.position.set(3,4,4);rim.position.set(-3,3,-2);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-1.5,right:1.5,top:2,bottom:-1.5,near:.1,far:12});key.shadow.normalBias=.012;key.shadow.bias=-.0001;scene.add(key,fill,rim);
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(.65,.68,.05,64),new THREE.MeshStandardMaterial({color:'#a8bdb2',roughness:.87}));pedestal.position.y=-.028;pedestal.receiveShadow=true;scene.add(pedestal);
  let avatar=null,costume=null,colors=null,disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;colors?.dispose();costume?.dispose();avatar?.object.removeFromParent();avatar?.dispose();pedestal.geometry.dispose();pedestal.material.dispose();key.shadow.dispose();};
  try{
    avatar=await load(Math.max(0,AVATAR_PROFILES.indexOf(value.rig)),`remote-hero-${value.appearanceId}`,value.rig,{folk:false,appearanceId:value.appearanceId,faceRecipe:{}});
    if(sharedAppearance(value.appearanceId).costume==='jevica')costume=createPlayerCostume(avatar,'jevica');
    colors=createCharacterMaterials(avatar.object);colors.apply(value);scene.add(avatar.object);
    avatar.update(0,'idle',false,{speed:0,distance:0,gestureTime:0},()=>0);costume?.update(false,0);costume?.updateOptics(camera,2160);
    scene.updateMatrixWorld(true);
    return {scene,camera,definition:value,preset:CHARACTER_HERO_PRESET,dispose};
  }catch(error){dispose();throw error;}
}
