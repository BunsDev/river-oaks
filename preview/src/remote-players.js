import * as THREE from 'three';
import { AVATAR_PROFILES, loadResidentAvatar } from './avatars.js';
import { createPlayerCostume } from './player-costume.js';
import { createFlightVehicle } from './flight-vehicles.js';
import { createRoadVehicle } from './road-vehicles.js';
import { VEHICLES, vehicleKind } from './vehicle-config.js';
import { permittedAppearance, sharedAppearance } from './shared-appearances.js';
import { traversalForAppearance } from './beast-traversal.js';

export function createRemotePlayers(scene,host,{now=()=>Date.now()}={}){
  const entries=new Map(),labels=document.createElement('div');labels.className='remote-player-labels';labels.setAttribute('aria-hidden','true');host.append(labels);
  let disposed=false,previous=null;
  const remove=entry=>{entry.removed=true;entry.version++;entry.outfit?.dispose();entry.vehicle?.dispose();entry.road?.dispose();entry.avatar?.dispose();entry.holder.removeFromParent();entry.label.remove();};
  const syncRoad=(entry,kind)=>{
    const selected=vehicleKind(kind);
    if(entry.road?.spec.kind===selected)return;
    entry.road?.dispose();entry.road=null;entry.roadDistance=0;
    if(selected){
      entry.road=createRoadVehicle(selected);
      const seat=VEHICLES[selected].passengerSeat;
      entry.road.object.position.set(-seat[0],0,-seat[2]);
      entry.holder.add(entry.road.object);
    }
  };
  const loadAppearance=(entry,player)=>{
    const appearance=permittedAppearance(player.id,player.appearance);
    if(entry.requestedAppearance!==appearance){
      entry.requestedAppearance=appearance;entry.failures=0;entry.retryAt=0;
      if(entry.pendingAppearance&&entry.pendingAppearance!==appearance){entry.pendingAppearance=null;entry.version++;}
    }
    if(entry.pendingAppearance===appearance||entry.loadedAppearance===appearance)return;
    if(now()<entry.retryAt)return;
    entry.pendingAppearance=appearance;const version=++entry.version;
    const rigProfile=sharedAppearance(appearance).rig??appearance;
    loadResidentAvatar(rigProfile==='jevica'?4:AVATAR_PROFILES.indexOf(rigProfile),'remote-'+player.id,rigProfile,{folk:false,appearanceId:appearance}).then(avatar=>{
      if(disposed||entry.removed||entry.version!==version){avatar.dispose();return;}
      const outfit=sharedAppearance(appearance).costume==='jevica'?createPlayerCostume(avatar,'jevica'):{update(){},dispose(){}};
      const vehicle=createFlightVehicle('jevica');
      entry.outfit?.dispose();entry.vehicle?.dispose();entry.avatar?.dispose();entry.holder.clear();
      entry.avatar=avatar;entry.outfit=outfit;entry.vehicle=vehicle;entry.holder.add(avatar.object,vehicle.object);
      if(entry.road)entry.holder.add(entry.road.object);
      entry.loadedAppearance=appearance;entry.pendingAppearance=null;entry.failures=0;entry.retryAt=0;
      entry.label.textContent=player.name;
    }).catch(()=>{if(entry.version===version){entry.pendingAppearance=null;entry.failures++;entry.retryAt=now()+Math.min(30000,1000*2**entry.failures);entry.label.textContent=player.name+' · avatar unavailable';}});
  };
  return {
    stats(){return [...entries].map(([id,entry])=>{
      const arm=entry.avatar?.rig?.model?.getObjectByName('upperarm_r'),rest=arm&&entry.avatar.rig.rest.get(arm);
      return {id,ready:Boolean(entry.avatar),appearance:entry.loadedAppearance,movement:entry.target.movement??'upright',gesture:entry.target.gesture??null,rightArmMotion:rest?arm.quaternion.angleTo(rest):0,beastMotion:entry.avatar?.beastMotion??0,vehicle:entry.road?.spec.kind??null,roadVisible:Boolean(entry.road?.object.visible),riderSeated:Boolean(entry.riderSeated),position:entry.holder.position.toArray()};
    });},
    sync(players,selfId){
      const peers=players.filter(player=>player.id!==selfId);
      for(const [id,entry]of entries)if(!peers.some(player=>player.id===id)){remove(entry);entries.delete(id);}
      for(const player of peers){
        let entry=entries.get(player.id);
        if(!entry){
          const holder=new THREE.Group(),label=document.createElement('span');label.className='remote-player-label';label.setAttribute('data-peer-id',player.id);label.textContent=player.name;labels.append(label);scene.add(holder);
          holder.position.set(player.position[0],player.position[2]+player.altitude,-player.position[1]);
          entry={holder,label,target:player,removed:false,distance:0,version:0,loadedAppearance:null,pendingAppearance:null,requestedAppearance:null,failures:0,retryAt:0};entries.set(player.id,entry);
        }
        entry.target=player;entry.label.textContent=player.name;syncRoad(entry,player.vehicle);loadAppearance(entry,player);
      }
    },
    update(now,camera){
      const delta=previous===null?0:Math.min(0.1,(now-previous)/1000);previous=now;
      for(const entry of entries.values()){
        const {holder,target,avatar,label}=entry;const next=new THREE.Vector3(target.position[0],target.position[2]+target.altitude,-target.position[1]);
        const before=holder.position.clone();if(holder.position.distanceTo(next)>8)holder.position.copy(next);else holder.position.lerp(next,1-Math.exp(-12*delta));
        const moved=holder.position.distanceTo(before);entry.distance+=moved;
        // Face the way they walk, as the local avatar does; a player standing
        // still keeps their last heading. Facing the camera yaw while moving
        // made remote players moonwalk.
        const dx=holder.position.x-before.x,dz=holder.position.z-before.z;
        if(entry.heading===undefined)entry.heading=target.yaw+Math.PI;
        if(target.vehicle)entry.heading=target.yaw;
        else if(Math.hypot(dx,dz)>0.004)entry.heading=Math.atan2(dx,dz);
        holder.rotation.y+=Math.atan2(Math.sin(entry.heading-holder.rotation.y),Math.cos(entry.heading-holder.rotation.y))*(1-Math.exp(-12*delta));
        holder.visible=holder.position.distanceTo(camera.position)<120;
        entry.riderSeated=false;
        if(avatar&&!holder.visible)avatar.suspend();
        if(avatar&&holder.visible){
          const beast=target.movement==='beast'?traversalForAppearance(target.appearance):null;
          const ride=entry.road?.spec;
          const speed=delta?Math.hypot(dx,dz)/delta:0;
          avatar.object.position.set(0,ride?ride.passengerSeat[1]-avatar.rig.hipHeight+.025:0,0);
          avatar.object.rotation.y=ride?-Math.PI/2:0;
          avatar.update(now,!ride&&target.altitude<=0.1?(target.gesture??'continue'):'continue',false,{speed:ride?0:Math.min(beast?.sprint??3.4,delta?moved/delta:0),flightSpeed:speed,distance:entry.distance,flying:!ride&&target.altitude>0.1,riding:Boolean(ride),ridingKind:ride?.kind,seatToFloor:ride?ride.passengerSeat[1]-ride.passengerFloor:undefined,vehicle:'jevica',beast:Boolean(beast)},()=>holder.position.y);
          entry.riderSeated=Boolean(ride);
          entry.outfit.update(!ride&&target.altitude>0.1);entry.vehicle.object.visible=!ride&&target.altitude>0.1;
          if(entry.road){
            entry.roadDistance+=Math.hypot(dx,dz);
            entry.road.wheels.forEach((wheel,i)=>{wheel.rotation.z=entry.roadDistance/ride.wheels[i][1];});
            entry.road.animate(now,Math.min(ride.maxSpeed,speed));
          }
        }
        const point=holder.position.clone().add(new THREE.Vector3(0,2.2,0)).project(camera);label.hidden=!holder.visible||point.z<-1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;
        if(!label.hidden)label.style.transform=`translate(${(point.x+1)*host.clientWidth/2}px,${(1-point.y)*host.clientHeight/2}px) translate(-50%,-100%)`;
      }
    },
    dispose(){disposed=true;for(const entry of entries.values())remove(entry);entries.clear();labels.remove();},
  };
}
