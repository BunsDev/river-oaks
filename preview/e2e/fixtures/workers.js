import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildStorePeople } from '../../src/store-people.js';
import { storeRoomsFor } from '../../src/store-rooms.js';
import { createStoreEncounters } from '../../src/store-encounters.js';
import { buildStoreInteriors } from '../../src/store-interiors.js';

const world=await (await fetch('/data/district.json')).json(),rooms=storeRoomsFor(world);
const people=buildStorePeople(rooms);await people.userData.ready;
const state={locals:createStoreEncounters(rooms),selectedId:null};
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1400,900);renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#dedbd5');scene.add(people);
const interiors=buildStoreInteriors(rooms);scene.add(interiors);
scene.updateMatrixWorld(true);
const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment();
scene.environment=pmrem.fromScene(environment).texture;scene.environmentIntensity=0.55;environment.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f0f4ff','#938776',1.5));
const sun=new THREE.DirectionalLight('#fff1df',2);scene.add(sun);
const camera=new THREE.PerspectiveCamera(38,1400/900,0.03,100);
let now=0;
function focus(figure) {
  const origin=figure.holder.position,rotation=figure.holder.quaternion;
  camera.position.copy(new THREE.Vector3(1.6,1.25,2.6).applyQuaternion(rotation).add(origin));camera.lookAt(origin.clone().add(new THREE.Vector3(0,1,0)));
  sun.position.copy(camera.position).add(new THREE.Vector3(0,2,0));sun.target.position.copy(origin);scene.add(sun.target);
  return [camera.position.x,-camera.position.z,camera.position.y];
}
function inspect(index,frames=1,{close=false}={}) {
  const figure=people.userData.figures.filter(p=>p.task)[index];if(!figure)return null;
  const visitor=focus(figure),samples=[];
  for(let frame=0;frame<frames;frame++) {
    now+=1000/30;
    // Interrupt an actual work cycle, turn the torso, then resume the same task.
    state.selectedId=frame>=180&&frame<225?figure.id:null;
    people.userData.update(camera,now,state,visitor);
    samples.push({frame,attention:figure.attention,workTime:figure.workTime,contacts:figure.task.contacts.map(c=>({...c})),position:figure.task.object.position.toArray(),orientation:figure.task.object.quaternion.toArray()});
  }
  if(close){const p=figure.task.object.getWorldPosition(new THREE.Vector3());camera.position.copy(figure.holder.localToWorld(new THREE.Vector3(0.55,figure.task.object.position.y+0.15,0.95)));camera.lookAt(p);}
  renderer.render(scene,camera);document.querySelector('#caption').textContent=`${figure.theme} · ${figure.task.kind} · ${figure.id}`;
  return {id:figure.id,theme:figure.theme,kind:figure.task.kind,docked:figure.task.docked,samples};
}
window.workerFixture={inspect,count:people.userData.figures.filter(p=>p.task).length};
inspect(0);document.body.dataset.ready='true';
