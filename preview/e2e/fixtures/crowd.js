import * as THREE from 'three';
import { createCommunity } from '../../src/community.js';
import { createResidentLife, stepResidentLife } from '../../src/resident-life.js';
import { buildLocals } from './local-models.js';
import { pickPerson } from '../../src/people-picking.js';

const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(1600,900);renderer.shadowMap.enabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
document.querySelector('#canvas-host').append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e7e5df');
const camera=new THREE.PerspectiveCamera(42,1600/900,0.05,100);
camera.position.set(10,8,13);camera.lookAt(0,0.8,-5.5);
scene.add(new THREE.HemisphereLight('#e9f1ff','#898574',2.8));
const sun=new THREE.DirectionalLight('#fff2da',3.5);sun.position.set(3,9,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-15,right:15,top:15,bottom:-15});scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(45,45),new THREE.MeshStandardMaterial({color:'#858b84',roughness:0.95}));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const sidewalk=new THREE.Mesh(new THREE.BoxGeometry(40,0.02,2.85),new THREE.MeshStandardMaterial({color:'#c9c6bc',roughness:0.9}));
sidewalk.position.set(0,-0.008,-5.675);sidewalk.receiveShadow=true;scene.add(sidewalk);
const blocker=new THREE.Mesh(new THREE.PlaneGeometry(1.1,2),new THREE.MeshStandardMaterial({color:'#6b7773',side:THREE.DoubleSide}));
blocker.visible=false;scene.add(blocker);
const starts=[-5,-7,-9,5,7,9],ends=[9,7,5,-9,-7,-5];
const turning=new URLSearchParams(location.search).get('scenario')==='turns';sidewalk.visible=!turning;
const world={scene:'district',bounds_m:[-20,-20,20,20],collisionPolygons:[],walkSurfaceOffset:0,roads:turning?[]:[{id:'street',width_m:8,points:[[-20,0,0],[20,0,0]]}],communityLocations:starts.map((x,i)=>({id:`stop-${i}`,name:`Stop ${i}`,position:turning?[-6,i*2.5,0]:[x,5.5,0]}))};
const state=createCommunity(world),life=createResidentLife(world,state),group=buildLocals(world,state.locals);scene.add(group);
await group.userData.ready;
const models=group.userData.models;
state.locals.forEach((local,i)=>Object.assign(local.life,{heading:turning||i<3?Math.PI/2:-Math.PI/2,route:turning?[[0,i*2.5],[0,i*2.5+1],[-6,i*2.5+1]]:[[ends[i],5.5]],destination:{id:`end-${i}`,name:'Destination'}}));
let frame=-1;const samples=[];
function step() {
  frame++;stepResidentLife(life,1/60);
  state.locals.forEach(local=>{if(local.life.visits)local.life.waitUntil=Infinity;});
  group.userData.update(state,camera,frame*1000/60,null,null);
  for(const [i,model] of models.entries()) {
    const avatar=model.userData.avatar;avatar.rig.model.updateMatrixWorld(true);
    samples.push({frame,id:state.locals[i].id,position:[...state.locals[i].position],heading:state.locals[i].life.heading,speed:state.locals[i].life.speed,feet:avatar.feet.map(leg=>{
      const source=leg.rollPose?leg.soleSources[leg.rollPose.pivotId]:null;
      return {side:leg.side,contact:leg.contact,target:(leg.ikTarget??leg.target).toArray(),actual:leg.foot.getWorldPosition(new THREE.Vector3()).toArray(),plantOrientation:leg.orientation.toArray(),pivot:leg.rollPose?.pivotId,
        support:source?source.mesh.getVertexPosition(source.index,new THREE.Vector3()).applyMatrix4(source.mesh.matrixWorld).toArray():null};
    })});
  }
}
function render() {renderer.render(scene,camera);document.querySelector('#caption').textContent=`Six actual rigs · ${turning?'sharp corners and reversals':'opposing sidewalk crowds'} · frame ${frame}`;}
const raycaster=new THREE.Raycaster();
renderer.domElement.addEventListener('pointerup',event=>{
  const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
  document.querySelector('#picked').dataset.id=pickPerson(raycaster,models,[blocker],()=>true) ?? '';
});
window.crowdFixture={
  advance(target) {while(frame<target)step();render();return {frame,samples:samples.splice(0),arrived:state.locals.filter(l=>l.life.visits>0).length};},
  focus(index,obstruct=false) {
    const person=models[index],target=person.getObjectByName('head').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,0.07,0));
    const forward=new THREE.Vector3(Math.sin(state.locals[index].life.heading),0,Math.cos(state.locals[index].life.heading));
    camera.position.copy(target).addScaledVector(forward,3.3).add(new THREE.Vector3(0,0.4,0));camera.lookAt(target);
    blocker.visible=obstruct;blocker.position.copy(target).lerp(camera.position,0.5);blocker.lookAt(camera.position);
    render();const point=target.project(camera);document.querySelector('#picked').dataset.id='';
    return {id:state.locals[index].id,screen:[(point.x+1)*800,(1-point.y)*450],speed:state.locals[index].life.speed};
  },
  wide() {blocker.visible=false;camera.position.set(10,8,13);camera.lookAt(0,0.8,-5.5);render();},
};
step();render();document.body.dataset.ready='true';
