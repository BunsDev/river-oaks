import { createCharacterHero } from './character-hero.js';
import { characterPortraitPNG } from './character-portrait.js';
import { loadLatestCharacter } from './character-studio-loading.js';
import * as THREE from 'three';
import { AVATAR_PROFILES, loadResidentAvatar } from './avatars.js';
import { createPlayerCostume } from './player-costume.js';
import { createCharacterMaterials } from './character-studio-materials.js';
import { validateCharacterDefinition } from './character-definition.js';
import { sharedAppearance } from './shared-appearances.js';

export function createCharacterPreview({host,ownerId,reducedMotion=false,onStatus=()=>{}}){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.domElement.setAttribute('aria-label','Live character preview');renderer.domElement.setAttribute('role','img');host.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#cbd8d1');
  const camera=new THREE.PerspectiveCamera(30,1,.05,30);
  const key=new THREE.DirectionalLight('#fff0df',3.1),fill=new THREE.HemisphereLight('#f2f6ff','#64766d',2),rim=new THREE.DirectionalLight('#c5e6e5',2.2);
  key.position.set(3,4,4);rim.position.set(-3,3,-2);scene.add(key,fill,rim);
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(.65,.68,.05,64),new THREE.MeshStandardMaterial({color:'#a8bdb2',roughness:.87}));pedestal.position.y=-.028;scene.add(pedestal);
  let avatar=null,costume=null,colors=null,loadedId=null,wanted=null,loading=false,disposed=false,frame=0,previous=null,distance=0;
  let yaw=0,turntable=false,pose='idle',framing='full',renderDirty=true;
  const resize=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();renderer.setSize(Math.max(1,width),Math.max(1,height),false);camera.aspect=Math.max(1,width)/Math.max(1,height);camera.updateProjectionMatrix();renderDirty=true;});resize.observe(host);
  const release=()=>{colors?.dispose();costume?.dispose();avatar?.dispose();avatar?.object.removeFromParent();avatar=costume=colors=null;loadedId=null;};
  async function load(){
    if(loading||disposed)return;loading=true;
    try{
      await loadLatestCharacter({getWanted:()=>wanted,isDisposed:()=>disposed,
        load:async definition=>{
          onStatus('loading');host.dataset.ready='false';
          let next,nextCostume;
          try{
            next=await loadResidentAvatar(Math.max(0,AVATAR_PROFILES.indexOf(definition.rig)),`remote-studio-${definition.appearanceId}`,definition.rig,{folk:false,appearanceId:definition.appearanceId,faceRecipe:{}});
            if(sharedAppearance(definition.appearanceId).costume==='jevica')nextCostume=createPlayerCostume(next,'jevica');
            return {avatar:next,costume:nextCostume,colors:createCharacterMaterials(next.object)};
          }catch(error){nextCostume?.dispose();next?.dispose();throw error;}
        },
        discard:resource=>{resource.colors.dispose();resource.costume?.dispose();resource.avatar.dispose();},
        accept:(resource,definition)=>{
          resource.colors.apply(definition);release();avatar=resource.avatar;costume=resource.costume;colors=resource.colors;loadedId=definition.appearanceId;scene.add(avatar.object);
          host.dataset.ready='true';host.dataset.appearance=loadedId;onStatus('ready');renderDirty=true;previous=null;distance=0;
        },onError:()=>{if(!disposed){onStatus('error');host.dataset.ready='false';}},
      });
    }finally{loading=false;}
  }

  const draw=now=>{
    if(disposed)return;frame=requestAnimationFrame(draw);
    if(document.hidden){previous=null;return;}
    const dt=previous===null?0:Math.min(.05,(now-previous)/1000);previous=now;
    if(turntable&&!reducedMotion){yaw=(yaw+dt*.25)%(Math.PI*2);renderDirty=true;}
    if(avatar){
      avatar.object.rotation.y=yaw;
      const speed=!reducedMotion&&pose==='walk'?.8:0;distance+=speed*dt;
      if(!reducedMotion||renderDirty){
        avatar.update(reducedMotion?0:now,pose==='wave'?'wave':'idle',false,{speed,distance},()=>0);
        costume?.update(false,reducedMotion?0:now);costume?.updateOptics(camera,host.clientHeight);
      }
    }
    const full=framing==='full',focus=full?.9:1.52;
    const range=full?Math.max(3.8,2.1/camera.aspect):Math.max(1.35,.75/camera.aspect);
    camera.position.set(0,full?1.08:1.59,range);camera.lookAt(0,focus,0);
    if(!reducedMotion||renderDirty){renderer.render(scene,camera);renderDirty=false;}
  };frame=requestAnimationFrame(draw);
  return {
    setDefinition(value){const result=validateCharacterDefinition(value,{ownerId});if(!result.ok)throw new TypeError(result.error);wanted=result.definition;
      if(loadedId===wanted.appearanceId){colors.apply(wanted);renderDirty=true;}else load();},
    async capturePortrait(){
      if(disposed||loading||!avatar)throw new Error('Wait for the preview to finish loading.');
      let hero;
      try{
        hero=await createCharacterHero({definition:wanted,ownerId});
        if(disposed)throw new Error('Studio closed during portrait preparation.');
        const result=await characterPortraitPNG({renderer,scene:hero.scene,camera:hero.camera});
        if(disposed)throw new Error('Studio closed during portrait capture.');
        return {...result,definition:hero.definition,preset:hero.preset};
      }finally{hero?.dispose();renderDirty=true;}
    },
    setView(options){if(options.yaw!==undefined)yaw=options.yaw*Math.PI/180;if(options.turntable!==undefined)turntable=options.turntable;
      if(['idle','walk','wave'].includes(options.pose))pose=options.pose;if(['full','portrait'].includes(options.framing))framing=options.framing;
      if(options.lighting){const warm=options.lighting==='warm';scene.background.set(warm?'#dfcdbb':'#cbd8d1');key.color.set(warm?'#ffd1a6':'#fff0df');fill.intensity=warm?1.6:2;}
      renderDirty=true;},
    dispose(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();release();pedestal.geometry.dispose();pedestal.material.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},
  };
}
