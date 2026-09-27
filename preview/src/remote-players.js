import * as THREE from 'three';
import { loadResidentAvatar } from './avatars.js';
import { createPlayerCostume } from './player-costume.js';
import { createFlightVehicle } from './flight-vehicles.js';

export function createRemotePlayers(scene,host){
  const entries=new Map(),labels=document.createElement('div');labels.className='remote-player-labels';labels.setAttribute('aria-hidden','true');host.append(labels);
  let disposed=false,previous=null;
  const remove=entry=>{entry.removed=true;entry.outfit?.dispose();entry.vehicle?.dispose();entry.avatar?.dispose();entry.holder.removeFromParent();entry.label.remove();};
  return {
    stats(){return [...entries].map(([id,entry])=>({id,ready:Boolean(entry.avatar),position:entry.holder.position.toArray()}));},
    sync(players,selfId){
      const peers=players.filter(player=>player.id!==selfId);
      for(const [id,entry]of entries)if(!peers.some(player=>player.id===id)){remove(entry);entries.delete(id);}
      for(const player of peers){
        let entry=entries.get(player.id);
        if(!entry){
          const holder=new THREE.Group(),label=document.createElement('span');label.className='remote-player-label';label.textContent=player.name;labels.append(label);scene.add(holder);
          holder.position.set(player.position[0],player.position[2]+player.altitude,-player.position[1]);
          entry={holder,label,target:player,removed:false,distance:0};entries.set(player.id,entry);
          loadResidentAvatar(4,'remote-'+player.id,'jevica').then(avatar=>{
            if(disposed||entry.removed){avatar.dispose();return;}
            entry.avatar=avatar;entry.outfit=createPlayerCostume(avatar,'jevica');entry.vehicle=createFlightVehicle('jevica');holder.add(avatar.object,entry.vehicle.object);
          }).catch(()=>{label.textContent=player.name+' · avatar unavailable';});
        }
        entry.target=player;
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
        // made every remote Jevica moonwalk.
        const dx=holder.position.x-before.x,dz=holder.position.z-before.z;
        if(entry.heading===undefined)entry.heading=target.yaw+Math.PI;
        if(Math.hypot(dx,dz)>0.004)entry.heading=Math.atan2(dx,dz);
        holder.rotation.y+=Math.atan2(Math.sin(entry.heading-holder.rotation.y),Math.cos(entry.heading-holder.rotation.y))*(1-Math.exp(-12*delta));
        holder.visible=holder.position.distanceTo(camera.position)<120;
        if(avatar&&holder.visible){avatar.update(now,'continue',false,{speed:delta?Math.min(3.4,moved/delta):0,distance:entry.distance,flying:target.altitude>0.1,vehicle:'jevica'},()=>holder.position.y);entry.outfit.update(target.altitude>0.1);entry.vehicle.object.visible=target.altitude>0.1;}
        const point=holder.position.clone().add(new THREE.Vector3(0,2.2,0)).project(camera);label.hidden=!holder.visible||point.z<-1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;
        if(!label.hidden)label.style.transform=`translate(${(point.x+1)*host.clientWidth/2}px,${(1-point.y)*host.clientHeight/2}px) translate(-50%,-100%)`;
      }
    },
    dispose(){disposed=true;for(const entry of entries.values())remove(entry);entries.clear();labels.remove();},
  };
}
