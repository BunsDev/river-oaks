import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorkplaceOffice } from './workplace-office.js';
import { OFFICE_ROOM, OFFICE_SPAWN, elevatorFrame } from './office-contract.js';
import { createRemotePlayers } from './remote-players.js';
import { arrivalCamera, ARRIVAL, OFFICE_FINISH } from './office-arrival-model.js';
import { buildOfficeArrival } from './office-arrival-architecture.js';
import { createOfficeWorldScene } from './office-world-scene.js';
import { officePeerVisible } from './office-world-presentation.js';
import { buildOfficeGeometry } from './office-penthouse-graybox.js';
import { OFFICE_EYE_HEIGHT, OFFICE_LAYOUT_LEGACY, OFFICE_SEATED_EYE_HEIGHT, officeLayout, officeLevelElevation, officeSeatedPose } from './office-layouts.js';

// Keep the eye clear when residents share the arrival point or pass each other.
export const officePlayerVisible=officePeerVisible;

// One bounded scene on the existing renderer; no extra canvas or render loop.
export function createOfficeScene({renderer,host,self,players,reducedMotion=false,street=null}) {
  if(street)return createOfficeWorldScene({street,host,self,reducedMotion});
  const scene=new THREE.Scene();scene.background=new THREE.Color(OFFICE_FINISH.stone);
  const camera=new THREE.PerspectiveCamera(62,1,.05,100);
  let target,office,lift,actors,disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;actors?.dispose();office?.dispose();lift?.dispose();target?.dispose();scene.clear();};
  try{
  const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment();
  try{target=pmrem.fromScene(environment);scene.environment=target.texture;scene.environmentIntensity=.65;}finally{environment.dispose();pmrem.dispose();}
  scene.add(new THREE.HemisphereLight('#fff5e6','#647386',1.6));
  const light=new THREE.DirectionalLight('#fff1de',2.5);light.position.set(2,6,2);scene.add(light);
  const layout=officeLayout(self.office?.layout??OFFICE_LAYOUT_LEGACY)??{id:self.office.layout};
  office=buildOfficeGeometry(THREE,layout.id,{buildLegacy:()=>buildWorkplaceOffice(THREE,OFFICE_ROOM)});scene.add(office.object);
  lift=buildOfficeArrival();scene.add(lift.object);
  let firstPerson=false;
  actors=createRemotePlayers(scene,host,{snapInitialHeading:true,isVisible:player=>officePlayerVisible(player,self.id,lastPosition,firstPerson,levelId)});
  let started=null,skipped=reducedMotion,lastPosition=[...OFFICE_SPAWN],levelId=self.office?.levelId??null;
  function render(now,position,yaw,allPlayers,place={}) {
    if(disposed)return null;
    levelId=place.levelId??levelId;const floor=officeLevelElevation(layout,levelId)??0;
    const ready=actors.stats().some(a=>a.id===self.id&&a.ready);
    if(started===null&&ready)started=now;
    const elapsed=started===null?0:(now-started)/1000,frame=elevatorFrame(elapsed,{reducedMotion:skipped});
    const walking=frame.done,at=walking?position:frame.position;firstPerson=walking;
    lastPosition=[...at];
    const activePlayers=allPlayers.filter(p=>p.office?.id===self.office.id);
    actors.sync(activePlayers.map(p=>({...p,position:p.id===self.id?[...at,walking?floor:0]:[...p.office.position,p.office.elevation??0],yaw:p.id===self.id?(walking?yaw:0):p.office.yaw,altitude:0,vehicle:null,sitting:p.id===self.id?null:officeSeatedPose(layout,p.office),interaction:null})),null);
    lift.update(frame);
    office.object.visible=walking||['opening','arriving'].includes(frame.phase);
    if(!walking){
      const path=arrivalCamera(elapsed,{aspect:host.clientWidth/Math.max(1,host.clientHeight)});
      camera.position.fromArray(path.position);camera.lookAt(...path.target);
      // Entering first person must not put the eye inside the local head/body.
      firstPerson=frame.phase==='arriving'&&Math.hypot(camera.position.x-at[0],camera.position.z+at[1])<.95;
    }else{
      // First person keeps the camera inside the room walls.
      camera.position.set(position[0],(place.seatId?OFFICE_SEATED_EYE_HEIGHT:OFFICE_EYE_HEIGHT)+floor,-position[1]);
      camera.rotation.set(0,yaw,0,'YXZ');
    }
    camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);camera.updateProjectionMatrix();
    actors.update(now,camera);
    // Hide the local body in first person; keep the real avatar throughout the film.
    office.update?.(now/1000);
    renderer.render(scene,camera);
    return {...frame,phase:started===null&&!skipped?'loading':frame.phase,position:[...at],ready};
  }
  // Prime async appearance loads before the first frame.
  actors.sync(players.filter(p=>p.office?.id===self.office.id).map(p=>({...p,position:[...(p.id===self.id&&!reducedMotion?elevatorFrame(0).position:p.office.position),0],yaw:p.id===self.id&&!reducedMotion?0:p.office.yaw,altitude:0,vehicle:null,sitting:null,interaction:null})),null);
  return {render,skip(){skipped=true;},get position(){return lastPosition;},
    inspect({bounds=false}={}){return {camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),verticalFov:camera.fov},actors:actors.stats(),...(bounds?{bounds:actors.bounds()}:{}),duration:ARRIVAL.duration,dimensions:lift.dimensions};},
    dispose};
  }catch(error){dispose();throw error;}
}
