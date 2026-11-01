import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadResidentAvatar } from '../../src/avatars.js';
import { createPlayerCostume } from '../../src/player-costume.js';
import { VISITOR_FORMS } from '../../src/visitor-persona.js';
import { sharedAppearance } from '../../src/shared-appearances.js';

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.append(renderer.domElement);
// ?view=reference&background=white frames her like the 2026-10-29 reference illustration
// (jevica-reference-likeness.js): a plain backdrop, full body, a slight turn.
const referenceView=new URLSearchParams(location.search).get('view')==='reference',backdrop=new URLSearchParams(location.search).get('background')==='white'?'#ffffff':'#c8c1bc';
const scene = new THREE.Scene(); scene.background = new THREE.Color(backdrop);
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
const environment = pmrem.fromScene(room); scene.environment = environment.texture; scene.environmentIntensity = 0.35;
room.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f4f3ff','#aea092',0.45));
const sun = new THREE.DirectionalLight('#fff1e4',2.4); sun.position.set(2,4,5); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3}); sun.shadow.normalBias = 0.015; scene.add(sun);
const fill = new THREE.DirectionalLight('#dbe9ff',1.3); fill.position.set(-3,2,-1); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30,30), new THREE.MeshStandardMaterial({color:backdrop,roughness:0.85}));floor.visible=!referenceView;
floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
const camera = new THREE.PerspectiveCamera(36,innerWidth/innerHeight,0.01,100);
const form='jevica';
const params=new URLSearchParams(location.search), resident=params.get('resident');
const identity=VISITOR_FORMS[0];
// ?resident=local-07&rig=2 inspects a dressed resident (human fashion styling included) on a given shared rig;
// &face=none keeps the rig's authored face for that resident.
const appearance=sharedAppearance(params.get('appearance'));
const avatar = appearance ? await loadResidentAvatar(4,params.get('remote')?'remote-studio':'player',appearance.rig??appearance.id,{folk:false,appearanceId:appearance.id,faceRecipe:params.get('face')==='none'?{}:undefined}) : resident ? await loadResidentAvatar(Number(params.get('rig') ?? 0),resident,undefined,{faceRecipe:params.get('face')==='none'?{}:undefined}) : await loadResidentAvatar(identity.avatar,'player',identity.profile);
const outfit = resident||appearance ? {update(){}} : createPlayerCostume(avatar,form); const holder=new THREE.Group();scene.add(holder);holder.add(avatar.object);
function render(view='full',time=0,speed=0,pose={}) {
  avatar.object.rotation.y = view === 'back' ? Math.PI : view === 'profile' ? -Math.PI/2 : 0;
  holder.position.fromArray(pose.position??[0,0,0]);holder.rotation.y=pose.yaw??0;
  if (view === 'portrait') {camera.position.set(0,1.61,1.40);camera.lookAt(0,1.48,0);}
  else if (view === 'reference') {
    // The illustration's framing: the figure fills ~90% of the frame height, turned ~14° to her right, eye-level camera.
    avatar.object.rotation.y=.24;const height=1.72,distance=height/.90/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    camera.position.set(Math.sin(.05)*distance,height*.5,Math.cos(.05)*distance);
  }
  else {camera.position.set(2.1,1.4,4.4);camera.lookAt(0,0.90,0);}
  camera.position.add(holder.position);camera.lookAt(holder.position.x,holder.position.y+(view==='portrait'?1.48:view==='reference'?.86:.90),holder.position.z);
  avatar.update(time,pose.action??'continue',false,{speed,distance:pose.distance??time/1000*speed,heading:pose.heading,flying:pose.flying??false,flightSpeed:pose.flightSpeed??speed,vehicle:form},()=>0);
  const costumeStart=performance.now();outfit.update(pose.flying??false,time);
  outfit.updateOptics?.(camera,innerHeight);
  const costumeUpdateMs=performance.now()-costumeStart;
  renderer.render(scene,camera);
  return {costumeUpdateMs,profile:avatar.profile, bounds:new THREE.Box3().setFromObject(avatar.object).getSize(new THREE.Vector3()).toArray(), calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
window.jevicaFixture = {THREE,render,avatar,outfit,renderer,scene,camera,holder};
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();render(referenceView?'reference':'full');});
render(referenceView?'reference':'full'); document.body.dataset.ready = 'true';
