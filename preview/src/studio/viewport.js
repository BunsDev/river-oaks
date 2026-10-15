import { isSpaceDocument } from './space-document.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createStudioScene, disposeStudioScene, frameStudioObject, studioClearColor } from './scene.js';
import { SPACE_LIGHT } from './space-scene.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../walking.js';

export function createStudioViewport(host,{onSelect,onTransform,onPosition,onExitWalk,getRevision=()=>0}) {
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(studioClearColor(document.documentElement.dataset.theme));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','World Studio 3D viewport');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,2000);
  const sky=new THREE.HemisphereLight('#f9fff9','#8c9b8b',2.5);scene.add(sky);
  let reflections=null;
  const sun=new THREE.DirectionalLight('#fff5df',3);sun.position.set(65,120,40);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-130,right:130,top:130,bottom:-130,near:1,far:400});sun.shadow.bias=-.0005;sun.shadow.normalBias=.04;scene.add(sun,sun.target);
  const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=false;orbit.maxPolarAngle=Math.PI/2-.05;orbit.minDistance=3;orbit.maxDistance=700;
  const transform=new TransformControls(camera,renderer.domElement);scene.add(transform.getHelper());transform.setTranslationSnap(.5);transform.setRotationSnap(Math.PI/8);transform.setScaleSnap(.5);
  const box=new THREE.BoxHelper(undefined,'#365b49');scene.add(box);box.visible=false;
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),keys=new Set();
  let content=null,selected=null,interiorView=null,mode='translate',walking=null,environment=null,down=null,look=null,savedCamera=null,frame=0,last=0;
  let drag=null, generation=0;
  const events=new AbortController(),signal=events.signal;
  function configureTransform() {
    cancelDrag(true);
    const object=content?.items.get(selected);transform.detach();box.visible=Boolean(object)&&!walking;
    if(!object||walking||selected==='@environment'||selected===interiorView?.buildingId){box.visible=false;return;}
    box.setFromObject(object);const kind=object.userData.kind;
    const permitted=mode==='translate'||kind==='building'||kind==='furnishing'||kind==='tree'&&mode==='scale';
    if(!permitted)return;
    transform.attach(object);transform.setMode(mode);transform.setSpace(mode==='scale'?'local':'world');
    transform.showX=mode!=='rotate';transform.showY=mode!=='translate'||kind==='furnishing';transform.showZ=mode!=='rotate'&&!(kind==='tree'&&mode==='scale');
  }
  transform.addEventListener('dragging-changed',event=>{orbit.enabled=!event.value&&!walking;});
  transform.addEventListener('objectChange',()=>{if(transform.object)box.setFromObject(transform.object);});
  transform.addEventListener('mouseDown',()=>{drag={id:selected,revision:getRevision(),generation};});
  const cancelDrag=(finish=false)=>{
    if(drag){transform.reset();drag=null;transform.axis=null;}
    // Keep orbit locked until pointer-up after Escape, so the cancelled drag
    // cannot become an accidental camera orbit while the pointer is still down.
    if(finish)transform.dragging=false;
  };
  transform.addEventListener('mouseUp',()=>{
    const pending=drag;drag=null;
    const object=transform.object;if(!object||!pending)return;
    const round=value=>Math.round(value*1000)/1000;
    let patch;
    if(mode==='translate')patch={east:round(object.position.x),north:round(-object.position.z),...(object.userData.kind==='furnishing'?{elevation:round(object.position.y)}:{})};
    else if(mode==='rotate')patch={yaw:round(((object.rotation.y*180/Math.PI+180)%360+360)%360-180)};
    else if(object.userData.kind==='tree')patch={radius:round(object.scale.x),height:round(object.scale.y)};
    else patch={width:round(object.scale.x),height:round(object.scale.y),depth:round(object.scale.z)};
    queueMicrotask(()=>{if(!signal.aborted&&pending.generation===generation)onTransform(pending.id,patch,pending.revision);});
  });
  renderer.domElement.addEventListener('pointerdown',event=>{
    host.focus();down={x:event.clientX,y:event.clientY};
    if(walking&&event.button===0){look=down;renderer.domElement.setPointerCapture(event.pointerId);}
  },{signal});
  renderer.domElement.addEventListener('pointermove',event=>{
    if(!walking||!look)return;
    walking.yaw-=(event.clientX-look.x)*.004;walking.pitch=THREE.MathUtils.clamp(walking.pitch-(event.clientY-look.y)*.004,-1.3,1.3);look={x:event.clientX,y:event.clientY};
  },{signal});
  renderer.domElement.addEventListener('pointerup',event=>{
    look=null;
    if(walking||!down||transform.axis||Math.hypot(event.clientX-down.x,event.clientY-down.y)>4){down=null;return;}
    down=null;const bounds=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
    ray.setFromCamera(pointer,camera);
    for(const hit of ray.intersectObjects([...content.items.values()],true)){
      let object=hit.object;while(object&&!object.userData.studioId)object=object.parent;
      if(object){onSelect(object.userData.studioId);return;}
    }
  },{signal});
  renderer.domElement.addEventListener('pointercancel',()=>{cancelDrag(true);down=null;look=null;},{signal});
  window.addEventListener('blur',()=>{cancelDrag(true);keys.clear();look=null;},{signal});
  host.addEventListener('blur',()=>keys.clear(),{signal});
  document.addEventListener('visibilitychange',()=>{keys.clear();last=0;},{signal});
  host.addEventListener('keydown',event=>{
    if(!walking){if(event.key==='Escape')cancelDrag();return;}if(event.key==='Escape'){event.preventDefault();onExitWalk();return;}
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(event.key.toLowerCase())){event.preventDefault();keys.add(event.key.toLowerCase());}
  },{signal});
  window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()),{signal});
  document.addEventListener('appearancechange',event=>{renderer.setClearColor(studioClearColor(event.detail.resolved));content?.setAppearance(event.detail.resolved);},{signal});
  function resizeViewport(){const {width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}
  const resize=new ResizeObserver(resizeViewport);resize.observe(host);resizeViewport();
  function frameObject(object){orbit.target.copy(frameStudioObject(camera,object));orbit.maxDistance=Math.max(700,camera.position.distanceTo(orbit.target)*2);orbit.update();}
  function animate(time) {
    frame=requestAnimationFrame(animate);if(document.hidden){last=0;return;}
    if(walking){
      // As in the office walk: A/D strafe and the left/right arrows turn, so keyboard-only
      // visitors can face each room without a pointer drag.
      const turn=Number(keys.has('arrowleft'))-Number(keys.has('arrowright'));if(turn&&last)walking.yaw+=turn*1.6*(time-last)/1000;
      stepWalking(walking,environment,{forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),strafe:Number(keys.has('d'))-Number(keys.has('a')),fast:keys.has('shift')},last?(time-last)/1000:0);
      camera.position.fromArray(walking.position);camera.rotation.order='YXZ';camera.rotation.set(walking.pitch,walking.yaw,0);
      onPosition(walking.position);
    }
    last=time;renderer.render(scene,camera);
    // Same once-a-second render stats the game publishes, for acceptance runs.
    if(time-lastStats>1000){lastStats=time;const {render,memory,programs}=renderer.info;
      host.dataset.renderStats=JSON.stringify({calls:render.calls,triangles:render.triangles,geometries:memory.geometries,textures:memory.textures,programs:programs?.length??null,at:Math.round(time)});}
  }
  let lastStats=-Infinity;
  frame=requestAnimationFrame(animate);
  const api={
    render(region,id=selected,view=interiorView){
      cancelDrag(true);generation++;transform.detach();if(content)disposeStudioScene(content.group);content=createStudioScene(region,document.documentElement.dataset.theme);
      for(const [key,object] of content.items)object.userData.kind=key==='@arrival'?'arrival':isSpaceDocument(region)?(key==='@environment'?'environment':'furnishing'):region.buildings.some(v=>v.id===key)?'building':region.trees.some(v=>v.id===key)?'tree':'place';
      scene.add(content.group);selected=id;interiorView=view;content.setInteriorView?.(view);configureTransform();
      const bounds=new THREE.Box3().setFromObject(content.group),center=bounds.getCenter(new THREE.Vector3());
      const space=isSpaceDocument(region),span=Math.max(space?25:100,bounds.getSize(new THREE.Vector3()).length());
      // Furnished spaces reflect a neutral room so glass and metal finishes read, and the
      // sky fill follows the preset so evening is darker. Regions keep their lighting.
      const light=space?SPACE_LIGHT[region.lighting]:null;
      sun.intensity=light?light.sun:3;sun.color.set(space&&region.lighting!=='daylight'?'#ffd6a3':'#fff5df');
      if(space&&!reflections){const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();try{reflections=pmrem.fromScene(room);}finally{room.dispose();pmrem.dispose();}}
      scene.environment=light?reflections.texture:null;
      scene.environmentIntensity=light?light.reflections:1;
      sky.intensity=light?light.sky:2.5;
      sun.target.position.copy(center);sun.position.copy(center).add(new THREE.Vector3(.5,1,.4).multiplyScalar(span));
      Object.assign(sun.shadow.camera,{left:-span/2,right:span/2,top:span/2,bottom:-span/2,far:span*3});sun.shadow.camera.updateProjectionMatrix();
    },
    select(id){selected=id;configureTransform();},
    showInterior(view){interiorView=view;content?.setInteriorView?.(view);configureTransform();},
    tool(value){mode=value;configureTransform();},
    frameSelection(){const level=selected===interiorView?.buildingId
      ?content.interiorViews.get(selected)?.preview.levels.get(interiorView.levelIndex)?.root:null;
      const object=level??content.items.get(selected);if(object)frameObject(object);},
    frameRegion(){frameObject(content.group);},
    walk(enabled){
      keys.clear();look=null;content?.setWalk?.(enabled);
      if(enabled){environment=createWalkingEnvironment(content.world);walking=createWalkingState(environment);savedCamera={position:camera.position.clone(),target:orbit.target.clone()};orbit.enabled=false;configureTransform();}
      else {walking=null;orbit.enabled=true;if(savedCamera){camera.position.copy(savedCamera.position);orbit.target.copy(savedCamera.target);orbit.update();}configureTransform();}
      host.focus();last=0;
    },
    dispose(){cancelAnimationFrame(frame);events.abort();resize.disconnect();transform.detach();transform.dispose();orbit.dispose();if(content)disposeStudioScene(content.group);box.geometry.dispose();box.material.dispose();sun.shadow.dispose();reflections?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},
  };return api;
}
