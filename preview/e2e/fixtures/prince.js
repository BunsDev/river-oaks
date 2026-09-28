import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { avatarProfile, loadResidentAvatar } from '../../src/avatars.js';
import { createPrinceCostume, loadPrinceSkinTexture } from '../../src/prince-costume.js';
import { createAngelWings } from '../../src/angel-wings.js';
import { createFlightHands } from '../../src/flight-hands.js';
import { glideAmount } from '../../src/prince-flight.js';

// ?rig=man-tailored compares Prince Jev's costume on another shipped rig.
// ?reference=owen renders the actual NPC without prince costume overrides.
const renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#c9c3bd');
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room).texture; scene.environmentIntensity = 0.4; room.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f4f3ff','#aea092',0.45));
const sun = new THREE.DirectionalLight('#fff1e4',2.4); sun.position.set(2,4,5); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3}); sun.shadow.normalBias = 0.015; scene.add(sun);
const fill = new THREE.DirectionalLight('#dbe9ff',1.3); fill.position.set(-3,2,-1); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30,30), new THREE.MeshStandardMaterial({color:'#c8c1bc',roughness:0.85}));
floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
const camera = new THREE.PerspectiveCamera(36,innerWidth/innerHeight,0.01,100);
const params=new URLSearchParams(location.search),isOwen=params.get('reference')==='owen';
const rig=isOwen?avatarProfile(11):params.get('rig')??'prince-jev';
const avatar=await loadResidentAvatar(isOwen?11:1,isOwen?'local-11':'carriage-driver',rig,{folk:isOwen});
const costume=isOwen?null:createPrinceCostume(avatar,{skinTexture:await loadPrinceSkinTexture()});scene.add(avatar.object);
function render(view='full',time=0,{speed=0,action='continue'}={}) {
  avatar.object.rotation.y = view === 'back' ? Math.PI : view === 'profile' ? -Math.PI/2 : view === 'three-quarter' ? -0.6 : 0;
  if (view === 'portrait') {camera.position.set(0,1.68,1.2);camera.lookAt(0,1.58,0);}
  else if (view === 'bust') {camera.position.set(0,1.45,1.9);camera.lookAt(0,1.35,0);}
  else {camera.position.set(0.9,1.3,4.3);camera.lookAt(0,0.95,0);}
  avatar.update(time,action,false,{speed,distance:time/1000*speed},()=>0);costume?.update();
  renderer.render(scene,camera);
  return {triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};
}
// Flight review: the hover (pitch ≈ 0.18) and glide (pitch ≈ 1.28) poses with wings and hands.
let wings=null,hands=null;
function flight({pitch=.18,speed=0,time=1000,view='three-quarter',frames=45}={}) {
  wings??=createAngelWings({reducedMotion:true});if(!wings.object.parent)avatar.object.add(wings.object);
  hands??=createFlightHands(avatar.rig.model,avatar.object);
  const hip=avatar.rig.hipHeight,yaw=view==='front'||view==='side'?0:-0.6;
  for(let i=0;i<frames;i++){
    avatar.object.rotation.set(pitch,yaw,0,'YXZ');avatar.object.position.set(0,1.2+hip*(1-Math.cos(pitch)),-hip*Math.sin(pitch));
    avatar.update(time+i*16,'continue',false,{speed:0,flying:true,superheroFlight:1,flightGlide:glideAmount(pitch),distance:0},()=>0);
    costume?.update();wings.update(time+i*16,1/60,{amount:1,speed});hands.update({amount:1,speed});
  }
  camera.position.set(view==='side'?4.6:1.4,2.1,view==='side'?.6:5.6);camera.lookAt(0,1.9,0);
  renderer.render(scene,camera);
}
window.princeFixture = {render,flight,avatar,costume};
render(); document.body.dataset.ready = 'true';
