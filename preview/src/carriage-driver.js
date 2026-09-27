import * as THREE from 'three';
import {loadResidentAvatar} from './avatars.js';
import {createPrinceCostume,loadPrinceSkinTexture} from './prince-costume.js';
import {companionSlot,createCompanionBody,createCompanionBrain,playerHeading,stepCompanion} from './prince-companion.js';
import {createCompanionNavigation,createCompanionRouteService,createCompanionRouteFollower} from './companion-navigation.js';

const SEAT=[-2.10,1.635,0];

// The dedicated Prince Jev hero and Jev stance policy share one encounter.
// Code owns every position, including stepping off and back onto the bench.
export function createCarriageDriver({scene,getLocals,getConversation=()=>null,brain=createCompanionBrain(),loadAvatar=loadResidentAvatar,loadSkinTexture=loadPrinceSkinTexture,createCostume=createPrinceCostume,createRouteService=createCompanionRouteService}) {
  const object=new THREE.Group();object.name='Prince Jev';object.userData.localId='carriage-driver';object.visible=false;scene.add(object);
  const up=new THREE.Vector3(0,1,0),seat=new THREE.Vector3(),orientation=new THREE.Quaternion(),turn=new THREE.Quaternion().setFromAxisAngle(up,-Math.PI/2);
  let avatar=null,costume=null,disposed=false,wanted=false,body=null,mode='seat',side=1,lastHeading=0,previous=null;
  let world=null,placement=null,navigation=null,service=null,follower=null,exit=null,transition=null,identity=null,lastPose=null,lastCoach=null;
  const listeners=new Set();
  const status={enabled:false,mode:'seat',stance:'seat',source:null,label:'Driving your carriage',reason:null,decisions:0,carrying:false};
  const publish=changes=>{
    if(Object.entries(changes).every(([key,value])=>status[key]===value))return;
    Object.assign(status,changes);listeners.forEach(listener=>listener({...status}));
  };
  const person=()=>getLocals()?.find(p=>p.id==='carriage-driver');
  const reset=()=>{
    wanted=false;mode='seat';body=null;exit=null;transition=null;previous=null;
    avatar?.suspend();
    brain.reset();follower?.reset();service?.dispose();service=null;follower=null;navigation=null;costume?.update({carrying:false});
    const local=person();if(local){local.indoor=false;delete local.storeId;}
    publish({enabled:false,mode,stance:'seat',source:null,label:'Driving your carriage',reason:null,carrying:false});
  };
  const ready=Promise.all([loadAvatar(1,'carriage-driver','prince-jev',{folk:false}),loadSkinTexture().catch(()=>null)]).then(([next,skinTexture])=>{
    if(disposed){next.dispose();return;}
    avatar=next;object.add(next.object);object.userData.avatar=next;costume=createCostume(next,{skinTexture});
    document.querySelector('#canvas-host').dataset.carriageDriverReady='true';
  }).catch(()=>{if(!disposed)document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));});
  const seatPose=coach=>{
    coach.updateWorldMatrix(true,false);coach.localToWorld(seat.set(...SEAT));coach.getWorldQuaternion(orientation).multiply(turn);
    return {position:seat.clone().addScaledVector(up.clone().applyQuaternion(orientation),-avatar.rig.hipHeight+.025),orientation};
  };
  const beginWalk=()=>{
    if(!world||!placement||!avatar||!object.visible||!lastCoach||!lastPose||lastPose.riding||lastPose.flying||lastPose.roomId||Math.hypot(lastPose.position[0]-object.position.x,lastPose.position[2]-object.position.z)>8)return false;
    const nav=createCompanionNavigation(world,{placement}),base=createCompanionNavigation(world);
    if(!nav||!base)return false;
    const seated=seatPose(lastCoach),start=[seated.position.x,-seated.position.z];
    for(const side of [1,-1]) {
      const point=lastCoach.localToWorld(new THREE.Vector3(SEAT[0],0,side*(1.36+.55/lastCoach.scale.x))),end=[point.x,-point.z];
      if(!nav.free(end)||!base.canTravel(start,end)||(getLocals()??[]).some(p=>p.id!=='carriage-driver'&&!p.abducted&&Math.hypot(p.position[0]-point.x,p.position[1]+point.z)<.7))continue;
      service?.dispose();navigation=nav;service=createRouteService(world,placement);follower=createCompanionRouteFollower(nav,service);
      exit=[point.x,nav.ground(end),point.z];body=createCompanionBody([point.x,point.z],object.rotation.y);
      transition={from:seated.position.toArray(),to:exit,progress:0};mode='stepping-down';return true;
    }
    return false;
  };
  return {
    object,ready,
    get avatar(){return avatar;},
    get canDrive(){return Boolean(avatar&&object.visible&&!person()?.abducted&&mode==='seat'&&!wanted);},
    get companion(){return {...status,mode,position:mode==='seat'?null:[object.position.x,object.position.z]};},
    onCompanion(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    configure(nextWorld,nextPlacement){reset();world=nextWorld;placement=nextPlacement;},
    reset,
    setCompanion(value){
      if(disposed)return false;
      brain.reset();follower?.reset();
      if(value) {
        if(mode!=='seat'||!beginWalk())return false;
        wanted=true;publish({enabled:true,mode,label:'Stepping down to walk with you',source:null,reason:null});
      } else {
        wanted=false;publish({enabled:false,label:mode==='seat'?'Driving your carriage':'Returning to the carriage',stance:mode==='seat'?'seat':'return',source:null,reason:null});
      }
      return true;
    },
    update(coach,now,visitor,{pose=null,environment=null}={}) {
      const local=person();if(identity!==local){reset();identity=local;}
      lastCoach=coach;lastPose=pose;
      object.visible=Boolean(avatar&&coach.visible&&local&&!local.abducted);
      const dt=previous===null?0:Math.min(.08,Math.max(0,(now-previous)/1000));previous=now;
      if(!object.visible){avatar?.suspend();if(!local||local.abducted)reset();return;}
      const speaking=getConversation()?.id===local.id,look=visitor&&speaking?[visitor[0],visitor[2],-visitor[1]]:null;
      const player=pose&&!pose.riding?[pose.position[0],pose.position[2]]:null;
      if(mode==='stepping-down'||mode==='stepping-up') {
        transition.progress=Math.min(1,transition.progress+dt/1.6);const t=transition.progress**2*(3-2*transition.progress);
        object.position.fromArray(transition.from.map((v,i)=>v+(transition.to[i]-v)*t));object.rotation.set(0,body.heading,0);
        if(transition.progress===1) {
          mode=mode==='stepping-up'?'seat':'walking';transition=null;
          if(mode==='seat'){body=null;service?.dispose();service=null;follower?.reset();publish({mode,stance:'seat',label:'Driving your carriage',source:null,reason:null});}
        }
      }
      if(mode==='walking'&&environment) {
        const gap=player?Math.hypot(player[0]-body.position[0],player[1]-body.position[1]):0;
        const context={player_speed:pose?.speed??0,gap_m:gap,conversing:speaking||Boolean(getConversation()),flying:Boolean(pose?.flying),riding:Boolean(pose?.riding),indoor:Boolean(pose?.roomId),
          crowded:(getLocals()??[]).filter(p=>p.id!==local.id&&player&&Math.hypot(p.position[0]-player[0],-p.position[1]-player[1])<2.4).length>=2,
          narrow:Boolean(player&&!environment?.isFree(player[0]+Math.cos(lastHeading)*1.1,player[1]-Math.sin(lastHeading)*1.1))};
        const returning=!wanted||context.riding,decision=returning?{stance:'return',source:null,reason:null,label:'Returning to the carriage'}:brain.update(context);
        lastHeading=playerHeading(pose,lastHeading);
        let target=null;
        if(!context.flying&&player&&environment) {
          if(returning)target=[exit[0],exit[2]];
          else {const slot=companionSlot(player,lastHeading,decision.stance,(x,z)=>environment.isFree(x,z)&&navigation.canTravel([player[0],-player[1]],[x,-z]),side);if(slot){target=slot.point;side=slot.side;}}
        }
        const waypoint=follower?.update(body.position,target,dt)??null;
        // No target means a deliberate hold or an unresolved route. Stop now;
        // inertia must not move him after flight, a bow or a manual decision.
        if(!waypoint)body.speed=0;
        stepCompanion(body,waypoint,environment,dt,{player,playerSpeed:pose?.speed??0,face:player?Math.atan2(player[0]-body.position[0],player[1]-body.position[1]):null});
        const ground=environment.groundAt(...body.position);object.position.set(body.position[0],ground,body.position[1]);object.rotation.set(0,body.heading,0);
        if(returning&&!context.flying&&Math.hypot(body.position[0]-exit[0],body.position[1]-exit[2])<.18) {
          transition={from:object.position.toArray(),to:seatPose(coach).position.toArray(),progress:0};mode='stepping-up';
        }
        publish({mode,stance:decision.stance,source:decision.source,reason:decision.reason??null,decisions:decision.decisions??status.decisions,label:context.flying?'Waiting safely on the ground':follower?.waiting?'Waiting for a clear path':decision.label});
      }
      if(mode==='seat') {
        const seated=seatPose(coach);object.position.copy(seated.position);object.quaternion.copy(seated.orientation);
      }
      local.position=[object.position.x,-object.position.z,object.position.y];
      const room=mode==='seat'?null:environment?.roomAt(object.position.x,object.position.z);local.indoor=Boolean(room);if(room)local.storeId=room.storeId;else delete local.storeId;
      if(local.life)Object.assign(local.life,{heading:object.rotation.y,speed:body?.speed??0,distance:body?.distance??0});
      const riding=mode==='seat',action=status.stance==='greet'?'bow':'continue';
      avatar.update(now,action,false,{speed:mode==='walking'?body.speed:0,distance:body?.distance??0,heading:body?.heading,riding,carrying:!riding,seatToFloor:(1.635-1.1275)*coach.scale.x},environment?.groundAt??(()=>0),look??(player&&body?.speed<.2?pose.position:null),{conversing:speaking});
      object.updateWorldMatrix(true,true);costume?.update({carrying:!riding});publish({mode,carrying:!riding});
    },
    dispose(){reset();disposed=true;brain.dispose?.();costume?.dispose();avatar?.dispose();object.removeFromParent();listeners.clear();},
  };
}
