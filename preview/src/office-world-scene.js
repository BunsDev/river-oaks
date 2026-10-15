import * as THREE from 'three';
import { ARRIVAL, arrivalCamera, arrivalFrame, ease } from './office-arrival-model.js';
import { OFFICE_ROOM, OFFICE_SPAWN } from './office-contract.js';
import { buildWorkplaceOffice } from './workplace-office.js';
import { createRemotePlayers } from './remote-players.js';
import { borrowOfficePresentation, officeStreetApproach, createOfficeArrivalClock, officePeerVisible } from './office-world-presentation.js';
import { buildOfficeGeometry } from './office-penthouse-graybox.js';
import { OFFICE_LAYOUT_LEGACY, officeLayout, officeLevelElevation } from './office-layouts.js';
import { createVisitSkyline } from './office-skyline.js';

// The street, car and office share one scene/camera/composer. Once both car
// doors close the outside district is occluded and can stop drawing. The same
// cabin then rises to level 6; there is no framebuffer or scene replacement.
export function createOfficeWorldScene({street,host,self,reducedMotion=false}) {
  const lease=borrowOfficePresentation(street),approach=officeStreetApproach(street),stage=lease.stage,clock=createOfficeArrivalClock();
  let office,actors,disposed=false,started=null,skipped=reducedMotion,lastNow=null,lastBody=null,distance=street.startPose.distance;
  let position=[...OFFICE_SPAWN],yaw=0,current=null,levelId=self.office?.levelId??null,floor=0;
  const layoutId=self.office?.layout??OFFICE_LAYOUT_LEGACY,layout=officeLayout(layoutId);
  const peerRoot=new THREE.Group();street.scene.add(peerRoot);lease.allow(peerRoot);
  const dispose=()=>{if(disposed)return;disposed=true;actors?.dispose();peerRoot.removeFromParent();office?.dispose();lease.dispose();};
  try{
    office=buildOfficeGeometry(THREE,layoutId,{buildLegacy:()=>buildWorkplaceOffice(THREE,OFFICE_ROOM)});stage.add(office.object);office.object.visible=false;
    const lights=[2,-3].map((z,i)=>({position:new THREE.Vector3(0,2.9,z),color:new THREE.Color('#fff1df'),intensity:i?65:45,distance:i?10:7,decay:2}));
    // Preserve the office's authored lighting using the existing world pool.
    // Detached owned light objects have no GPU resources to dispose.
    for(const light of [...office.object.children].filter(n=>n.isPointLight)){
      lights.push({position:light.position.clone(),color:light.color.clone(),intensity:light.intensity,distance:light.distance,decay:light.decay});light.removeFromParent();
    }
    // A layout with an outside shows the district captured once as the doors close (office-skyline.js).
    // It changes the scene only once captured, so it is released with the visit's own dispose below.
    const skyline=createVisitSkyline(street,layout,[stage,street.lobby.object,street.avatar.object,peerRoot]);
    const worldLights=lights.map(light=>({...light,position:light.position.clone()}));
    actors=createRemotePlayers(peerRoot,host,{snapInitialHeading:true,isVisible:p=>current?.done&&officePeerVisible({...p,position:p.office.position},self.id,position,true,levelId)});
    const view=street.startCamera.clone(),localView=new THREE.PerspectiveCamera(),worldRotation=new THREE.Quaternion().setFromRotationMatrix(street.frame);
    const basePosition=new THREE.Vector3().setFromMatrixPosition(street.frame),point=new THREE.Vector3(),worldBody=new THREE.Vector3();
    function prepare(now){
      if(disposed)return;
      const ready=street.avatar.ready;
      if(started===null&&ready)started=now;
      const elapsed=clock.tick(now,ready),time=Math.max(0,elapsed-approach.duration);
      const entering=!skipped&&elapsed<approach.duration;
      const frame=arrivalFrame(time,{reducedMotion:skipped}),aspect=host.clientWidth/Math.max(1,host.clientHeight);
      current={...frame,phase:started===null&&!skipped?'loading':entering?'lobby':frame.phase,ready,progress:skipped?1:Math.min(1,elapsed/(approach.duration+ARRIVAL.duration))};
      const ascent=frame.done?1:ease((time-ARRIVAL.closingEnd)/(ARRIVAL.ascentEnd-ARRIVAL.closingEnd));
      const height=ARRIVAL.officeElevation*ascent;
      stage.position.copy(basePosition);stage.position.y+=height;
      worldLights.forEach((light,i)=>{light.position.copy(lights[i].position).applyMatrix4(street.frame);light.position.y+=height;});
      const lightBlend=skipped?1:ease(elapsed/.8);lease.lights(worldLights,lightBlend);
      const inside=!entering&&(skipped||time>=ARRIVAL.closingEnd);
      // The capture sees the street's own lighting, not the cabin's (office-skyline.js).
      if(inside&&skyline?.pending){lease.lights(worldLights,0);skyline.capture();lease.lights(worldLights,lightBlend);}
      lease.inside(inside);
      office.object.visible=!entering&&['opening','arriving','office'].includes(frame.phase);
      street.lobby.setEntryOpen(entering?ease(elapsed/.8):1);
      street.lobby.update(entering?{phase:'idle',doors:0,floor:1}:frame);
      let body;
      if(entering){
        const start=approach.at(elapsed,aspect);body=start.player;view.position.copy(start.camera);view.quaternion.copy(start.quaternion);view.fov=start.fov;
      }else if(frame.done){
        body=point.set(position[0],floor,-position[1]);view.position.set(position[0],1.68+floor,-position[1]);view.rotation.set(0,yaw,0,'YXZ');view.fov=62;
      }else{
        body=point.set(frame.position[0],0,-frame.position[1]);const path=arrivalCamera(time,{aspect});view.position.fromArray(path.position);view.lookAt(...path.target);view.fov=path.verticalFov;
      }
      // Keep a local camera for the exact first-person boundary and diagnostics.
      localView.copy(view);view.position.applyMatrix4(street.frame);view.position.y+=height;view.quaternion.premultiply(worldRotation);view.aspect=aspect;
      lease.camera(view);
      worldBody.copy(body).applyMatrix4(street.frame);worldBody.y+=height;
      const delta=lastNow===null?0:Math.max(0,(now-lastNow)/1000),dx=lastBody?worldBody.x-lastBody.x:0,dz=lastBody?worldBody.z-lastBody.z:0;
      const speed=delta?Math.hypot(dx,dz)/delta:0;
      if(delta>0)distance+=Math.hypot(dx,dz);
      const firstPerson=frame.done||(!entering&&frame.phase==='arriving'&&localView.position.distanceTo(body)<1.9);
      const ground=worldBody.y;
      street.avatar.setPresentation({...street.startPose,position:[worldBody.x,ground+1.68,worldBody.z],ground,groundAt:()=>ground,altitude:0,flying:false,landing:false,riding:null,sitting:null,roomId:'authorized-office',showBody:!firstPerson&&(entering?street.startPose.showBody:true),speed,velocity:delta?[dx/delta,dz/delta]:[0,0],distance,heading:Math.hypot(dx,dz)>.0001?Math.atan2(dx,dz):undefined});
      lastNow=now;lastBody=worldBody.clone();
      current.position=[body.x,-body.z];
    }
    return {prepare,
      render(now,nextPosition,nextYaw,players,place={}){
        if(disposed)return null;position=[...nextPosition];yaw=nextYaw;
        levelId=place.levelId??levelId;floor=layout?officeLevelElevation(layout,levelId)??0:0;
        if(lastNow!==now)prepare(now);
        if(current.done){view.position.set(position[0],1.68+floor,-position[1]).applyMatrix4(street.frame);view.position.y+=ARRIVAL.officeElevation;view.rotation.set(0,yaw,0,'YXZ');view.quaternion.premultiply(worldRotation);lease.camera(view);}
        actors.sync(players.filter(p=>p.id!==self.id&&p.office?.id===self.office.id).map(p=>{
          const v=new THREE.Vector3(p.office.position[0],p.office.elevation??0,-p.office.position[1]).applyMatrix4(street.frame);v.y+=ARRIVAL.officeElevation;
          return {...p,position:[v.x,-v.z,v.y],yaw:p.office.yaw+Math.atan2(street.frame.elements[8],street.frame.elements[10]),altitude:0,vehicle:null,sitting:null,interaction:null};
        }),null);
        actors.update(now,street.camera);office.update?.(now/1000);lease.render(1/60);return current;
      },
      skip(){skipped=true;},get position(){return current?.position??position;},
      inspect(){return {camera:{position:street.camera.position.toArray(),quaternion:street.camera.quaternion.toArray(),verticalFov:street.camera.fov},actors:actors.stats(),duration:approach.duration+ARRIVAL.duration,dimensions:ARRIVAL,presentation:'shared-world',skyline:skyline?.stats??null,elevation:stage.position.y-basePosition.y,phase:current?.phase,progress:current?.progress,skipped,avatar:street.avatar.object.position.toArray()};},
      dispose(){skyline?.dispose();dispose();},
    };
  }catch(error){dispose();throw error;}
}
