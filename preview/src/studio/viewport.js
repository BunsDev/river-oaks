import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createStudioScene, disposeStudioScene, frameStudioObject, studioClearColor } from './scene.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../walking.js';

export function createStudioViewport(host,{onSelect,onTransform,onPosition,onExitWalk}) {
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(studioClearColor(document.documentElement.dataset.theme));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','World Studio 3D viewport');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,2000);
  scene.add(new THREE.HemisphereLight('#f9fff9','#8c9b8b',2.5));
  const sun=new THREE.DirectionalLight('#fff5df',3);sun.position.set(65,120,40);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-130,right:130,top:130,bottom:-130,near:1,far:400});sun.shadow.bias=-.0005;sun.shadow.normalBias=.04;scene.add(sun,sun.target);
  const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=false;orbit.maxPolarAngle=Math.PI/2-.05;orbit.minDistance=3;orbit.maxDistance=700;
  const transform=new TransformControls(camera,renderer.domElement);scene.add(transform.getHelper());transform.setTranslationSnap(.5);transform.setRotationSnap(Math.PI/8);transform.setScaleSnap(.5);
  const box=new THREE.BoxHelper(undefined,'#365b49');scene.add(box);box.visible=false;
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),keys=new Set();
  let content=null,selected=null,mode='translate',walking=null,environment=null,down=null,look=null,savedCamera=null,frame=0,last=0;
  const events=new AbortController(),signal=events.signal;
  function configureTransform() {
    const object=content?.items.get(selected);transform.detach();box.visible=Boolean(object)&&!walking;
    if(!object||walking)return;
    box.setFromObject(object);const kind=object.userData.kind;
    const permitted=mode==='translate'||kind==='building'||kind==='tree'&&mode==='scale';
    if(!permitted)return;
    transform.attach(object);transform.setMode(mode);transform.setSpace(mode==='scale'?'local':'world');
    transform.showX=mode!=='rotate';transform.showY=mode!=='translate';transform.showZ=mode!=='rotate'&&!(kind==='tree'&&mode==='scale');
  }
  transform.addEventListener('dragging-changed',event=>{orbit.enabled=!event.value&&!walking;});
  transform.addEventListener('objectChange',()=>{if(transform.object)box.setFromObject(transform.object);});
  transform.addEventListener('mouseUp',()=>{
    const object=transform.object;if(!object)return;
    const round=value=>Math.round(value*1000)/1000;
    let patch;
    if(mode==='translate')patch={east:round(object.position.x),north:round(-object.position.z)};
    else if(mode==='rotate')patch={yaw:round(((object.rotation.y*180/Math.PI+180)%360+360)%360-180)};
    else if(object.userData.kind==='tree')patch={radius:round(object.scale.x),height:round(object.scale.y)};
    else patch={width:round(object.scale.x),height:round(object.scale.y),depth:round(object.scale.z)};
    const id=selected;queueMicrotask(()=>onTransform(id,patch));
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
  renderer.domElement.addEventListener('pointercancel',()=>{down=null;look=null;},{signal});
  window.addEventListener('blur',()=>{keys.clear();look=null;},{signal});
  host.addEventListener('blur',()=>keys.clear(),{signal});
  document.addEventListener('visibilitychange',()=>{keys.clear();last=0;},{signal});
  host.addEventListener('keydown',event=>{
    if(!walking)return;if(event.key==='Escape'){event.preventDefault();onExitWalk();return;}
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(event.key.toLowerCase())){event.preventDefault();keys.add(event.key.toLowerCase());}
  },{signal});
  window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()),{signal});
  document.addEventListener('appearancechange',event=>renderer.setClearColor(studioClearColor(event.detail.resolved)),{signal});
  function resizeViewport(){const {width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}
  const resize=new ResizeObserver(resizeViewport);resize.observe(host);resizeViewport();
  function frameObject(object){orbit.target.copy(frameStudioObject(camera,object));orbit.maxDistance=Math.max(700,camera.position.distanceTo(orbit.target)*2);orbit.update();}
  function animate(time) {
    frame=requestAnimationFrame(animate);if(document.hidden){last=0;return;}
    if(walking){
      stepWalking(walking,environment,{forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),strafe:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),fast:keys.has('shift')},last?(time-last)/1000:0);
      camera.position.fromArray(walking.position);camera.rotation.order='YXZ';camera.rotation.set(walking.pitch,walking.yaw,0);
      onPosition(walking.position);
    }
    last=time;renderer.render(scene,camera);
  }
  frame=requestAnimationFrame(animate);
  const api={
    render(region,id=selected){
      transform.detach();if(content)disposeStudioScene(content.group);content=createStudioScene(region);
      for(const [key,object] of content.items)object.userData.kind=key==='@arrival'?'arrival':region.buildings.some(v=>v.id===key)?'building':region.trees.some(v=>v.id===key)?'tree':'place';
      scene.add(content.group);selected=id;configureTransform();
      const bounds=new THREE.Box3().setFromObject(content.group),center=bounds.getCenter(new THREE.Vector3());
      const span=Math.max(100,bounds.getSize(new THREE.Vector3()).length());
      sun.target.position.copy(center);sun.position.copy(center).add(new THREE.Vector3(.5,1,.4).multiplyScalar(span));
      Object.assign(sun.shadow.camera,{left:-span/2,right:span/2,top:span/2,bottom:-span/2,far:span*3});sun.shadow.camera.updateProjectionMatrix();
    },
    select(id){selected=id;configureTransform();},
    tool(value){mode=value;configureTransform();},
    frameSelection(){const object=content.items.get(selected);if(object)frameObject(object);},
    frameRegion(){frameObject(content.group);},
    walk(enabled){
      keys.clear();look=null;
      if(enabled){environment=createWalkingEnvironment(content.world);walking=createWalkingState(environment);savedCamera={position:camera.position.clone(),target:orbit.target.clone()};orbit.enabled=false;configureTransform();}
      else {walking=null;orbit.enabled=true;if(savedCamera){camera.position.copy(savedCamera.position);orbit.target.copy(savedCamera.target);orbit.update();}configureTransform();}
      host.focus();last=0;
    },
    dispose(){cancelAnimationFrame(frame);events.abort();resize.disconnect();transform.detach();transform.dispose();orbit.dispose();if(content)disposeStudioScene(content.group);box.geometry.dispose();box.material.dispose();sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},
  };return api;
}
