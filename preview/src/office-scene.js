import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorkplaceOffice } from './workplace-office.js';
import { OFFICE_ROOM, OFFICE_SPAWN, elevatorFrame } from './office-contract.js';
import { createRemotePlayers } from './remote-players.js';

export function officePlayerVisible(player,selfId,position,firstPerson){
  // Keep the camera clear when guests share the arrival point or pass through
  // each other, as district players can. This changes rendering, not authority.
  return !firstPerson||(player.id!==selfId&&Math.hypot(player.position[0]-position[0],player.position[1]-position[1])>=.9);
}

// One bounded scene on the existing renderer; no extra canvas or render loop.
export function createOfficeScene({renderer,host,self,players,reducedMotion=false}) {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#161b22');
  const camera=new THREE.PerspectiveCamera(62,1,.05,100);
  const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment();
  const target=pmrem.fromScene(environment);scene.environment=target.texture;scene.environmentIntensity=.65;environment.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#fff5e6','#647386',1.6));
  const light=new THREE.DirectionalLight('#fff1de',2.5);light.position.set(2,6,2);scene.add(light);
  const office=buildWorkplaceOffice(THREE,OFFICE_ROOM);scene.add(office.object);
  const lift=new THREE.Group();scene.add(lift);const resources=[];
  const mat=(color,metalness=.4)=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness:.35});resources.push(m);return m;};
  const bronze=mat('#aa8655',.75),wall=mat('#292e36',.6),ivory=mat('#f3e8d5',.1);
  const add=(w,h,d,x,y,z,m)=>{const g=new THREE.BoxGeometry(w,h,d),mesh=new THREE.Mesh(g,m);resources.push(g);mesh.position.set(x,y,z);lift.add(mesh);return mesh;};
  // A 3.2 m wide car clears the existing 2.6 m doorway height and all playable bodies.
  add(3.2,.08,4,0,-.04,2,wall);add(.12,3.3,4,-1.65,1.65,2,wall);add(.12,3.3,4,1.65,1.65,2,wall);
  add(3.4,.12,4,0,3.35,2,wall);
  add(3.1,.06,.1,0,3.22,.2,ivory);add(3.1,.06,.1,0,3.22,3.7,ivory);
  for(const x of [-1.55,1.55])add(.05,.05,3.7,x,1.1,2,bronze);
  // A through-car lift: enter from the lobby at z=4, leave on the office
  // side at z=0. Both portals are sealed during the ride.
  add(5,.08,3,0,-.04,5.5,wall);
  const portal=z=>{
    for(const sign of [-1,1])add(.75,3.3,.12,sign*1.235,1.65,z,wall);
    add(1.72,.7,.12,0,2.95,z,wall);
    return [-1,1].map(sign=>add(.86,2.6,.08,sign*.43,1.3,z,bronze));
  };
  const frontDoors=portal(.04),rearDoors=portal(4);
  let firstPerson=false;
  const actors=createRemotePlayers(scene,host,{isVisible:player=>officePlayerVisible(player,self.id,lastPosition,firstPerson)});
  let started=null,skipped=reducedMotion,disposed=false,lastPosition=[...OFFICE_SPAWN];
  function render(now,position,yaw,allPlayers) {
    if(disposed)return null;
    const ready=actors.stats().some(a=>a.id===self.id&&a.ready);
    if(started===null&&ready)started=now;
    const frame=elevatorFrame(started===null?0:(now-started)/1000,{reducedMotion:skipped});
    const walking=frame.done,at=walking?position:frame.position;firstPerson=walking;
    lastPosition=[...at];
    const activePlayers=allPlayers.filter(p=>p.office?.id===self.office.id);
    actors.sync(activePlayers.map(p=>({...p,position:p.id===self.id?[...at,0]:[...p.office.position,0],yaw:p.id===self.id?(walking?yaw:0):p.office.yaw,altitude:0,vehicle:null,sitting:null,interaction:null})),null);
    const arriving=['opening','arriving','office'].includes(frame.phase);
    for(let i=0;i<2;i++){
      frontDoors[i].position.x=(i?1:-1)*(.43+(arriving?frame.doors:0)*1.12);
      rearDoors[i].position.x=(i?1:-1)*(.43+(['boarding','closing'].includes(frame.phase)?frame.doors:0)*1.12);
    }
    office.object.visible=walking||['opening','arriving'].includes(frame.phase);
    // During ascent the sealed doors hide the destination. The camera starts
    // behind the boarding player, cuts inside the car, then follows them out.
    if(!walking){
      const boarding=frame.phase==='boarding';
      camera.position.set(boarding?1.25:.95,boarding?1.9:1.7,boarding?7.2:2.7);
      camera.lookAt(0,1.25,-at[1]-.7);
    }else{
      // First person keeps the camera inside the room walls.
      camera.position.set(position[0],1.68,-position[1]);
      camera.rotation.set(0,yaw,0,'YXZ');
    }
    camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);camera.updateProjectionMatrix();
    actors.update(now,camera);
    // Hide the local body in first person; keep the real avatar throughout the film.
    office.update?.(now/1000);
    renderer.render(scene,camera);
    return {...frame,phase:started===null?'loading':frame.phase,position:[...at],ready};
  }
  // Prime async appearance loads before the first frame.
  actors.sync(players.filter(p=>p.office?.id===self.office.id).map(p=>({...p,position:[...(p.id===self.id&&!reducedMotion?elevatorFrame(0).position:p.office.position),0],altitude:0,vehicle:null,sitting:null,interaction:null})),null);
  return {render,skip(){skipped=true;},get position(){return lastPosition;},dispose(){if(disposed)return;disposed=true;actors.dispose();office.dispose();for(const r of resources)r.dispose();target.dispose();scene.clear();}};
}
