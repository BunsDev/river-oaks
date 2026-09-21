import * as THREE from 'three';
import { loadResidentAvatar, AVATAR_PROFILES } from '../../src/avatars.js';
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(1600,900);renderer.shadowMap.enabled=true;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e7e5df');
const camera=new THREE.PerspectiveCamera(42,1600/900,0.05,100);
scene.add(new THREE.HemisphereLight('#e9f1ff','#898574',2.8));
const sun=new THREE.DirectionalLight('#fff2da',3.5);sun.position.set(3,9,4);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10});scene.add(sun);
const ground=(x,z)=>0.045*z;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:'#afaea4',roughness:0.95}));
floor.rotation.x=-Math.PI/2-Math.atan(0.045);floor.receiveShadow=true;scene.add(floor);
const avatars=await Promise.all(AVATAR_PROFILES.map((_,index)=>loadResidentAvatar(index,`fixture-${index}`)));
avatars.forEach(avatar=>scene.add(avatar.object));
let frame=-1,distance=0,x=0,z=0;
const samples=[];
function step() {
  frame++;
  const speed=frame<45?1.1*frame/45:frame<210?1.1:frame<255?1.1*(255-frame)/45:0;
  const heading=frame<75?0:Math.min(Math.PI/2,(frame-75)/90*Math.PI/2);
  distance+=speed/60;x+=Math.sin(heading)*speed/60;z+=Math.cos(heading)*speed/60;
  for(const [index,avatar] of avatars.entries()) {
    const east=x+(index-2.5)*1.6;
    avatar.object.position.set(east,ground(east,z),z);avatar.object.rotation.y=heading;
    avatar.update(frame*1000/60,'continue',false,{speed,distance},ground);
    samples.push({frame,profile:avatar.profile,speed,feet:avatar.feet.map(leg=>({side:leg.side,contact:leg.contact,target:leg.target.toArray(),actual:leg.foot.getWorldPosition(new THREE.Vector3()).toArray(),orientation:leg.orientation.toArray(),error:leg.error}))});
  }
}
function render() {
  camera.position.set(x+7,4.5,z+10.5);camera.lookAt(x,0.9,z);
  renderer.render(scene,camera);
  document.querySelector('#caption').textContent=`Six shipped rigs · frame ${frame} · acceleration / turn / slope / stop`;
}
window.motionFixture={
  advance(target) {while(frame<target) step();render();return {frame,samples:samples.splice(0)};},
  dispose() {avatars.forEach(avatar=>avatar.dispose());renderer.dispose();},
};
step();render();document.body.dataset.ready='true';
