import * as THREE from 'three';
import { groundSurfaceHeight } from '../../src/world-surface.js';
import { loadResidentAvatar } from '../../src/avatars.js';

// Generic appearances; named cultural guests are labeled fictional portrayals.
export function buildLocals(world, locals) {
  const group = new THREE.Group();
  const skins = ['#b98162', '#d1a085', '#8c5e48', '#dda88d'];
  const shirts = ['#e6dfcd', '#677d72', '#536777', '#a8866b', '#b9bbac', '#394a4b'];
  const models = [];
  let disposed = false, ready = 0;
  const disposePlaceholder = person => {
    const materials=new Set();
    person.traverse(item=>{item.geometry?.dispose(); if(item.material) materials.add(item.material);});
    materials.forEach(material=>material.dispose()); person.clear();
  };
  const loads = [];
  locals.forEach((local, index) => {
    const person = new THREE.Group(); person.userData.localId = local.id;
    const skin = new THREE.MeshStandardMaterial({ color: skins[index % skins.length], roughness: 0.72 });
    const clothing = new THREE.MeshStandardMaterial({ color: shirts[index % shirts.length], roughness: 0.93 });
    const trousers = new THREE.MeshStandardMaterial({ color: index % 2 ? '#303b42' : '#9d9686', roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: '#252b28', roughness: 0.82 });
    const mesh = (geometry, material, position, scale = [1,1,1], parent = person) => {
      const item = new THREE.Mesh(geometry, material); item.position.fromArray(position); item.scale.fromArray(scale); item.castShadow = item.receiveShadow = true; item.userData.localId = local.id; parent.add(item); return item;
    };
    mesh(new THREE.CapsuleGeometry(0.17,0.28,6,10),clothing,[0,1.22,0],[1.28,1,0.75]);
    mesh(new THREE.CylinderGeometry(0.065,0.075,0.12,8),skin,[0,1.54,0]);
    mesh(new THREE.SphereGeometry(0.12,16,12),skin,[0,1.7,0],[0.86,1.16,0.91]);
    mesh(new THREE.SphereGeometry(0.124,12,8,0,Math.PI*2,0,1.6),dark,[0,1.73,0],[0.89,1,0.95]);
    mesh(new THREE.SphereGeometry(0.018,8,6),skin,[0,1.695,0.11],[0.75,1,1.4]);
    for (const side of [-1,1]) {
      mesh(new THREE.CapsuleGeometry(0.065,0.57,5,8),trousers,[side*0.095,0.55,0]);
      mesh(new THREE.SphereGeometry(0.07,10,8),dark,[side*0.095,0.14,0.047],[0.8,0.65,1.65]);
      const arm = new THREE.Group(); arm.position.set(side*0.235,1.4,0); person.add(arm);
      mesh(new THREE.CapsuleGeometry(0.055,0.36,5,8),clothing,[0,-0.2,0],[1,1,1],arm);
      mesh(new THREE.SphereGeometry(0.052,8,8),skin,[0,-0.45,0],[0.75,1.35,0.7],arm);
      if (side === 1) person.userData.greetingArm = arm;
      mesh(new THREE.SphereGeometry(0.009,6,5),dark,[side*0.043,1.73,0.1]);
    }
    person.position.set(local.position[0],groundSurfaceHeight(world,local.position[0],-local.position[1]),-local.position[1]);
    person.rotation.y = index*2.4; person.scale.setScalar(0.94+(index%4)*0.035); group.add(person); models.push(person);
    loads.push(loadResidentAvatar(index,local.id).then(avatar=>{
      if (disposed) { avatar.dispose(); return; }
      disposePlaceholder(person); person.scale.setScalar(1); person.add(avatar.object);
      person.userData.avatar=avatar; ready++;
      document.querySelector('#canvas-host').dataset.charactersReady=String(ready);
    }).catch(()=>{
      if (!disposed) document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));
    }));
  });
  document.querySelector('#canvas-host').dataset.charactersReady='0';
  group.userData.ready=Promise.allSettled(loads);
  group.userData.models=models;
  group.userData.dispose=()=>{
    disposed=true;
    for(const person of models) {
      if(person.userData.avatar) person.userData.avatar.dispose(); else disposePlaceholder(person);
    }
    group.clear();
  };
  group.userData.update = (state, camera, now, speakingId, visitor) => {
    let visibleKits=0;
    models.forEach((person,index) => {
      const local = state.locals.find(local => local.id === person.userData.localId);
      if (!local) return;
      person.position.set(local.position[0],groundSurfaceHeight(world,local.position[0],-local.position[1]),-local.position[1]);
      const visit=state.jobs.find(job=>job.phase==='assisting' && (job.helperId===local.id || job.localId===local.id));
      const partner=visit?state.locals.find(other=>other.id===(visit.helperId===local.id?visit.localId:visit.helperId)):null;
      person.visible = (person.position.distanceTo(camera.position)<120 || state.selectedId===local.id);
      // Simulation owns facing through conversations, assistance and route release.
      if(local.life) person.rotation.y=local.life.heading;
      const action= state.selectedId===local.id ? local.action : (partner?'greet':local.life?.action ?? local.action);
      const lookTarget=visitor && state.selectedId===local.id ? [visitor[0],visitor[2],-visitor[1]] : null;
      if(person.userData.avatar) {
        if(person.visible) {
          // A resident resting on a bench sits at its height in the seated pose.
          const seat=local.life?.seat,avatar=person.userData.avatar;
          avatar.object.position.y=seat?seat.height-avatar.rig.hipHeight+.025:0;
          const locomotion=seat?{...local.life,speed:0,riding:true,ridingKind:'bench',seatToFloor:seat.height}:local.life;
          avatar.update(now,action,speakingId===local.id,locomotion,(x,z)=>groundSurfaceHeight(world,x,z),lookTarget);if(avatar.carrying) visibleKits++;
        }
        else person.userData.avatar.suspend();
        return;
      }
      const arm = person.userData.greetingArm;
      arm.rotation.z = action === 'greet' ? -2.3 : -0.07;
      arm.rotation.x = action === 'greet' ? Math.sin(now*0.006)*0.2 : 0;
      person.userData.reaction = action;
    });
    const host=document.querySelector('#canvas-host');
    if(host.dataset.volunteerKits!==String(visibleKits)) host.dataset.volunteerKits=String(visibleKits);
  };
  return group;
}
