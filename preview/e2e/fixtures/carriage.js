import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createUnicornTeam,loadUnicornAsset } from '../../src/unicorn-team.js';
import { CARRIAGE_SCALE } from '../../src/carriage-parking.js';
import { createJevicaCarriage } from '../../src/jevica-carriage.js';
import { loadResidentAvatar } from '../../src/avatars.js';
import { createPlayerCostume } from '../../src/player-costume.js';
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#c9c5c0');
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room);scene.environment=env.texture;scene.environmentIntensity=.9;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f5f0e7','#b1a197',1));
const sun=new THREE.DirectionalLight('#fff2df',3);sun.position.set(-3,7,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6});sun.shadow.normalBias=.008;scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#c9c5c0',roughness:.83}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const carriage=createJevicaCarriage();carriage.object.scale.setScalar(CARRIAGE_SCALE);scene.add(carriage.object);
const unicorns=createUnicornTeam({scene,coach:carriage.object,groundAt:()=>0,asset:await loadUnicornAsset()});unicorns.update(0,0,0,0);
const avatar=await loadResidentAvatar(4,'player','jevica'),outfit=createPlayerCostume(avatar,'jevica');avatar.object.position.set(-.3,0,1.9);scene.add(avatar.object);avatar.update(0,'continue',false,{speed:0,distance:0},()=>0);outfit.update(false,0);
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.02,150);
function render(view='three-quarter') {
  avatar.object.visible=['reference','riding','riding-slope'].includes(view);
  const riding=view.startsWith('riding');carriage.object.rotation.set(view==='riding-slope'?.04:0,0,view==='riding-slope'?-.04:0,'YXZ');carriage.object.updateMatrixWorld(true);
  avatar.object.position.set(riding?-2.10:-.3,riding?1.635-avatar.rig.hipHeight+.025:0,riding?0:1.9);avatar.object.rotation.set(0,0,0);
  if(riding){avatar.object.quaternion.copy(carriage.object.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2));avatar.object.position.copy(carriage.object.localToWorld(new THREE.Vector3(.99,1.555,0))).addScaledVector(new THREE.Vector3(0,1,0).applyQuaternion(avatar.object.quaternion),-avatar.rig.hipHeight+.025);}
  avatar.update(performance.now(),'continue',false,{speed:0,distance:0,riding,seatToFloor:(1.555-1.1725)*.9},()=>0);outfit.update(false,performance.now(),riding);
  const views={team:[[-9,3.3,9],[-2.7,1.1,0]],riding:[[2.2,2.3,5],[.65,1.8,0]],side:[[0,2.7,10],[0,1.7,0]],'three-quarter':[[-5.7,3.5,8.5],[-.2,1.65,0]],rear:[[5,3,7],[.3,1.7,0]],detail:[[-1.0,2.25,4],[-.2,2,0]],reference:[[-2.4,3.2,10],[-.1,1.5,.5]]};
  const [position,target]=views[view]??views['three-quarter'];camera.position.fromArray(position);camera.lookAt(...target);renderer.render(scene,camera);
  return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,bounds:new THREE.Box3().setFromObject(carriage.object).getSize(new THREE.Vector3()).toArray()};
}
window.carriageFixture={render,carriage,scene,camera,renderer,avatar,outfit,unicorns};render();document.body.dataset.ready='true';
