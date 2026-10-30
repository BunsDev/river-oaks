import { createCharacterHero } from './character-hero.js';
import { characterPortraitPNG } from './character-portrait.js';
import { loadLatestCharacter } from './character-studio-loading.js';
import * as THREE from 'three';
import { AVATAR_PROFILES, loadResidentAvatar } from './avatars.js';
import { createPlayerCostume } from './player-costume.js';
import { createCharacterMaterials } from './character-studio-materials.js';
import { validateCharacterDefinition } from './character-definition.js';
import { sharedAppearance } from './shared-appearances.js';
import { studioBackdrop, watchStudioTheme } from './character-studio-theme.js';
import { isRealisticHumanRig } from './character-fidelity-contract.js';
import { fidelityTierForQuality } from './character-fidelity-runtime.js';
import { characterQualitySnapshot, subscribeCharacterQuality } from './character-quality.js';

export function createCharacterPreview({host,ownerId,reducedMotion=false,onStatus=()=>{},onRealism=()=>{}}){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  // The shared CPU acceptance profile draws no shadows (main.js, shared-runner.js). This preview
  // redraws every frame, so under that profile a shadow pass starves the page it shares a CPU with.
  const softwareRendering=import.meta.env.DEV&&import.meta.env.VITE_SHARED_SOFTWARE_RENDERING==='1';
  renderer.shadowMap.enabled=!softwareRendering;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-label','Live character preview');renderer.domElement.setAttribute('role','img');host.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(studioBackdrop().background);
  const camera=new THREE.PerspectiveCamera(30,1,.05,30);
  const key=new THREE.DirectionalLight('#fff0df',3.1),fill=new THREE.HemisphereLight('#f2f6ff','#64766d',2),rim=new THREE.DirectionalLight('#c5e6e5',2.2);
  key.castShadow=!softwareRendering;key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-1.5,right:1.5,top:2,bottom:-1.5,near:.1,far:12});key.shadow.normalBias=.012;key.shadow.bias=-.0001;
  key.position.set(3,4,4);rim.position.set(-3,3,-2);scene.add(key,fill,rim);
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(.65,.68,.05,64),new THREE.MeshStandardMaterial({color:'#a8bdb2',roughness:.87}));pedestal.position.y=-.028;pedestal.receiveShadow=true;scene.add(pedestal);
  // The backdrop follows the app theme (System follows the OS) and the chosen lighting.
  let theme='light',lighting='neutral';
  const paint=()=>{const backdrop=studioBackdrop(theme,lighting);scene.background.set(backdrop.background);pedestal.material.color.set(backdrop.pedestal);fill.groundColor.set(backdrop.ground);renderDirty=true;};
  let avatar=null,costume=null,colors=null,loadedId=null,wanted=null,loading=false,disposed=false,frame=0,previous=null,distance=0;
  let visible=true;
  const visibility=new IntersectionObserver(entries=>{visible=entries.at(-1)?.isIntersecting??false;if(visible)renderDirty=true;previous=null;});visibility.observe(host);
  let yaw=0,turntable=false,pose='idle',framing='full',renderDirty=true;
  const unwatchTheme=watchStudioTheme(next=>{theme=next;host.dataset.theme=next;paint();});
  const resize=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();renderer.setSize(Math.max(1,width),Math.max(1,height),false);camera.aspect=Math.max(1,width)/Math.max(1,height);camera.updateProjectionMatrix();renderDirty=true;});resize.observe(host);
  // A player-made look is its recipe on its own body: a new recipe is a new load.
  const lookKey=definition=>definition.schemaVersion===3?`${definition.appearanceId}:${JSON.stringify(definition.parameters)}`:definition.appearanceId;
  let stature=1;
  // A realistic look draws at the Studio's chosen tier; 'auto' follows the graphics
  // setting as the town does. The tier is this viewer's only, never the definition's.
  let tier='auto';
  const resolvedTier=()=>tier==='auto'?fidelityTierForQuality(characterQualitySnapshot()):tier;
  const realistic=definition=>Boolean(definition)&&isRealisticHumanRig(definition.rig);
  const showRealism=report=>{
    host.dataset.realismTier=report?.tier??'off';host.dataset.realismRequested=report?.requestedTier??'off';
    if(report?.fallback)host.dataset.realismFallback=report.fallback;else delete host.dataset.realismFallback;
    onRealism(report?{tier:report.tier,requestedTier:report.requestedTier,choice:tier,...(report.fallback?{fallback:report.fallback}:{})}:null);
  };
  async function applyTier(){
    const current=avatar;if(!current||!realistic(wanted)||!current.setRealismTier)return;
    const report=await current.setRealismTier(resolvedTier());
    // A newer avatar, tier or teardown owns the result now.
    if(disposed||current!==avatar||report?.requestedTier!==resolvedTier())return;
    showRealism(report);renderDirty=true;
  }
  const unsubscribeQuality=subscribeCharacterQuality(()=>{if(tier==='auto')applyTier().catch(()=>{});});
  const release=()=>{colors?.dispose();costume?.dispose();avatar?.dispose();avatar?.object.removeFromParent();avatar=costume=colors=null;loadedId=null;};
  async function load(){
    if(loading||disposed)return;loading=true;
    try{
      await loadLatestCharacter({getWanted:()=>wanted,isDisposed:()=>disposed,
        load:async definition=>{
          onStatus('loading');host.dataset.ready='false';
          let next,nextCostume;
          try{
            next=await loadResidentAvatar(Math.max(0,AVATAR_PROFILES.indexOf(definition.rig)),`remote-studio-${definition.appearanceId}`,definition.rig,{folk:false,appearanceId:definition.appearanceId,faceRecipe:{},...(definition.schemaVersion===3?{recipe:definition.parameters}:{}),...(realistic(definition)?{realism:resolvedTier()}:{})});
            if(sharedAppearance(definition.appearanceId).costume==='jevica')nextCostume=createPlayerCostume(next,'jevica');
            return {avatar:next,costume:nextCostume,colors:createCharacterMaterials(next.object)};
          }catch(error){nextCostume?.dispose();next?.dispose();throw error;}
        },
        discard:resource=>{resource.colors.dispose();resource.costume?.dispose();resource.avatar.dispose();},
        accept:(resource,definition)=>{
          resource.colors.apply(definition);release();avatar=resource.avatar;costume=resource.costume;colors=resource.colors;loadedId=lookKey(definition);scene.add(avatar.object);
          stature=definition.schemaVersion===3?definition.parameters.height/170:1;
          host.dataset.ready='true';host.dataset.appearance=definition.appearanceId;host.dataset.loadedLook=loadedId;onStatus('ready');renderDirty=true;previous=null;distance=0;
          showRealism(realistic(definition)?avatar.realismReport:null);if(realistic(definition))applyTier().catch(()=>{});
        },onError:()=>{if(!disposed){onStatus('error');host.dataset.ready='false';}},
      });
    }finally{loading=false;}
  }

  const draw=now=>{
    if(disposed)return;frame=requestAnimationFrame(draw);
    if(document.hidden||!visible){previous=null;return;}
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
    // Authored looks are framed for their 1.7 m figures; a recipe's height scales the frame.
    const full=framing==='full',focus=(full?.9:1.52)*stature;
    const range=(full?Math.max(3.8,2.1/camera.aspect):Math.max(1.35,.75/camera.aspect))*(full?stature:1);
    camera.position.set(0,(full?1.08:1.59)*stature,range);camera.lookAt(0,focus,0);
    if(!reducedMotion||renderDirty){renderer.render(scene,camera);renderDirty=false;}
  };frame=requestAnimationFrame(draw);
  return {
    setDefinition(value,{tier:next='auto'}={}){const result=validateCharacterDefinition(value,{ownerId});if(!result.ok)throw new TypeError(result.error);wanted=result.definition;
      const retier=next!==tier;tier=next;
      if(loadedId===lookKey(wanted)){colors.apply(wanted);renderDirty=true;if(retier)applyTier().catch(()=>{});}else load();},
    async capturePortrait(){
      if(disposed||loading||!avatar)throw new Error('Wait for the preview to finish loading.');
      let hero;
      try{
        hero=await createCharacterHero({definition:wanted,ownerId,...(realistic(wanted)?{realism:resolvedTier()}:{})});
        if(disposed)throw new Error('Studio closed during portrait preparation.');
        const result=await characterPortraitPNG({renderer,scene:hero.scene,camera:hero.camera});
        if(disposed)throw new Error('Studio closed during portrait capture.');
        return {...result,definition:hero.definition,preset:hero.preset};
      }finally{hero?.dispose();renderDirty=true;}
    },
    setView(options){if(options.yaw!==undefined)yaw=options.yaw*Math.PI/180;if(options.turntable!==undefined)turntable=options.turntable;
      if(['idle','walk','wave'].includes(options.pose))pose=options.pose;if(['full','portrait'].includes(options.framing))framing=options.framing;
      if(options.lighting){const warm=options.lighting==='warm';lighting=warm?'warm':'neutral';key.color.set(warm?'#ffd1a6':'#fff0df');fill.intensity=warm?1.6:2;paint();}
      renderDirty=true;},
    dispose(){disposed=true;unsubscribeQuality();unwatchTheme();cancelAnimationFrame(frame);resize.disconnect();visibility.disconnect();release();pedestal.geometry.dispose();pedestal.material.dispose();key.shadow.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},
  };
}
