import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadResidentAvatar } from '../../src/avatars.js';
import { createPrinceCostume } from '../../src/prince-costume.js';

// ?rig=man-casual compares Prince Jev's costume on another shipped rig.
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
const rig = new URLSearchParams(location.search).get('rig') ?? 'man-tailored';
const avatar = await loadResidentAvatar(1,'carriage-driver',rig,{folk:false});
const costume = createPrinceCostume(avatar); scene.add(avatar.object);
function render(view='full',time=0,{speed=0,action='continue'}={}) {
  avatar.object.rotation.y = view === 'back' ? Math.PI : view === 'profile' ? -Math.PI/2 : view === 'three-quarter' ? -0.6 : 0;
  if (view === 'portrait') {camera.position.set(0,1.68,1.2);camera.lookAt(0,1.58,0);}
  else if (view === 'bust') {camera.position.set(0,1.45,1.9);camera.lookAt(0,1.35,0);}
  else {camera.position.set(0.9,1.3,4.3);camera.lookAt(0,0.95,0);}
  avatar.update(time,action,false,{speed,distance:time/1000*speed},()=>0);costume.update();
  renderer.render(scene,camera);
  return {triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};
}
window.princeFixture = {render,avatar,costume};
render(); document.body.dataset.ready = 'true';
