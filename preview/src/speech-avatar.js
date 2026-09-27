import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createSpeechTrack,SPEECH_SHAPES} from './speech-track.js';

const rigs=new Map(),cache=new Map(),installed=new WeakMap(),loader=new GLTFLoader();
const oralNames=new Set(['teeth','tongue01']);

export function createSpeechBinding(rig,donor) {
 const rows=[],oral=[],parts=[];let disposed=false;
 rig.model.traverse(mesh=>{if(mesh.isMesh)parts.push(mesh);});
 const body=parts.find(m=>m.isSkinnedMesh&&m.morphTargetDictionary?.eyeBlinkLeft!==undefined);
 if(!body)throw new Error('No compatible speech body');
 try{
  donor.traverse(source=>{
   if(!source.isMesh)return;
   if(oralNames.has(source.material?.name)){
    const parent=rig.model.getObjectByName(source.parent.name);
    if(!parent||source.skeleton.bones.some((bone,i)=>bone.name!==body.skeleton.bones[i]?.name))throw new Error('Incompatible speech mouth rig');
    const mesh=new THREE.SkinnedMesh(source.geometry,source.material.clone());
    mesh.name=source.name;mesh.position.copy(source.position);mesh.quaternion.copy(source.quaternion);mesh.scale.copy(source.scale);
    mesh.userData={...body.userData};mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=body.receiveShadow;
    mesh.bind(body.skeleton,body.bindMatrix);mesh.visible=false;parent.add(mesh);oral.push(mesh);
    return;
   }
   const names=SPEECH_SHAPES.filter(name=>source.morphTargetDictionary?.[name]!==undefined);
   if(!names.length)return;
   const matches=parts.filter(m=>m.material?.name===source.material?.name);
   if(matches.length!==1||matches[0].geometry.attributes.position.count!==source.geometry.attributes.position.count)throw new Error('Incompatible speech face');
   const mesh=matches[0],original={geometry:mesh.geometry,keys:mesh.morphTargetDictionary,influences:mesh.morphTargetInfluences,length:mesh.morphTargetInfluences?.length??0};
   const geometry=mesh.geometry.clone();geometry.morphTargetsRelative=true;geometry.morphAttributes={...geometry.morphAttributes};
   for(const attribute of ['position','normal']){
    const old=geometry.morphAttributes[attribute]??[];
    geometry.morphAttributes[attribute]=[...old,...names.map(name=>source.geometry.morphAttributes[attribute][source.morphTargetDictionary[name]])];
   }
   mesh.geometry=geometry;mesh.morphTargetDictionary={...original.keys};mesh.morphTargetInfluences??=[];
   for(const name of names){mesh.morphTargetDictionary[name]=mesh.morphTargetInfluences.length;mesh.morphTargetInfluences.push(0);}
   rows.push({mesh,original,geometry});mesh.material.needsUpdate=true;
  });
  if(!rows.length||oral.length!==2)throw new Error('Incomplete speech geometry');
 }catch(error){dispose();throw error;}
 function dispose(){
  if(disposed)return;disposed=true;
  for(const {mesh,original,geometry}of rows){mesh.geometry=original.geometry;mesh.morphTargetDictionary=original.keys;if(original.influences)original.influences.length=original.length;mesh.morphTargetInfluences=original.influences;mesh.material.needsUpdate=true;geometry.dispose();}
  for(const mesh of oral){mesh.removeFromParent();mesh.material.dispose();}
 }
 return {
  setWeights(weights){
   if(disposed)return false;
   let open=false;
   for(const mesh of [...rows.map(r=>r.mesh),...oral])for(const name of SPEECH_SHAPES){
    const index=mesh.morphTargetDictionary?.[name];if(index===undefined)continue;
    const value=Number.isFinite(weights[name])?THREE.MathUtils.clamp(weights[name],0,1):0;
    mesh.morphTargetInfluences[index]=value;if(value>.012)open=true;
   }
   for(const mesh of oral)mesh.visible=open&&body.visible;
   return true;
  },
  dispose,
 };
}

export function registerSpeechAvatar(id,rig) {
 if(id===undefined||id===null)return ()=>{};
 rigs.set(id,rig);
 return ()=>{installed.get(rig)?.dispose();if(rigs.get(id)===rig)rigs.delete(id);};
}

export function speechAvatarPose(id) {return installed.get(rigs.get(id))?.pose??null;}

// Download only after a voiced conversation requests this profile. Preparing
// does not mutate the figure, so an aborted or superseded request stays inert.
export async function prepareSpeechAvatar(local,signal) {
 const rig=rigs.get(local.id),profile=rig?.source.profile;if(!profile)return null;
 if(!cache.has(profile))cache.set(profile,loader.loadAsync(`/assets/characters/speech/${profile}.glb`).catch(error=>{cache.delete(profile);throw error;}));
 const donor=await cache.get(profile);signal.throwIfAborted();
 return cues=>{
  if(rigs.get(local.id)!==rig)return null;
  installed.get(rig)?.dispose();
  const binding=createSpeechBinding(rig,donor.scene),track=createSpeechTrack(cues);
  let weights={},releaseWeights={},released=false,elapsed=0,closed=false;
  const controller={
   get pose(){return {...weights};},
   update(time,delta){
    if(closed)return false;
    if(released){elapsed+=Math.max(0,Math.min(.08,delta||0));const t=Math.min(1,elapsed/.12),fade=1-t*t*(3-2*t);weights=Object.fromEntries(Object.entries(releaseWeights).map(([k,v])=>[k,v*fade]));binding.setWeights(weights);if(t===1){controller.dispose();return false;}}
    else {weights={...track.sample(time)};binding.setWeights(weights);}
    return true;
   },
   release(){if(!released){released=true;releaseWeights={...weights};}},
   dispose(){if(closed)return;closed=true;binding.dispose();if(installed.get(rig)===controller)installed.delete(rig);},
  };
  installed.set(rig,controller);return controller;
 };
}
