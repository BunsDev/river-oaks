import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWishDog } from '../../src/wish-dog.js';

const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#c9c5c0');
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room);scene.environment=env.texture;scene.environmentIntensity=.6;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f5f0e7','#aea297',.8));
const sun=new THREE.DirectionalLight('#fff2df',2.6);sun.position.set(2,5,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3});sun.shadow.normalBias=.006;scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#c9c5c0',roughness:.83}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const dog=createWishDog('studio');scene.add(dog.object);await dog.ready;
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.02,100);
function render(view='three-quarter',age=0){
  dog.update(age,'gift');camera.position.set(...(view==='front'?[0,1.1,2.8]:view==='side'?[3,1.2,0]:[2,1.35,2.8]));camera.lookAt(0,.5,0);renderer.render(scene,camera);
  return {ready:dog.loaded,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
window.dogFixture={render,dog};render();document.body.dataset.ready=String(dog.loaded);
