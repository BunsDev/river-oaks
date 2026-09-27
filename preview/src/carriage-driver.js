import * as THREE from 'three';
import {loadResidentAvatar} from './avatars.js';
import {createPrinceCostume} from './prince-costume.js';
import {companionRejoinDistance,companionSlot,createCompanionBody,createCompanionBrain,freeSpotNear,playerHeading,stepCompanion} from './prince-companion.js';

const SEAT=[-2.10,1.635,0];

// Prince Jev drives Jevica's carriage and, in companion mode, steps down to
// walk with her. Jev (the decision bridge) chooses how he accompanies her;
// this controller owns placement, clearance and animation.
export function createCarriageDriver({scene,getLocals,getConversation=()=>null,brain=createCompanionBrain()}) {
  const object=new THREE.Group();object.name='Prince Jev';object.userData.localId='carriage-driver';object.visible=false;scene.add(object);
  const up=new THREE.Vector3(0,1,0),seat=new THREE.Vector3(),orientation=new THREE.Quaternion(),turn=new THREE.Quaternion().setFromAxisAngle(up,-Math.PI/2);
  let avatar=null,costume=null,disposed=false,wanted=false,body=null,mode='seat',side=1,lastHeading=0,previous=null;
  const listeners=new Set();
  const status={enabled:false,mode:'seat',stance:'seat',source:null,label:'Driving your carriage',reason:null,decisions:0};
  const publish=changes=>{
    // Called every frame while walking; only real changes reach the panel.
    if(Object.entries(changes).every(([key,value])=>status[key]===value))return;
    Object.assign(status,changes);listeners.forEach(listener=>listener({...status}));
  };
  const ready=loadResidentAvatar(1,'carriage-driver','prince-jev',{folk:false}).then(next=>{
    if(disposed){next.dispose();return;}
    avatar=next;object.add(next.object);object.userData.avatar=next;
    costume=createPrinceCostume(next);
    document.querySelector('#canvas-host').dataset.carriageDriverReady='true';
  }).catch(()=>{if(!disposed)document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));});
  const seatPose=coach=>{
    coach.updateWorldMatrix(true,false);coach.localToWorld(seat.set(...SEAT));coach.getWorldQuaternion(orientation).multiply(turn);
    return {seat,orientation};
  };
  const bench=(coach,environment)=>{
    // Step down on either side of the driver's bench, onto the street.
    for(const offset of [1.7,-1.7,2.3,-2.3]) {
      const p=coach.localToWorld(new THREE.Vector3(SEAT[0],0,offset));
      if(environment.isFree(p.x,p.z))return [p.x,p.z];
    }
    const p=coach.localToWorld(new THREE.Vector3(SEAT[0],0,0));
    return freeSpotNear([p.x,p.z],environment.isFree,{start:1.6});
  };
  return {
    object,ready,
    get avatar(){return avatar;},
    get companion(){return {...status,position:body?[...body.position]:null};},
    onCompanion(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    setCompanion(value){
      wanted=Boolean(value);
      if(wanted){brain.reset();publish({enabled:true,label:'Stepping down to walk with you',source:null,reason:null});}
      else publish({enabled:false,label:mode==='seat'?'Driving your carriage':'Returning to the carriage',stance:mode==='seat'?'seat':'return',source:null,reason:null});
      return true;
    },
    update(coach,now,visitor,{pose=null,environment=null}={}) {
      const local=getLocals()?.find(p=>p.id==='carriage-driver');
      object.visible=Boolean(avatar&&coach.visible&&local&&!local.abducted);
      const dt=previous===null?0:Math.min(.08,Math.max(0,(now-previous)/1000));previous=now;
      if(!object.visible){avatar?.suspend();return;}
      const speaking=getConversation()?.id===local.id,look=visitor&&speaking?[visitor[0],visitor[2],-visitor[1]]:null;
      const player=pose&&!pose.riding?[pose.position[0],pose.position[2]]:null;
      const riding=Boolean(pose?.riding);
      // Leave the bench only when asked, while Jevica is on foot nearby.
      if(mode==='seat'&&wanted&&player&&environment&&!pose.flying) {
        const start=bench(coach,environment);
        if(start){body=createCompanionBody(start,Math.atan2(player[0]-start[0],player[1]-start[1]));mode='walking';publish({mode,label:'Walking with you'});}
      }
      if(mode==='walking'&&(!environment||!player&&!riding)){mode='seat';body=null;}
      if(mode==='walking') {
        const {seat:bench3}=seatPose(coach),home=[bench3.x,bench3.z];
        const context={player_speed:pose?.speed??0,gap_m:player?Math.hypot(player[0]-body.position[0],player[1]-body.position[1]):0,
          conversing:speaking||Boolean(getConversation()),flying:Boolean(pose?.flying),riding,indoor:Boolean(pose?.roomId),
          crowded:(getLocals()??[]).filter(p=>p.id!==local.id&&!p.indoor&&player&&Math.hypot(p.position[0]-player[0],-p.position[1]-player[1])<2.4).length>=2,
          narrow:Boolean(player&&!environment.isFree(player[0]+Math.cos(lastHeading)*1.1,player[1]-Math.sin(lastHeading)*1.1))};
        const returning=!wanted||riding,decision=returning?{stance:'return',source:null,reason:null,label:'Returning to the carriage'}:brain.update(context);
        lastHeading=playerHeading(pose,lastHeading);
        let target=null,face=null;
        if(decision.stance==='return') target=home;
        else if(player&&context.gap_m>companionRejoinDistance) {
          // She flew or travelled away: rejoin a free spot just behind her.
          const spot=freeSpotNear(player,environment.isFree,{start:1.2,heading:lastHeading});
          if(spot){body.position=spot;body.speed=0;}
        } else if(player) {
          const slot=companionSlot(player,lastHeading,decision.stance,environment.isFree,side);
          if(slot){target=slot.point;side=slot.side;}
          else {face=Math.atan2(player[0]-body.position[0],player[1]-body.position[1]);if(context.gap_m>3.2)target=companionSlot(player,lastHeading,'beside',environment.isFree,side)?.point??null;}
        }
        stepCompanion(body,target,environment,dt,{player,playerSpeed:pose?.speed??0,face});
        if(decision.stance==='return'&&Math.hypot(home[0]-body.position[0],home[1]-body.position[1])<(riding?40:1.2)) {
          mode='seat';body=null;publish({mode,stance:'seat',label:wanted?'Waiting on the bench while you ride':'Driving your carriage',source:null,reason:null});
        } else publish({mode,stance:decision.stance,source:decision.source,reason:decision.reason??null,decisions:decision.decisions??status.decisions,label:decision.label});
      }
      if(mode==='walking') {
        const ground=environment.groundAt(body.position[0],body.position[1]);
        object.quaternion.setFromAxisAngle(up,body.heading);object.position.set(body.position[0],ground,body.position[1]);
        local.position=[body.position[0],-body.position[1],ground];local.life.heading=body.heading;
        const action=status.stance==='greet'?'bow':'continue';
        avatar.update(now,action,false,{speed:body.speed,distance:body.distance,heading:body.heading},environment.groundAt,look??(player&&body.speed<.2?[pose.position[0],pose.position[1],pose.position[2]]:null),{conversing:speaking});
      } else {
        const {seat:bench3,orientation:benchTurn}=seatPose(coach);
        object.quaternion.copy(benchTurn);object.position.copy(bench3).addScaledVector(up.clone().applyQuaternion(benchTurn),-avatar.rig.hipHeight+.025);
        local.position=[object.position.x,-object.position.z,object.position.y];local.life.heading=Math.atan2(2*(benchTurn.w*benchTurn.y+benchTurn.x*benchTurn.z),1-2*(benchTurn.y**2+benchTurn.x**2));
        avatar.update(now,'continue',false,{speed:0,distance:0,riding:true,seatToFloor:(1.635-1.1275)*coach.scale.x},()=>0,look,{conversing:speaking});
      }
      object.updateWorldMatrix(true,true);costume?.update();
    },
    dispose(){disposed=true;costume?.dispose();avatar?.dispose();object.removeFromParent();listeners.clear();},
  };
}
