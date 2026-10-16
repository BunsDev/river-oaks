import { createAvatarPlaceholder } from './avatar-placeholder.js';
import { selectedCharacterFor } from './character-selection-view.js';
import { createCharacterMaterials } from './character-studio-materials.js';
import * as THREE from 'three';
import { AVATAR_PROFILES, loadResidentAvatar } from './avatars.js';
import { createPlayerCostume } from './player-costume.js';
import { createFlightVehicle } from './flight-vehicles.js';
import { createRoadVehicle } from './road-vehicles.js';
import { VEHICLES, vehicleKind } from './vehicle-config.js';
import { permittedAppearance, sharedAppearance } from './shared-appearances.js';
import { traversalForAppearance } from './beast-traversal.js';

export function createRemotePlayers(scene,host,{now=()=>Date.now(),isVisible=()=>true,snapInitialHeading=false}={}){
  const entries=new Map(),labels=document.createElement('div');labels.className='remote-player-labels';labels.setAttribute('aria-hidden','true');host.append(labels);
  // Who is talking on shared voice right now: a ring on the nameplate and the
  // speaker cadence in conversation-motion. Set at event time, read per frame.
  const speaking=new Set();
  let disposed=false,previous=null;
  const next=new THREE.Vector3(),before=new THREE.Vector3(),point=new THREE.Vector3();
  const remove=entry=>{entry.removed=true;entry.version++;entry.placeholder?.dispose();entry.colors?.dispose();entry.outfit?.dispose();entry.vehicle?.dispose();entry.road?.dispose();entry.avatar?.dispose();entry.holder.removeFromParent();entry.label.remove();};
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
    if(entry.loadedAppearance===appearance){
      const definition=selectedCharacterFor(player);const key=JSON.stringify(definition);
      if(key!==entry.definitionKey){entry.colors?.apply(definition);entry.definitionKey=key;entry.definition=definition;}
    }
    if(entry.pendingAppearance===appearance||entry.loadedAppearance===appearance)return;
    if(now()<entry.retryAt)return;
    entry.pendingAppearance=appearance;const version=++entry.version;
    const rigProfile=sharedAppearance(appearance).rig??appearance;
    loadResidentAvatar(rigProfile==='jevica'?4:AVATAR_PROFILES.indexOf(rigProfile),'remote-'+player.id,rigProfile,{folk:false,appearanceId:appearance}).then(avatar=>{
      if(disposed||entry.removed||entry.version!==version){avatar.dispose();return;}
      const outfit=sharedAppearance(appearance).costume==='jevica'?createPlayerCostume(avatar,'jevica'):{update(){},dispose(){}};
      const vehicle=createFlightVehicle('jevica');
      entry.placeholder?.dispose();entry.placeholder=null;entry.colors?.dispose();entry.outfit?.dispose();entry.vehicle?.dispose();entry.avatar?.dispose();entry.holder.clear();
      entry.avatar=avatar;entry.outfit=outfit;entry.vehicle=vehicle;entry.holder.add(avatar.object,vehicle.object);
      if(entry.road)entry.holder.add(entry.road.object);
      entry.colors=createCharacterMaterials(avatar.object);entry.definition=selectedCharacterFor(entry.target);entry.definitionKey=JSON.stringify(entry.definition);entry.colors.apply(entry.definition);
      entry.loadedAppearance=appearance;entry.pendingAppearance=null;entry.failures=0;entry.retryAt=0;
      entry.label.textContent=entry.target.name;
    }).catch(()=>{if(entry.version===version){entry.pendingAppearance=null;entry.failures++;entry.retryAt=now()+Math.min(30000,1000*2**entry.failures);entry.label.textContent=player.name+' · avatar unavailable';}});
  };
  return {
    // Explicit inspection only: skinning every vertex is too expensive for the
    // normal render loop. Hidden source bodies and flight rigs are excluded.
    bounds(){return [...entries].filter(([,entry])=>entry.avatar&&entry.holder.visible).map(([id,entry])=>{
      entry.holder.updateWorldMatrix(true,true);const bounds=new THREE.Box3();
      entry.holder.traverseVisible(mesh=>{
        if(!mesh.isMesh)return;
        if(mesh.isSkinnedMesh){mesh.skeleton.update();mesh.computeBoundingBox();}else if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
        const box=mesh.isSkinnedMesh?mesh.boundingBox:mesh.geometry.boundingBox;
        if(box)bounds.union(box.clone().applyMatrix4(mesh.matrixWorld));
      });
      return {id,min:bounds.min.toArray(),max:bounds.max.toArray()};
    });},
    stats(){return [...entries].map(([id,entry])=>{
      const arm=entry.avatar?.rig?.model?.getObjectByName('upperarm_r'),rest=arm&&entry.avatar.rig.rest.get(arm);
      return {id,ready:Boolean(entry.avatar),fallback:Boolean(entry.placeholder),appearance:entry.loadedAppearance,character:entry.definition?structuredClone(entry.definition):null,materials:entry.colors?.inspect()??[],movement:entry.target.movement??'upright',gesture:entry.target.gesture??null,rightArmMotion:rest?arm.quaternion.angleTo(rest):0,beastMotion:entry.avatar?.beastMotion??0,vehicle:entry.road?.spec.kind??null,roadVisible:Boolean(entry.road?.object.visible),riderSeated:Boolean(entry.riderSeated),sitting:entry.target.sitting??null,watering:Boolean(entry.avatar?.object.getObjectByName('Watering can')?.visible),heading:entry.holder.rotation.y,position:entry.holder.position.toArray()};
    });},
    sync(players,selfId){
      if(disposed)return;
      const peers=players.filter(player=>player.id!==selfId),ids=new Set(peers.map(player=>player.id));
      for(const [id,entry]of entries)if(!ids.has(id)){remove(entry);entries.delete(id);}
      for(const player of peers){
        let entry=entries.get(player.id);
        if(!entry){
          const holder=new THREE.Group(),label=document.createElement('span');label.className='remote-player-label';label.setAttribute('data-peer-id',player.id);label.textContent=player.name;labels.append(label);scene.add(holder);
          holder.position.set(player.position[0],player.position[2]+player.altitude,-player.position[1]);
          if(snapInitialHeading)holder.rotation.y=player.yaw+Math.PI;
          const placeholder=createAvatarPlaceholder();holder.add(placeholder.object);
          entry={holder,label,placeholder,target:player,removed:false,distance:0,version:0,loadedAppearance:null,pendingAppearance:null,requestedAppearance:null,failures:0,retryAt:0};entries.set(player.id,entry);
          if(speaking.has(player.id))label.dataset.speaking='true';
        }
        entry.target=player;entry.syncedAt=performance.now();entry.label.textContent=player.name+(entry.failures?' · avatar unavailable':entry.avatar?'':' · loading avatar');syncRoad(entry,player.vehicle);loadAppearance(entry,player);
      }
    },
    update(now,camera){
      if(disposed)return;
      const width=host.clientWidth,height=host.clientHeight;
      const delta=previous===null?0:Math.min(0.1,(now-previous)/1000);previous=now;
      for(const entry of entries.values()){
        const {holder,target,avatar,label}=entry;next.set(target.position[0],target.position[2]+target.altitude,-target.position[1]);
        before.copy(holder.position);if(target.sitting || entry.wasSitting || holder.position.distanceTo(next)>8)holder.position.copy(next);else holder.position.lerp(next,1-Math.exp(-12*delta));
        const moved=holder.position.distanceTo(before);entry.distance+=moved;
        // Face the way they walk, as the local avatar does; a player standing
        // still keeps their last heading. Facing the camera yaw while moving
        // made remote players moonwalk.
        const dx=holder.position.x-before.x,dz=holder.position.z-before.z;
        if(entry.heading===undefined)entry.heading=target.yaw+Math.PI;
        if(target.sitting)entry.heading=target.sitting.yaw;
        else if(target.vehicle)entry.heading=target.yaw;
        // Watering: face the planter, which the server turned them toward
        // (a player's yaw is the camera's, behind them).
        else if(target.interaction)entry.heading=target.interaction.heading;
        else if(target.gesture==='water')entry.heading=target.yaw+Math.PI;
        else if(Math.hypot(dx,dz)>0.004)entry.heading=Math.atan2(dx,dz);
        if(target.sitting)holder.rotation.y=entry.heading;
        else holder.rotation.y+=Math.atan2(Math.sin(entry.heading-holder.rotation.y),Math.cos(entry.heading-holder.rotation.y))*(1-Math.exp(-12*delta));
        holder.visible=isVisible(target)&&holder.position.distanceTo(camera.position)<120;
        entry.riderSeated=false;
        if(avatar&&!holder.visible)avatar.suspend();
        if(avatar&&holder.visible){
          const beast=target.movement==='beast'?traversalForAppearance(target.appearance):null;
          const ride=entry.road?.spec,seat=target.sitting,seated=Boolean(ride||seat);
          const speed=delta?Math.hypot(dx,dz)/delta:0;
          avatar.object.position.set(0,seat?seat.height-avatar.rig.hipHeight+.025:ride?ride.passengerSeat[1]-avatar.rig.hipHeight+.025:0,0);
          avatar.object.rotation.y=ride?-Math.PI/2:0;
          avatar.update(now,!ride&&target.altitude<=0.1?(target.gesture??'continue'):'continue',speaking.has(target.id),{speed:seated?0:Math.min(beast?.sprint??3.4,delta?moved/delta:0),flightSpeed:speed,distance:entry.distance,flying:!seated&&target.altitude>0.1,riding:seated,ridingKind:seat?'seat':ride?.kind,seatToFloor:seat?seat.height:ride?ride.passengerSeat[1]-ride.passengerFloor:undefined,vehicle:'jevica',beast:Boolean(beast),handshakeTarget:target.interaction?.kind==='handshake'?target.interaction.target:undefined,gestureTime:target.interaction?target.interaction.elapsed+Math.max(0,now-entry.syncedAt)/1000:undefined},()=>holder.position.y);
          entry.riderSeated=seated;
          entry.outfit.update(!seated&&target.altitude>0.1,now,seated);entry.vehicle.object.visible=!seated&&target.altitude>0.1;
          if(entry.road){
            entry.roadDistance+=Math.hypot(dx,dz);
            entry.road.wheels.forEach((wheel,i)=>{wheel.rotation.z=entry.roadDistance/ride.wheels[i][1];});
            entry.road.animate(now,Math.min(ride.maxSpeed,speed));
          }
        }
        entry.wasSitting=Boolean(target.sitting);
        point.copy(holder.position);point.y+=target.sitting?1.75:2.2;point.project(camera);label.hidden=!holder.visible||point.z<-1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;
        if(!label.hidden)label.style.transform=`translate(${(point.x+1)*width/2}px,${(1-point.y)*height/2}px) translate(-50%,-100%)`;
      }
    },
    setSpeaking(ids){
      if(disposed)return;
      speaking.clear();for(const id of ids??[])speaking.add(id);
      for(const [id,entry] of entries){const on=String(speaking.has(id));if(entry.label.dataset.speaking!==on)entry.label.dataset.speaking=on;}
    },
    dispose(){disposed=true;for(const entry of entries.values())remove(entry);entries.clear();labels.remove();},
  };
}
