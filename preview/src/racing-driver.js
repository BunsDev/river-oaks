import * as THREE from 'three';
import {loadResidentAvatar} from './avatars.js';
import {createPrinceCostume,loadPrinceSkinTexture} from './prince-costume.js';
import {createDrivingHands} from './driving-hands.js';

// Jev at the wheel of every Garden Circuit vehicle (Val, 2026-10-31): the town's Prince
// Jev hero, costume and driving hands (carriage-driver.js), seated locally on the practice
// page. Practice is local, so the town's rule that Jev chauffeurs only the pink car
// (vehicle-config.js) is untouched.
export function createRacingDriver({loadAvatar=loadResidentAvatar,loadSkinTexture=loadPrinceSkinTexture,createCostume=createPrinceCostume}={}) {
 const object=new THREE.Group();object.name='Prince Jev';object.rotation.y=-Math.PI/2;
 let avatar=null,costume=null,hands=null,disposed=false,vehicle=null,spec=null;
 const seat=()=>{if(avatar&&spec)object.position.set(spec.driverSeat[0],spec.driverSeat[1]-avatar.rig.hipHeight+.025,spec.driverSeat[2]);};
 const ready=Promise.all([loadAvatar(1,'race-driver','prince-jev',{folk:false}),loadSkinTexture().catch(()=>null)]).then(([next,skinTexture])=>{
  if(disposed){next.dispose();return false;}
  avatar=next;object.add(next.object);costume=createCostume(next,{skinTexture});
  if(next.rig?.model)hands=createDrivingHands(next.rig.model,object);
  seat();return true;
 });
 return {
  object,ready,
  get avatar(){return avatar;},
  /** Seats him in this vehicle model (road-vehicles.js); the previous seat is left. */
  board(model){vehicle=model.object;spec=model.spec;object.removeFromParent();vehicle.add(object);seat();},
  update(now,state,{camera=null,viewportHeight=0}={}) {
   if(!avatar||!vehicle||!spec)return;
   hands?.reset();
   avatar.update(now,'continue',false,{riding:true,ridingDriver:true,ridingKind:spec.kind,ridingSpeed:state.speed??0,ridingSteering:state.steering??0,ridingDistance:state.distance??0,seatToFloor:spec.driverSeat[1]-spec.driverFloor,speed:0},()=>0,null,{conversing:false});
   hands?.(vehicle,spec);
   object.updateWorldMatrix(true,true);costume?.update({carrying:false});
   if(camera)costume?.updateOptics?.(camera,viewportHeight);
  },
  dispose(){disposed=true;costume?.dispose();avatar?.dispose();object.removeFromParent();vehicle=null;},
 };
}
