import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRoadVehicle } from '../../src/road-vehicles.js';
import { loadResidentAvatar } from '../../src/avatars.js';
import { createJevicaCostume } from '../../src/jevica-costume.js';
import { createPrinceCostume,loadPrinceSkinTexture } from '../../src/prince-costume.js';
import {createFlightHands} from '../../src/flight-hands.js';
import {createAngelWings} from '../../src/angel-wings.js';
import { createDrivingHands } from '../../src/driving-hands.js';
const passenger=await loadResidentAvatar(4,'player','jevica'),driver=await loadResidentAvatar(1,'vehicle-fixture-driver','prince-jev',{folk:false});
const dress=createJevicaCostume(passenger),suit=createPrinceCostume(driver,{skinTexture:await loadPrinceSkinTexture()});
const drivingHands=createDrivingHands(driver.rig.model,driver.object);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1400,900);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#dedede');
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room).texture;room.dispose();pmrem.dispose();scene.environmentIntensity=.4;
scene.add(new THREE.HemisphereLight('#fefefe','#555555',.6));
const light=new THREE.DirectionalLight('#fff7ee',2.4);light.position.set(-3,8,5);light.castShadow=true;light.shadow.mapSize.set(2048,2048);scene.add(light);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#d4d1ce',roughness:.85}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const camera=new THREE.PerspectiveCamera(38,1400/900,.05,200);let model;
scene.add(passenger.object,driver.object);
function show(kind,view='front') {
 model?.dispose();model=createRoadVehicle(kind);scene.add(model.object);
 for(const [avatar,seat,floor] of [[driver,model.spec.driverSeat,model.spec.driverFloor],[passenger,model.spec.passengerSeat,model.spec.passengerFloor]]) {
  avatar.object.position.set(seat[0],seat[1]-avatar.rig.hipHeight+.025,seat[2]);avatar.object.rotation.y=-Math.PI/2;
  avatar.update(0,'continue',false,{speed:0,riding:true,ridingKind:kind,ridingDriver:avatar===driver,ridingSpeed:3,seatToFloor:seat[1]-floor});
 }
 drivingHands(model.object,model.spec);model.animate(1500,3);
 dress.update(false,0,true);suit.update({carrying:false});
 const distance=kind==='rolls'?1.12:.65;camera.position.set((view==='front'?-7:7)*distance,3.2*distance,6.4*distance);camera.lookAt(0,kind==='rolls'?.8:1,0);
 renderer.render(scene,camera);document.querySelector('#label').textContent=`JEV / ${model.spec.label.toUpperCase()}`;return {draws:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
const flightHands=createFlightHands(driver.rig.model,driver.object);
const wings=createAngelWings();driver.object.add(wings.object);
function fly(view='front') {
 model?.object && (model.object.visible=false);passenger.object.visible=false;
 driver.object.position.set(0,3.7,0);driver.object.rotation.set(1.25,.4,0,'YXZ');
 driver.update(1600,'continue',false,{flying:true,superheroFlight:1,speed:0});flightHands.update({amount:1,speed:6});suit.update({carrying:false});
 for(let i=0;i<120;i++)wings.update(1600,1/60,{amount:1,speed:6});
 document.querySelector('#label').textContent='PRINCE JEV / ANGEL FLIGHT';camera.position.set(view==='front'?6:-5,view==='front'?7:8,8);camera.lookAt(0,4,0);renderer.render(scene,camera);
 return {draws:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
window.vehicleFixture={fly,show,renderer,scene,camera,passenger,driver,dress,suit,get model(){return model;}};show('rolls');document.body.dataset.ready='true';
