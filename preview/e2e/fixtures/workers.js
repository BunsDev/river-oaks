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
const solids=[];interiors.traverse(mesh=>{
  if(!mesh.isInstancedMesh||mesh.geometry.type!=='BoxGeometry'||!/^interior-(marbleTop|walnut|oak|white|black|velvet|leather|stone)$/.test(mesh.material.name))return;
  for(let i=0;i<mesh.count;i++){const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);solids.push({bounds:new THREE.Box3(new THREE.Vector3(-0.5,-0.5,-0.5),new THREE.Vector3(0.5,0.5,0.5)).applyMatrix4(matrix),inverse:matrix.invert()});}
});
const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment();
scene.environment=pmrem.fromScene(environment).texture;scene.environmentIntensity=0.55;environment.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f0f4ff','#938776',1.5));
const sun=new THREE.DirectionalLight('#fff1df',2);scene.add(sun);
const camera=new THREE.PerspectiveCamera(38,1400/900,0.03,100);
let now=0;
function focus(figure) {
  const origin=figure.holder.position,rotation=figure.holder.quaternion;
  const room=figure.holder.parent.userData.room;
  const views=[[1.6,1.25,2.6],[-1.6,1.25,2.6],[1.6,1.25,-2.6],[-1.6,1.25,-2.6],[0,1.5,1.5],[0,1.5,-1.5]]
    .map(offset=>new THREE.Vector3(...offset).applyQuaternion(rotation).add(origin));
  camera.position.copy(views.find(point=>room.contains(point.x,-point.z,0.2))??views[0]);camera.lookAt(origin.clone().add(new THREE.Vector3(0,1,0)));
  sun.position.copy(camera.position).add(new THREE.Vector3(0,2,0));sun.target.position.copy(origin);scene.add(sun.target);
  return [camera.position.x,-camera.position.z,camera.position.y];
}
function inspectSkin(figure) {
  figure.avatar.model.updateMatrixWorld(true);
  const nearby=solids.filter(solid=>solid.bounds.distanceToPoint(figure.holder.position)<2),sides={l:[],r:[]},point=new THREE.Vector3();
  figure.avatar.model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||! /^(young|middleage|old)_/.test(mesh.material?.name??''))return;
    mesh.skeleton.update();const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
    for(const side of ['l','r']){
      const indices=new Set(mesh.skeleton.bones.flatMap((bone,i)=>new RegExp(`^(hand|thumb_0[123]|index_0[123]|middle_0[123]|ring_0[123]|pinky_0[123])_${side}$`).test(bone.name)?[i]:[]));
      for(let i=0;i<position.count;i++){
        let weight=0;for(let k=0;k<4;k++)if(indices.has(skinIndex.getComponent(i,k)))weight+=skinWeight.getComponent(i,k);
        if(weight<0.5)continue;
        point.fromBufferAttribute(position,i);mesh.applyBoneTransform(i,point).applyMatrix4(mesh.matrixWorld);sides[side].push(point.clone());
      }
    }
  });
  return Object.entries(sides).map(([side,vertices])=>{
    let top=-Infinity,bottom=Infinity,under=0,collisions=0;
    for(const vertex of vertices){
      for(const solid of nearby){point.copy(vertex).applyMatrix4(solid.inverse);if(Math.max(Math.abs(point.x),Math.abs(point.y),Math.abs(point.z))<0.499)collisions++;}
      point.copy(vertex);figure.task.object.worldToLocal(point);
      if(Math.abs(point.x)<0.18&&Math.abs(point.z)<0.125){top=Math.max(top,point.y);bottom=Math.min(bottom,point.y);under++;}
    }
    const hand=figure.avatar.model.getObjectByName(`hand_${side}`);
    const wristBend=hand.quaternion.angleTo(figure.avatar.rest.get(hand));
    const wrist=hand.getWorldPosition(new THREE.Vector3()),elbow=figure.avatar.model.getObjectByName(`lowerarm_${side}`).getWorldPosition(new THREE.Vector3());
    const forward=figure.avatar.model.getObjectByName(`middle_01_${side}`).getWorldPosition(new THREE.Vector3()).sub(wrist),forearm=wrist.sub(elbow);
    const across=figure.avatar.model.getObjectByName(`pinky_01_${side}`).getWorldPosition(new THREE.Vector3()).sub(figure.avatar.model.getObjectByName(`index_01_${side}`).getWorldPosition(new THREE.Vector3()));
    // Lateral deviation is measured in the palm plane, including a tilted tapping hand.
    const normal=new THREE.Vector3().crossVectors(forward,across).normalize();
    forward.addScaledVector(normal,-forward.dot(normal));forearm.addScaledVector(normal,-forearm.dot(normal));
    const contact=figure.task.contacts.find(contact=>contact.side===side);
    const targetHeight=figure.task.object.worldToLocal(new THREE.Vector3(...contact.target)).y;
    const elbowHeight=figure.avatar.model.getObjectByName(`lowerarm_${side}`).getWorldPosition(new THREE.Vector3()).y-figure.avatar.model.getObjectByName(`upperarm_${side}`).getWorldPosition(new THREE.Vector3()).y;
    return {side,kind:contact.kind,targetHeight,elbowHeight,top,bottom,under,collisions,wristBend,sidewaysSigned:Math.atan2(new THREE.Vector3().crossVectors(forearm,forward).dot(normal),forearm.dot(forward)),sidewaysBend:forearm.angleTo(forward)};
  });
}
function inspectBody(figure) {
  figure.avatar.model.updateMatrixWorld(true);
  const nearby=solids.filter(solid=>solid.bounds.distanceToPoint(figure.holder.position)<2),point=new THREE.Vector3(),local=new THREE.Vector3();
  let vertices=0,collisions=0;const meshes=[];
  figure.avatar.model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!mesh.visible)return;
    mesh.skeleton.update();const position=mesh.geometry.attributes.position;let hits=0;
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i);mesh.applyBoneTransform(i,point).applyMatrix4(mesh.matrixWorld);vertices++;
      for(const solid of nearby){local.copy(point).applyMatrix4(solid.inverse);if(Math.max(Math.abs(local.x),Math.abs(local.y),Math.abs(local.z))<0.499){hits++;break;}}
    }
    if(hits)meshes.push({name:mesh.material?.name,hits});collisions+=hits;
  });return {vertices,collisions,meshes};
}
function inspect(index,frames=1,{skin=false,body=false,close=false}={}) {
  const figure=people.userData.figures.filter(p=>p.task)[index];if(!figure)return null;
  const visitor=focus(figure),samples=[];
  for(let frame=0;frame<frames;frame++) {
    now+=1000/30;
    // Interrupt an actual work cycle, turn the torso, then resume the same task.
    state.selectedId=frame>=180&&frame<225?figure.id:null;
    people.userData.update(camera,now,state,visitor);
    samples.push({frame,body:body&&[0,120,180,220,300,frames-1].includes(frame)?inspectBody(figure):null,skin:skin&&(frame%60===0||[190,220,260,frames-1].includes(frame))?inspectSkin(figure):null,attention:figure.attention,workTime:figure.workTime,contacts:figure.task.contacts.map(c=>({...c})),position:figure.task.object.position.toArray(),orientation:figure.task.object.quaternion.toArray()});
  }
  if(close){const p=figure.task.object.getWorldPosition(new THREE.Vector3());camera.position.copy(figure.holder.localToWorld(new THREE.Vector3(0.55,figure.task.object.position.y+0.15,0.95)));camera.lookAt(p);}
  renderer.render(scene,camera);document.querySelector('#caption').textContent=`${figure.theme} · ${figure.task.kind} · ${figure.id}`;
  return {id:figure.id,theme:figure.theme,kind:figure.task.kind,docked:figure.task.docked,samples};
}
window.workerFixture={inspect,count:people.userData.figures.filter(p=>p.task).length};
inspect(0);document.body.dataset.ready='true';
