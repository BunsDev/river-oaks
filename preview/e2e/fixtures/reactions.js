import * as THREE from 'three';
import { AVATAR_PROFILES, loadResidentAvatar } from '../../src/avatars.js';

const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1600,900);renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping;document.querySelector('#canvas-host').append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e7e5df');
scene.add(new THREE.HemisphereLight('#e9f1ff','#898574',2.8));
const sun=new THREE.DirectionalLight('#fff2da',3.5);sun.position.set(3,9,4);scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:'#858b84',roughness:0.95}));floor.rotation.x=-Math.PI/2;scene.add(floor);
const camera=new THREE.PerspectiveCamera(38,1600/900,0.03,100);camera.position.set(0,2.5,10);camera.lookAt(0,0.9,0);
const avatars=await Promise.all(AVATAR_PROFILES.map((profile,index)=>loadResidentAvatar(index,`reaction-${index}`,profile)));
avatars.forEach((avatar,index)=>{avatar.object.position.x=(index-2.5)*1.25;scene.add(avatar.object);});
let now=0;
const bones=['head','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r'];
function step(action,delta=1/60,suspended=false) {
  now+=delta*1000;
  const samples=avatars.map(avatar=>{
    if(suspended)avatar.suspend();
    avatar.update(now,action,false,{speed:0,distance:0},()=>0);avatar.object.updateWorldMatrix(true,true);
    return {profile:avatar.profile,joints:Object.fromEntries(bones.map(name=>[name,avatar.rig.model.getObjectByName(name).quaternion.toArray()])),wrists:['l','r'].map(side=>avatar.rig.model.getObjectByName(`hand_${side}`).getWorldPosition(new THREE.Vector3()).toArray())};
  });
  renderer.render(scene,camera);document.querySelector('#caption').textContent=`Six resident rigs · ${action} · ${(now/1000).toFixed(2)} s`;
  return samples;
}
window.reactionFixture={step};step('idle');document.body.dataset.ready='true';
