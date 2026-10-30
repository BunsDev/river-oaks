import { poseFor } from './crime-poses.js';
import { layoutPeerLabels } from './peer-label-layout.js';
import { createAvatarPlaceholder } from './avatar-placeholder.js';
import { cullAvatarMeshes, figureHeight, figureInView, FIGURE_SPHERE } from './avatar-culling.js';
import { assignShadowDepth, setShadowDepth } from './shadow-depth.js';
import { selectedCharacterFor } from './character-selection-view.js';
import { createCharacterMaterials } from './character-studio-materials.js';
import * as THREE from 'three';
import { AVATAR_PROFILES, loadResidentAvatar } from './avatars.js';
import { createPlayerCostume } from './player-costume.js';
import { createFlightVehicle } from './flight-vehicles.js';
import { createRoadVehicle } from './road-vehicles.js';
import { bicycleCrankAngle } from './bicycle-crank.js';
import { VEHICLES, vehicleKind, riderSeat, vehicleChauffeured } from './vehicle-config.js';
import { permittedAppearance, sharedAppearance } from './shared-appearances.js';
import { createPeerMotion } from './locomotion-handoff.js';

// shadowDirection, when given, returns the shadow-casting light's direction (or
// null without sun shadows) and lets a peer whose figure and shadow are both out
// of view skip its update and every pass, like a peer beyond the distance gate.
export function createRemotePlayers(scene,host,{now=()=>Date.now(),isVisible=()=>true,snapInitialHeading=false,shadowDirection=null}={}){
  const entries=new Map(),labels=document.createElement('div');labels.className='remote-player-labels';labels.setAttribute('aria-hidden','true');host.append(labels);
  // Who is talking on shared voice right now: a ring on the nameplate and the
  // speaker cadence in conversation-motion. Set at event time, read per frame.
  const speaking=new Set();
  let disposed=false,previous=null,labelWidth=0,labelHeight=0,culling=true,figureCulling=true,shadowDepth=true;
  const frustum=new THREE.Frustum(),viewProjection=new THREE.Matrix4(),figureCenter=new THREE.Vector3();
  const fonts=document.fonts;
  const invalidateLabelSizes=()=>{for(const entry of entries.values())entry.labelSize=null;};
  fonts?.addEventListener('loadingdone',invalidateLabelSizes);
  const setLabelText=(entry,text)=>{if(entry.label.textContent!==text){entry.label.textContent=text;entry.labelSize=null;}};
  const next=new THREE.Vector3(),point=new THREE.Vector3();
  const remove=entry=>{entry.removed=true;entry.version++;entry.placeholder?.dispose();entry.colors?.dispose();entry.outfit?.dispose();entry.vehicle?.dispose();entry.road?.dispose();entry.avatar?.dispose();entry.holder.removeFromParent();entry.label.remove();};
  const syncRoad=(entry,kind)=>{
    const selected=vehicleKind(kind);
    if(entry.road?.spec.kind===selected)return;
    entry.road?.dispose();entry.road=null;entry.roadDistance=0;
    if(selected){
      entry.road=createRoadVehicle(selected,{pedalling:true});
      const seat=riderSeat(VEHICLES[selected]);
      entry.road.object.position.set(-seat[0],0,-seat[2]);
      entry.holder.add(entry.road.object);
    }
  };
  const loadAppearance=(entry,player)=>{
    const appearance=permittedAppearance(player.id,player.appearance);
    // A player-made look is its recipe on its own body: a new recipe is a new load.
    const selected=selectedCharacterFor(player),recipe=selected.schemaVersion===3?selected.parameters:null;
    const look=recipe?`${appearance}:${JSON.stringify(recipe)}`:appearance;
    if(entry.requestedLook!==look){
      entry.requestedLook=look;entry.failures=0;entry.retryAt=0;
      if(entry.pendingLook&&entry.pendingLook!==look){entry.pendingLook=null;entry.version++;}
    }
    if(entry.loadedLook===look){
      const key=JSON.stringify(selected);
      if(key!==entry.definitionKey){entry.colors?.apply(selected);entry.definitionKey=key;entry.definition=selected;}
    }
    if(entry.pendingLook===look||entry.loadedLook===look)return;
    if(now()<entry.retryAt)return;
    entry.pendingLook=look;const version=++entry.version;
    const rigProfile=recipe?.body??sharedAppearance(appearance).rig??appearance;
    loadResidentAvatar(rigProfile==='jevica'?4:AVATAR_PROFILES.indexOf(rigProfile),'remote-'+player.id,rigProfile,{folk:false,appearanceId:appearance,...(recipe?{recipe}:{})}).then(avatar=>{
      if(disposed||entry.removed||entry.version!==version){avatar.dispose();return;}
      const outfit=sharedAppearance(appearance).costume==='jevica'?createPlayerCostume(avatar,'jevica'):{update(){},dispose(){}};
      const vehicle=createFlightVehicle('jevica'),height=figureHeight(avatar),culled=cullAvatarMeshes(avatar.object,height);
      for(const mesh of culled)mesh.frustumCulled=culling;
      const depth=assignShadowDepth(avatar.object);if(!shadowDepth)setShadowDepth(depth,false);
      entry.placeholder?.dispose();entry.placeholder=null;entry.colors?.dispose();entry.outfit?.dispose();entry.vehicle?.dispose();entry.avatar?.dispose();entry.holder.clear();
      entry.avatar=avatar;entry.outfit=outfit;entry.vehicle=vehicle;entry.culled=culled;entry.depth=depth;entry.height=height;entry.holder.add(avatar.object,vehicle.object);
      if(entry.road)entry.holder.add(entry.road.object);
      entry.colors=createCharacterMaterials(avatar.object);entry.definition=selectedCharacterFor(entry.target);entry.definitionKey=JSON.stringify(entry.definition);entry.colors.apply(entry.definition);
      entry.loadedAppearance=appearance;entry.loadedLook=look;entry.pendingLook=null;entry.failures=0;entry.retryAt=0;
      setLabelText(entry,entry.target.name);
    }).catch(()=>{if(entry.version===version){entry.pendingLook=null;entry.failures++;entry.retryAt=now()+Math.min(30000,1000*2**entry.failures);setLabelText(entry,entry.target.name+' · avatar unavailable');}});
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
      return {id,onScreen:Boolean(entry.onScreen),labelVisible:Boolean(entry.labelVisible),ready:Boolean(entry.avatar),fallback:Boolean(entry.placeholder),appearance:entry.loadedAppearance,look:entry.loadedLook,character:entry.definition?structuredClone(entry.definition):null,materials:entry.colors?.inspect()??[],realism:entry.avatar?.realismReport??null,movement:entry.target.movement??'upright',gesture:entry.target.gesture??null,rightArmMotion:rest?arm.quaternion.angleTo(rest):0,vehicle:entry.road?.spec.kind??null,roadVisible:Boolean(entry.road?.object.visible),riderSeated:Boolean(entry.riderSeated),sitting:entry.target.sitting??null,watering:Boolean(entry.avatar?.object.getObjectByName('Watering can')?.visible),heading:entry.holder.rotation.y,position:entry.holder.position.toArray(),locomotion:{speed:entry.motion.state.speed,heading:entry.motion.state.heading??null,distance:entry.motion.state.distance},feet:(entry.avatar?.feet??[]).map(leg=>({side:leg.side,contact:leg.contact,error:leg.error,target:leg.target?.toArray()??null,actual:leg.foot.getWorldPosition(new THREE.Vector3()).toArray()}))};
    });},
    sync(players,selfId){
      if(disposed)return;
      const peers=players.filter(player=>player.id!==selfId),ids=new Set(peers.map(player=>player.id));
      for(const [id,entry]of entries)if(!ids.has(id)){remove(entry);entries.delete(id);}
      for(const player of peers){
        let entry=entries.get(player.id);
        if(!entry){
          const holder=new THREE.Group(),label=document.createElement('span');holder.userData.renderAuditOwner='remote-player';label.className='remote-player-label';label.setAttribute('data-peer-id',player.id);label.textContent=player.name;labels.append(label);scene.add(holder);
          holder.position.set(player.position[0],player.position[2]+player.altitude,-player.position[1]);
          if(snapInitialHeading)holder.rotation.y=player.yaw+Math.PI;
          const placeholder=createAvatarPlaceholder();holder.add(placeholder.object);
          entry={holder,label,placeholder,target:player,removed:false,motion:createPeerMotion(player.id),version:0,loadedAppearance:null,loadedLook:null,pendingLook:null,requestedLook:null,failures:0,retryAt:0};entries.set(player.id,entry);
          if(speaking.has(player.id))label.dataset.speaking='true';
        }
        entry.target=player;entry.posed=true;entry.syncedAt=performance.now();setLabelText(entry,player.name+(entry.failures?' · avatar unavailable':entry.avatar?'':' · loading avatar'));syncRoad(entry,player.vehicle);loadAppearance(entry,player);
      }
    },
    update(now,camera){
      if(disposed)return;
      const width=host.clientWidth,height=host.clientHeight;
      if(width!==labelWidth||height!==labelHeight){invalidateLabelSizes();labelWidth=width;labelHeight=height;}
      const candidates=[],dirty=[];
      const delta=previous===null?0:Math.min(0.1,(now-previous)/1000);previous=now;
      const light=shadowDirection&&figureCulling?shadowDirection():undefined;
      if(light!==undefined){camera.updateMatrixWorld();frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));}
      for(const entry of entries.values()){
        const {holder,target,avatar}=entry;next.set(target.position[0],target.position[2]+target.altitude,-target.position[1]);
        // Horizontal stride, travel heading and lift carry (locomotion-handoff.js).
        const motion=entry.motion.step(holder.position,next,delta,now,{posed:entry.posed,snap:Boolean(target.sitting||entry.wasSitting),walking:!target.vehicle&&target.altitude<=0.1,levelId:target.levelId??null}),[dx,dz]=motion.moved;entry.posed=false;
        // Face the way they walk, as the local avatar does; a player standing
        // still keeps their last heading. Facing the camera yaw while moving
        // made remote players moonwalk.
        if(entry.heading===undefined)entry.heading=target.yaw+Math.PI;
        if(target.sitting)entry.heading=target.sitting.yaw;
        else if(target.vehicle)entry.heading=target.yaw;
        // Watering: face the planter, which the server turned them toward
        // (a player's yaw is the camera's, behind them).
        else if(target.interaction)entry.heading=target.interaction.heading;
        else if(target.gesture==='water')entry.heading=target.yaw+Math.PI;
        else if(motion.heading!==undefined)entry.heading=motion.heading;
        if(target.sitting)holder.rotation.y=entry.heading;
        else holder.rotation.y+=Math.atan2(Math.sin(entry.heading-holder.rotation.y),Math.cos(entry.heading-holder.rotation.y))*(1-Math.exp(-12*delta));
        const gated=!(isVisible(target)&&holder.position.distanceTo(camera.position)<120);
        // Out of view with its shadow: skip every pass, but keep animating at a
        // quarter rate so the figure is current when it turns back into view. A
        // car or flight vehicle extends past the figure sphere, so its rider stays.
        let figureHidden=false;
        if(!gated&&avatar&&light!==undefined&&!entry.road&&target.altitude<=0.1){
          figureCenter.set(holder.position.x,holder.position.y+avatar.object.position.y+FIGURE_SPHERE.center*entry.height,holder.position.z);
          figureHidden=!figureInView(frustum,figureCenter,FIGURE_SPHERE.radius*entry.height,holder.position.y,light);
        }
        holder.visible=!gated&&!figureHidden;
        entry.hiddenFrames=figureHidden?(entry.hiddenFrames??0)+1:0;
        entry.riderSeated=false;
        if(avatar&&gated)avatar.suspend();
        if(avatar&&!gated&&entry.hiddenFrames%4===0){
          const ride=entry.road?.spec,seat=target.sitting,seated=Boolean(ride||seat);
          const speed=delta?Math.hypot(dx,dz)/delta:0;
          avatar.object.position.set(0,seat?seat.height-avatar.rig.hipHeight+.025:ride?riderSeat(ride)[1]-avatar.rig.hipHeight+.025:0,0);
          avatar.object.rotation.y=ride?-Math.PI/2:0;
          // The crank and the rider's feet turn from the same distance this frame.
          if(entry.road)entry.roadDistance+=Math.hypot(dx,dz);
          avatar.update(now,!ride&&target.altitude<=0.1?(poseFor(target.gesture)??'continue'):'continue',speaking.has(target.id),{speed:seated?0:motion.speed,flightSpeed:speed,distance:motion.distance,heading:seated?undefined:motion.heading,platform:motion.platform,flying:!seated&&target.altitude>0.1,riding:seated,ridingKind:seat?'seat':ride?.kind,ridingDistance:entry.roadDistance,ridingSpeed:ride?speed:0,seatToFloor:seat?seat.height:ride?riderSeat(ride)[1]-(vehicleChauffeured(ride.kind)?ride.passengerFloor:ride.driverFloor):undefined,vehicle:'jevica',handshakeTarget:target.interaction?.kind==='handshake'?target.interaction.target:undefined,gestureTime:target.interaction?target.interaction.elapsed+Math.max(0,now-entry.syncedAt)/1000:undefined},()=>holder.position.y);
          entry.riderSeated=seated;
          entry.outfit.update(!seated&&target.altitude>0.1,now,seated);entry.vehicle.object.visible=!seated&&target.altitude>0.1;
          if(entry.road){
            entry.road.wheels.forEach((wheel,i)=>{wheel.rotation.z=entry.roadDistance/ride.wheels[i][1];});
            entry.road.setCrank(bicycleCrankAngle(entry.roadDistance));entry.road.setSaddle(avatar.bicycleSaddle);
            // A remote Ribbonwing's mechanisms follow the snapshot's altitude and speed.
            entry.road.setFlightState?.({phase:target.altitude>.1?(speed>1?'cruise':'hover'):'ready',altitude:target.altitude,maxSpeed:ride.maxSpeed,occupied:true});
            entry.road.animate(now,Math.min(ride.maxSpeed,speed));
          }
        }
        entry.wasSitting=Boolean(target.sitting);
        point.copy(holder.position);point.y+=target.sitting?1.75:2.2;point.project(camera);
        entry.onScreen=holder.visible&&point.z>=-1&&point.z<=1&&Math.abs(point.x)<=1&&Math.abs(point.y)<=1;
        if(entry.onScreen){
          candidates.push({id:target.id,x:(point.x+1)*width/2,y:(1-point.y)*height/2,distance:holder.position.distanceTo(camera.position),speaking:speaking.has(target.id),wasVisible:entry.labelVisible});
          if(!entry.labelSize)dirty.push(entry);
        }
      }
      // Batch layout writes before reads. Stable names need no DOM measurement in
      // subsequent frames; font completion, viewport changes and new text invalidate.
      for(const entry of dirty)entry.label.hidden=false;
      for(const entry of dirty){const box=entry.label.getBoundingClientRect();if(box.width>0&&box.height>0)entry.labelSize={width:Math.ceil(box.width),height:Math.ceil(box.height)};}
      const placements=layoutPeerLabels(candidates.map(candidate=>({...candidate,...entries.get(candidate.id).labelSize})),{width,height});
      const placed=new Map(placements.map(box=>[box.id,box]));
      for(const [id,entry] of entries){
        const box=placed.get(id);entry.labelVisible=Boolean(box);entry.label.hidden=!box;
        if(box)entry.label.style.transform=`translate(${box.x}px,${box.y}px) translate(-50%,-100%)`;
      }
    },
    // Development audit only: compare frames with each of these off.
    setCulling(enabled){culling=Boolean(enabled);for(const entry of entries.values())for(const mesh of entry.culled??[])mesh.frustumCulled=culling;},
    setFigureCulling(enabled){figureCulling=Boolean(enabled);},
    setShadowDepth(enabled){shadowDepth=Boolean(enabled);for(const entry of entries.values())setShadowDepth(entry.depth??[],shadowDepth);},
    setSpeaking(ids){
      if(disposed)return;
      speaking.clear();for(const id of ids??[])speaking.add(id);
      for(const [id,entry] of entries){const on=String(speaking.has(id));if(entry.label.dataset.speaking!==on)entry.label.dataset.speaking=on;}
    },
    dispose(){if(disposed)return;disposed=true;fonts?.removeEventListener('loadingdone',invalidateLabelSizes);for(const entry of entries.values())remove(entry);entries.clear();labels.remove();},
  };
}
