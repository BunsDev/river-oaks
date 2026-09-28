import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadResidentAvatar } from '../../src/avatars.js';
import { createPlayerCostume } from '../../src/player-costume.js';
import { VISITOR_FORMS } from '../../src/visitor-persona.js';

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#c8c1bc');
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
const environment = pmrem.fromScene(room); scene.environment = environment.texture; scene.environmentIntensity = 0.35;
room.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f4f3ff','#aea092',0.45));
const sun = new THREE.DirectionalLight('#fff1e4',2.4); sun.position.set(2,4,5); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3}); sun.shadow.normalBias = 0.015; scene.add(sun);
const fill = new THREE.DirectionalLight('#dbe9ff',1.3); fill.position.set(-3,2,-1); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30,30), new THREE.MeshStandardMaterial({color:'#c8c1bc',roughness:0.85}));
floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
const camera = new THREE.PerspectiveCamera(36,innerWidth/innerHeight,0.01,100);
const form='jevica';
const params=new URLSearchParams(location.search), resident=params.get('resident');
const identity=VISITOR_FORMS[0];
// ?resident=local-07&rig=2 inspects a dressed resident (human fashion styling included) on a given shared rig.
const avatar = resident ? await loadResidentAvatar(Number(params.get('rig') ?? 0),resident) : await loadResidentAvatar(identity.avatar,'player',identity.profile);
const outfit = resident ? {update(){}} : createPlayerCostume(avatar,form); const holder=new THREE.Group();scene.add(holder);holder.add(avatar.object);
function render(view='full',time=0,speed=0,pose={}) {
  avatar.object.rotation.y = view === 'back' ? Math.PI : view === 'profile' ? -Math.PI/2 : 0;
  holder.position.fromArray(pose.position??[0,0,0]);holder.rotation.y=pose.yaw??0;
  if (view === 'portrait') {camera.position.set(0,1.61,1.40);camera.lookAt(0,1.48,0);}
  else {camera.position.set(2.1,1.4,4.4);camera.lookAt(0,0.90,0);}
  camera.position.add(holder.position);camera.lookAt(holder.position.x,holder.position.y+(view==='portrait'?1.48:.90),holder.position.z);
  avatar.update(time,pose.action??'continue',false,{speed,distance:pose.distance??time/1000*speed,heading:pose.heading,flying:pose.flying??false,flightSpeed:pose.flightSpeed??speed,vehicle:form},()=>0);
  const costumeStart=performance.now();outfit.update(pose.flying??false,time);
  outfit.updateOptics?.(camera,innerHeight);
  const costumeUpdateMs=performance.now()-costumeStart;
  renderer.render(scene,camera);
  return {costumeUpdateMs,profile:avatar.profile, bounds:new THREE.Box3().setFromObject(avatar.object).getSize(new THREE.Vector3()).toArray(), calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
window.jevicaFixture = {render,avatar,outfit,renderer,scene,camera,holder};
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();render();});
render(); document.body.dataset.ready = 'true';
