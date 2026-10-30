import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { avatarProfile, loadResidentAvatar } from '../../src/avatars.js';
import { createPrinceCostume, loadPrinceSkinTexture } from '../../src/prince-costume.js';
import { createAngelWings, WING_REST } from '../../src/angel-wings.js';
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
// ?view=reference: the 2026-10-29 reference framing for the likeness journey
// (jev-reference-likeness.js): front, full body, wings at rest, white background,
// the figure spanning 94% of the frame height as in the reference image.
function reference({time=1000,frames=30}={}) {
  wings??=createAngelWings({reducedMotion:true});if(!wings.object.parent)avatar.object.add(wings.object);
  scene.background=new THREE.Color('#ffffff');floor.visible=false;
  avatar.object.rotation.set(0,0,0);avatar.object.position.set(0,0,0);
  for(let i=0;i<frames;i++){avatar.update(time+i*16,'continue',false,{speed:0,distance:0},()=>0);costume?.update();wings.update(time+i*16,1/60,{amount:0,rest:WING_REST});}
  // The illustration is evenly lit; the studio sun blows the cream and pink out.
  const exposure=renderer.toneMappingExposure;renderer.toneMappingExposure=.8;
  // Frame from the rendered pixels (the rig's bounding box includes folded
  // instanced feathers below the floor): start wide, then fit the figure's
  // pixel extent to 94% of the frame height, centred, as in the reference.
  const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),box=new THREE.Box3().setFromObject(avatar.object),centre=box.getCenter(new THREE.Vector3());
  let distance=((box.max.y-box.min.y)*1.6/2)/tan,eye=centre.y;
  const extent=()=>{
    const canvas=document.createElement('canvas');canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;const context=canvas.getContext('2d');
    context.drawImage(renderer.domElement,0,0);const data=context.getImageData(0,0,canvas.width,canvas.height).data;let y0=canvas.height,y1=-1;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(data[i]<=247||data[i+1]<=247||data[i+2]<=247){y0=Math.min(y0,y);y1=Math.max(y1,y);}}
    return {y0,y1,rows:canvas.height};
  };
  let pixels=null;
  for(let pass=0;pass<3;pass++){
    camera.position.set(centre.x,eye,centre.z+distance);camera.lookAt(centre.x,eye,centre.z);renderer.render(scene,camera);
    pixels=extent();if(pixels.y1<0)break;
    const view=2*distance*tan,height=(pixels.y1-pixels.y0+1)/pixels.rows*view;
    eye+=(pixels.rows/2-(pixels.y0+pixels.y1)/2)/pixels.rows*view;distance=(height/0.94/2)/tan;
  }
  renderer.toneMappingExposure=exposure;
  return {box:[box.min.toArray(),box.max.toArray()],pixels,eye,distance,wingsVisible:wings.object.visible};
}
window.princeFixture = {render,flight,reference,avatar,costume,renderer,scene,camera};
if(params.get('view')==='reference')reference();else render();document.body.dataset.ready = 'true';
