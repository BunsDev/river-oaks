import * as THREE from 'three';
import { ARRIVAL, arrivalCamera, ease } from './office-arrival-model.js';

// Advance only through frames we can present. Shader compilation, a suspended
// tab or a delayed avatar must not consume the journey before it is visible.
export function createOfficeArrivalClock() {
  let previous=null,elapsed=0;
  return {tick(now,ready){
    if(!ready){previous=null;return elapsed;}
    if(previous!==null)elapsed+=Math.min(.08,Math.max(0,(now-previous)/1000));
    previous=now;return elapsed;
  }};
}

// In first person, hide only bodies that would overlap the eye: the viewer's own, and a
// peer close by on the same floor. A peer on another penthouse floor is never in the way.
export function officePeerVisible(player,selfId,position,firstPerson,levelId=null) {
  if(!firstPerson)return true;
  if(player.id===selfId)return false;
  if(levelId&&player.office?.levelId&&player.office.levelId!==levelId)return true;
  return Math.hypot(player.position[0]-position[0],player.position[1]-position[1])>=.9;
}

// A presentation lease borrows the actual street camera, avatar and lobby. It
// never changes walking/server coordinates, and releases only resources it owns.
export function captureOfficeStreet({scene,camera,pipeline,renderer=null,skyline=null,lights=[],avatar,lobby,world,getWorld,pose}) {
  if(!lobby||!pose||!avatar)return null;
  lobby.object.updateWorldMatrix(true,false);
  return {scene,camera,pipeline,renderer,skyline,lights,avatar,lobby,world,getWorld,startCamera:camera.clone(),
    startPose:{...pose,position:[...pose.position],velocity:[...pose.velocity]},
    startAvatar:{position:avatar.object.position.clone(),quaternion:avatar.object.quaternion.clone(),visible:avatar.object.visible},
    frame:lobby.object.matrixWorld.clone()};
}

export function officeStreetApproach(street) {
  const inverse=street.frame.clone().invert(),rotation=new THREE.Quaternion().setFromRotationMatrix(street.frame);
  const start=street.startAvatar.position.clone().applyMatrix4(inverse),eye=street.startCamera.position.clone().applyMatrix4(inverse);
  const startAim=rotation.clone().invert().multiply(street.startCamera.quaternion);
  const duration=Math.max(2.4,(Math.abs(start.x)+Math.abs(start.z-ARRIVAL.start))/2.2);
  const localCamera=new THREE.PerspectiveCamera();
  return {duration,at(seconds,aspect){
    const t=Math.max(0,Math.min(duration,seconds)),align=ease(t/(duration*.45)),advance=ease((t-duration*.25)/(duration*.75));
    const player=new THREE.Vector3(start.x*(1-align),start.y*(1-ease(t/duration)),THREE.MathUtils.lerp(start.z,ARRIVAL.start,advance));
    const end=arrivalCamera(0,{aspect});
    const camera=new THREE.Vector3(THREE.MathUtils.lerp(eye.x,end.position[0],align),THREE.MathUtils.lerp(eye.y,end.position[1],ease(t/duration)),THREE.MathUtils.lerp(eye.z,end.position[2],advance));
    localCamera.position.fromArray(end.position);localCamera.lookAt(...end.target);
    const quaternion=startAim.clone().slerp(localCamera.quaternion,ease(t/(duration*.8)));
    return {player,camera,quaternion,fov:THREE.MathUtils.lerp(street.startCamera.fov,end.verticalFov,ease(t/duration))};
  }};
}

export function borrowOfficePresentation(street) {
  const {scene,camera,avatar,lobby}=street,stage=new THREE.Group(),hidden=new Map(),allowed=new Set([stage,avatar.object]);
  const lighting=(street.lights??[]).map(light=>({light,position:light.position.clone(),color:light.color.clone(),intensity:light.intensity,distance:light.distance,decay:light.decay}));
  const parent=lobby.object.parent,position=lobby.object.position.clone(),quaternion=lobby.object.quaternion.clone(),scale=lobby.object.scale.clone();
  street.frame.decompose(stage.position,stage.quaternion,stage.scale);
  stage.name='Authorized office visit';scene.add(stage);stage.add(lobby.object);
  lobby.object.position.set(0,0,0);lobby.object.quaternion.identity();lobby.object.scale.set(1,1,1);
  let disposed=false,interior=false;
  const applyVisibility=()=>{
    if(!interior)return;
    for(const object of scene.children)if(!allowed.has(object)&&!object.isLight){if(!hidden.has(object))hidden.set(object,object.visible);object.visible=false;}
  };
  return {stage,
    allow(object){allowed.add(object);},
    inside(value){interior=value;applyVisibility();},
    camera(view){camera.position.copy(view.position);camera.quaternion.copy(view.quaternion);camera.fov=view.fov;camera.aspect=view.aspect;camera.updateProjectionMatrix();camera.updateMatrixWorld();},
    lights(sources,blend=1){
      // Reuse the district's fixed light pool. Changing the number of lights
      // recompiles every visible PBR material, including those outside the car.
      lighting.forEach((saved,index)=>{
        const target=sources[index],light=saved.light;
        light.position.copy(saved.position);light.color.copy(saved.color);light.distance=saved.distance;light.decay=saved.decay;
        light.intensity=THREE.MathUtils.lerp(saved.intensity,target?.intensity??0,blend);
        if(target){light.position.lerp(target.position,blend);light.color.lerp(target.color,blend);light.distance=THREE.MathUtils.lerp(saved.distance,target.distance,blend);light.decay=THREE.MathUtils.lerp(saved.decay,target.decay,blend);}
      });
    },
    render(delta){applyVisibility();street.pipeline.render(delta);},
    dispose(){
      if(disposed)return;disposed=true;
      avatar.setPresentation(null);avatar.object.position.copy(street.startAvatar.position);avatar.object.quaternion.copy(street.startAvatar.quaternion);avatar.object.visible=street.startAvatar.visible;
      // A resize during the visit changes the viewport, not the original pose.
      const aspect=camera.aspect;camera.copy(street.startCamera);camera.aspect=aspect;camera.updateProjectionMatrix();camera.updateMatrixWorld();
      for(const[object,visible]of hidden)object.visible=visible;
      for(const saved of lighting){const light=saved.light;light.position.copy(saved.position);light.color.copy(saved.color);light.intensity=saved.intensity;light.distance=saved.distance;light.decay=saved.decay;}
      parent?.add(lobby.object);lobby.object.position.copy(position);lobby.object.quaternion.copy(quaternion);lobby.object.scale.copy(scale);
      lobby.setEntryOpen(0);lobby.update({phase:'idle',doors:0,floor:1});stage.removeFromParent();
    },
  };
}
