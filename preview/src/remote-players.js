import * as THREE from 'three';
import { AVATAR_PROFILES, loadResidentAvatar } from './avatars.js';
import { createPlayerCostume } from './player-costume.js';
import { createFlightVehicle } from './flight-vehicles.js';
import { DEFAULT_SHARED_APPEARANCE, sharedAppearance } from './shared-appearances.js';

export function createRemotePlayers(scene,host,{now=()=>Date.now()}={}){
  const entries=new Map(),labels=document.createElement('div');labels.className='remote-player-labels';labels.setAttribute('aria-hidden','true');host.append(labels);
  let disposed=false,previous=null;
  const remove=entry=>{entry.removed=true;entry.version++;entry.outfit?.dispose();entry.vehicle?.dispose();entry.avatar?.dispose();entry.holder.removeFromParent();entry.label.remove();};
  const loadAppearance=(entry,player)=>{
    const appearance=sharedAppearance(player.appearance)?.id??DEFAULT_SHARED_APPEARANCE;
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
      const outfit=appearance==='jevica'?createPlayerCostume(avatar,'jevica'):{update(){},dispose(){}};
      const vehicle=createFlightVehicle('jevica');
      entry.outfit?.dispose();entry.vehicle?.dispose();entry.avatar?.dispose();entry.holder.clear();
      entry.avatar=avatar;entry.outfit=outfit;entry.vehicle=vehicle;entry.holder.add(avatar.object,vehicle.object);
      entry.loadedAppearance=appearance;entry.pendingAppearance=null;entry.failures=0;entry.retryAt=0;
      entry.label.textContent=player.name;
    }).catch(()=>{if(entry.version===version){entry.pendingAppearance=null;entry.failures++;entry.retryAt=now()+Math.min(30000,1000*2**entry.failures);entry.label.textContent=player.name+' · avatar unavailable';}});
  };
  return {
    stats(){return [...entries].map(([id,entry])=>({id,ready:Boolean(entry.avatar),appearance:entry.loadedAppearance,position:entry.holder.position.toArray()}));},
    sync(players,selfId){
      const peers=players.filter(player=>player.id!==selfId);
      for(const [id,entry]of entries)if(!peers.some(player=>player.id===id)){remove(entry);entries.delete(id);}
      for(const player of peers){
        let entry=entries.get(player.id);
        if(!entry){
          const holder=new THREE.Group(),label=document.createElement('span');label.className='remote-player-label';label.textContent=player.name;labels.append(label);scene.add(holder);
          holder.position.set(player.position[0],player.position[2]+player.altitude,-player.position[1]);
          entry={holder,label,target:player,removed:false,distance:0,version:0,loadedAppearance:null,pendingAppearance:null,requestedAppearance:null,failures:0,retryAt:0};entries.set(player.id,entry);
        }
        entry.target=player;entry.label.textContent=player.name;loadAppearance(entry,player);
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
        if(Math.hypot(dx,dz)>0.004)entry.heading=Math.atan2(dx,dz);
        holder.rotation.y+=Math.atan2(Math.sin(entry.heading-holder.rotation.y),Math.cos(entry.heading-holder.rotation.y))*(1-Math.exp(-12*delta));
        holder.visible=holder.position.distanceTo(camera.position)<120;
        if(avatar&&holder.visible){avatar.update(now,'continue',false,{speed:delta?Math.min(3.4,moved/delta):0,flightSpeed:delta?Math.hypot(dx,dz)/delta:0,distance:entry.distance,flying:target.altitude>0.1,vehicle:'jevica'},()=>holder.position.y);entry.outfit.update(target.altitude>0.1);entry.vehicle.object.visible=target.altitude>0.1;}
        const point=holder.position.clone().add(new THREE.Vector3(0,2.2,0)).project(camera);label.hidden=!holder.visible||point.z<-1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;
        if(!label.hidden)label.style.transform=`translate(${(point.x+1)*host.clientWidth/2}px,${(1-point.y)*host.clientHeight/2}px) translate(-50%,-100%)`;
      }
    },
    dispose(){disposed=true;for(const entry of entries.values())remove(entry);entries.clear();labels.remove();},
  };
}
