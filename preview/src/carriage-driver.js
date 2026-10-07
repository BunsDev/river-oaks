import {treeFlightEnvironment} from './tree-flight.js';
import {createFlightHands} from './flight-hands.js';
import {createPrinceFlight,flightSlot,glideAmount,stepPrinceFlight} from './prince-flight.js';
import {createAngelWings} from './angel-wings.js';
import { VEHICLES } from './vehicle-config.js';
import { createDrivingHands } from './driving-hands.js';
import * as THREE from 'three';
import {loadResidentAvatar} from './avatars.js';
import {createPrinceCostume,loadPrinceSkinTexture} from './prince-costume.js';
import {companionSlot,createCompanionBody,createCompanionBrain,playerHeading,protectiveSide,stepCompanion} from './prince-companion.js';
import {createCompanionNavigation,createCompanionRouteService,createCompanionRouteFollower} from './companion-navigation.js';

const SEAT=[-2.10,1.635,0];

// The dedicated Prince Jev hero and Jev stance policy share one encounter.
// Code owns every position, including stepping off and back onto the bench.
export function createCarriageDriver({scene,getLocals,getConversation=()=>null,brain=createCompanionBrain(),loadAvatar=loadResidentAvatar,loadSkinTexture=loadPrinceSkinTexture,createCostume=createPrinceCostume,createRouteService=createCompanionRouteService}) {
  const object=new THREE.Group();object.name='Prince Jev';object.userData.localId='carriage-driver';object.visible=false;scene.add(object);
  const up=new THREE.Vector3(0,1,0),seat=new THREE.Vector3(),orientation=new THREE.Quaternion(),turn=new THREE.Quaternion().setFromAxisAngle(up,-Math.PI/2);
  let avatar=null,costume=null,disposed=false,wanted=false,body=null,mode='seat',side=1,lastHeading=0,previous=null;
  let returnStall=0,returnFrom=null,flightEnvironment=null;
  let world=null,placement=null,navigation=null,service=null,follower=null,exit=null,transition=null,identity=null,lastPose=null,lastCoach=null;
  const listeners=new Set();let drivingHands=null,flight=null,wings=null,flightHands=null;
  const vehicle=()=>VEHICLES[placement?.vehicle];
  const driverSeat=()=>vehicle()?.driverSeat??SEAT;
  const status={enabled:false,mode:'seat',stance:'seat',source:null,label:'Ready to drive',reason:null,decisions:0,carrying:false};
  const publish=changes=>{
    if(Object.entries(changes).every(([key,value])=>status[key]===value))return;
    Object.assign(status,changes);listeners.forEach(listener=>listener({...status}));
  };
  const person=()=>getLocals()?.find(p=>p.id==='carriage-driver');
  const reset=()=>{
    wanted=false;mode='seat';body=null;flight=null;flightEnvironment=null;
    if(avatar){avatar.object.position.set(0,0,0);avatar.object.rotation.set(0,0,0);}exit=null;transition=null;previous=null;
    avatar?.suspend();
    brain.reset();follower?.reset();service?.dispose();service=null;follower=null;navigation=null;costume?.update({carrying:false});
    const local=person();if(local){local.indoor=false;delete local.storeId;}
    publish({enabled:false,mode,stance:'seat',source:null,label:'Ready to drive',reason:null,carrying:false});
  };
  const ready=Promise.all([loadAvatar(1,'carriage-driver','prince-jev',{folk:false}),loadSkinTexture().catch(()=>null)]).then(([next,skinTexture])=>{
    if(disposed){next.dispose();return;}
    avatar=next;object.add(next.object);object.userData.avatar=next;costume=createCostume(next,{skinTexture});wings=createAngelWings();next.object.add(wings.object);
    if(next.rig?.model){drivingHands=createDrivingHands(next.rig.model,object);flightHands=createFlightHands(next.rig.model,next.object);}
    document.querySelector('#canvas-host').dataset.carriageDriverReady='true';
  }).catch(()=>{if(!disposed)document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));});
  const seatPose=coach=>{
    coach.updateWorldMatrix(true,false);coach.localToWorld(seat.set(...driverSeat()));coach.getWorldQuaternion(orientation).multiply(turn);
    return {position:seat.clone().addScaledVector(up.clone().applyQuaternion(orientation),-avatar.rig.hipHeight+.025),orientation};
  };
  const beginWalk=()=>{
    if(!world||!placement||!avatar||!object.visible||!lastCoach||!lastPose||lastPose.riding||lastPose.flying||lastPose.roomId||Math.hypot(lastPose.position[0]-object.position.x,lastPose.position[2]-object.position.z)>8)return false;
    const nav=createCompanionNavigation(world,{placement}),base=createCompanionNavigation(world);
    if(!nav||!base)return false;
    const seated=seatPose(lastCoach),start=[seated.position.x,-seated.position.z];
    for(const side of [1,-1]) {
      const point=lastCoach.localToWorld(new THREE.Vector3(driverSeat()[0],0,side*((vehicle()?.width/2||1.36)+.55/lastCoach.scale.x))),end=[point.x,-point.z];
      if(!nav.free(end)||!base.canTravel(start,end)||(getLocals()??[]).some(p=>p.id!=='carriage-driver'&&Math.hypot(p.position[0]-point.x,p.position[1]+point.z)<.7))continue;
      service?.dispose();navigation=nav;service=createRouteService(world,placement);follower=createCompanionRouteFollower(nav,service);
      exit=[point.x,nav.ground(end),point.z];body=createCompanionBody([point.x,point.z],object.rotation.y);
      transition={from:seated.position.toArray(),to:exit,progress:0};mode='stepping-down';return true;
    }
    return false;
  };
  return {
    object,ready,
    get avatar(){return avatar;},
    get navigationDebug(){return {mode,position:object.position.toArray(),route:follower?.debug??null,sensing:mode==='flying'?flight?.sensing??null:null};},
    get canDrive(){return Boolean(avatar&&object.visible&&mode==='seat'&&!wanted);},
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
        wanted=false;publish({enabled:false,label:mode==='seat'?'Ready to drive':'Returning to your vehicle',stance:mode==='seat'?'seat':'return',source:null,reason:null});
      }
      return true;
    },
    update(coach,now,visitor,{pose=null,environment=null}={}) {
      const local=person();if(identity!==local){reset();identity=local;}
      lastCoach=coach;lastPose=pose;
      object.visible=Boolean(avatar&&coach.visible&&local);
      const dt=previous===null?0:Math.min(.08,Math.max(0,(now-previous)/1000));previous=now;
      if(!object.visible){avatar?.suspend();if(!local)reset();return;}
      const speaking=getConversation()?.id===local.id,look=visitor&&speaking?[visitor[0],visitor[2],-visitor[1]]:null;
      const player=pose&&!pose.riding?[pose.position[0],pose.position[2]]:null;
      if(mode==='stepping-down'||mode==='stepping-up') {
        transition.progress=Math.min(1,transition.progress+dt/1.6);const t=transition.progress**2*(3-2*transition.progress);
        object.position.fromArray(transition.from.map((v,i)=>v+(transition.to[i]-v)*t));object.rotation.set(0,body.heading,0);
        if(transition.progress===1) {
          mode=mode==='stepping-up'?'seat':'walking';transition=null;
          if(mode==='seat'){body=null;service?.dispose();service=null;follower?.reset();publish({mode,stance:'seat',label:'Ready to drive',source:null,reason:null});}
        }
      }
      if(mode==='walking'&&wanted&&pose?.flying&&environment?.canFly?.(object.position.x,object.position.y,object.position.z)) {
        flight=createPrinceFlight(object.position.toArray(),body.heading);mode='flying';brain.reset();follower?.reset();
      }
      if(mode==='flying'&&environment) {
        lastHeading=playerHeading(pose,lastHeading);
        const landing=!wanted||!pose?.flying||Boolean(pose?.riding);
        let target=pose?flightSlot(pose,lastHeading,side):[...flight.position];
        if(landing) {
          // Land near her on a clear patch, then resume the ordinary walking route.
          const center=player??body.position;let spot=null;
          for(const radius of [2.7,4,6,8])for(let i=0;i<16&&!spot;i++) {
            const a=lastHeading+i*Math.PI/8,x=center[0]+Math.cos(a)*radius,z=center[1]+Math.sin(a)*radius,y=environment.groundAt(x,z);
            if(environment.isFree(x,z)&&environment.canFly(x,y,z)&&navigation.free([x,-z]))spot=[x,y,z];
          }
          target=spot??[flight.position[0],flight.position[1],flight.position[2]];
        }
        const previousFlight=[...flight.position];
        if(flightEnvironment?.base!==environment)flightEnvironment={base:environment,value:treeFlightEnvironment(environment,world)};
        stepPrinceFlight(flight,target,flightEnvironment.value,dt,{landing,playerSpeed:pose?.speed??0});
        body.position=[flight.position[0],flight.position[2]];body.heading=flight.heading;
        body.speed=Math.hypot(flight.velocity[0],flight.velocity[2]);body.distance+=Math.hypot(...flight.position.map((v,i)=>v-previousFlight[i]));
        object.position.fromArray(flight.position);object.rotation.set(0,flight.heading,0);
        publish({mode,stance:'beside',source:'local',reason:null,label:landing?'Landing beside you':flight.blocked?'Finding a clear flight path':'Flying beside you'});
        if(flight.landed){mode='walking';follower?.reset();}
      }
      if(mode==='walking'&&environment) {
        const gap=player?Math.hypot(player[0]-body.position[0],player[1]-body.position[1]):0;
        const context={player_speed:pose?.speed??0,gap_m:gap,conversing:speaking||Boolean(getConversation()),flying:Boolean(pose?.flying),riding:Boolean(pose?.riding),indoor:Boolean(pose?.roomId),
          crowded:(getLocals()??[]).filter(p=>p.id!==local.id&&player&&Math.hypot(p.position[0]-player[0],-p.position[1]-player[1])<2.4).length>=2,
          narrow:Boolean(player&&!environment?.isFree(player[0]+Math.cos(lastHeading)*1.1,player[1]-Math.sin(lastHeading)*1.1))};
        const returning=!wanted||context.riding,decision=returning?{stance:'return',source:null,reason:null,label:'Returning to your vehicle'}:brain.update(context);
        lastHeading=playerHeading(pose,lastHeading);
        let target=null;
        if(player&&environment) {
          if(returning)target=[exit[0],exit[2]];
          else {const preferred=context.indoor?side:protectiveSide(world,player,lastHeading,side);const slot=companionSlot(player,lastHeading,context.flying?'beside':decision.stance,(x,z)=>environment.isFree(x,z)&&navigation.canTravel([player[0],-player[1]],[x,-z]),preferred);if(slot){target=slot.point;side=slot.side;}}
        }
        const waypoint=follower?.update(body.position,target,dt)??null;
        // No target means a deliberate hold or an unresolved route. Stop now;
        // inertia must not move him after flight, a bow or a manual decision.
        if(!waypoint)body.speed=0;
        stepCompanion(body,waypoint,environment,dt,{player,playerSpeed:pose?.speed??0,face:player?Math.atan2(player[0]-body.position[0],player[1]-body.position[1]):null});
        const ground=environment.groundAt(...body.position);object.position.set(body.position[0],ground,body.position[1]);object.rotation.set(0,body.heading,0);
        // Jevica often stands at his door; personal space can stop him a step short of
        // it. Once he has stalled nearby, he climbs in from where he is.
        const toExit=Math.hypot(body.position[0]-exit[0],body.position[1]-exit[2]);
        // Measured by actual movement: blocked steps keep his speed but not his position.
        returnStall=returning&&returnFrom&&Math.hypot(body.position[0]-returnFrom[0],body.position[1]-returnFrom[1])<.05*dt+1e-4?returnStall+dt:0;
        returnFrom=[...body.position];
        if(returning&&!context.flying&&(toExit<.18||returnStall>.75&&toExit<1.6)) {
          transition={from:object.position.toArray(),to:seatPose(coach).position.toArray(),progress:0};mode='stepping-up';
        }
        publish({mode,stance:decision.stance,source:decision.source,reason:decision.reason??null,decisions:decision.decisions??status.decisions,label:context.flying?'Moving into clear space to take flight':follower?.waiting?'Waiting for a clear path':decision.label});
      }
      if(mode==='seat') {
        const seated=seatPose(coach);object.position.copy(seated.position);object.quaternion.copy(seated.orientation);
      }
      local.position=[object.position.x,-object.position.z,object.position.y];
      const room=mode==='seat'?null:environment?.roomAt(object.position.x,object.position.z);local.indoor=Boolean(room);if(room)local.storeId=room.storeId;else delete local.storeId;
      if(local.life)Object.assign(local.life,{heading:object.rotation.y,speed:body?.speed??0,distance:body?.distance??0});
      const riding=mode==='seat',action=status.stance==='greet'?'bow':'continue';
      drivingHands?.reset();flightHands?.reset();
      if(mode!=='flying'&&flight){flight.pitch*=Math.exp(-7*dt);flight.bank*=Math.exp(-7*dt);flight.blend*=Math.exp(-7*dt);if(flight.blend<.001)flight=null;}
      const pitch=flight?.pitch??0,bank=flight?.bank??0,hip=avatar.rig.hipHeight;
      avatar.object.rotation.set(pitch,0,bank,'YXZ');
      avatar.object.position.set(0,hip*(1-Math.cos(pitch)),-hip*Math.sin(pitch));
      wings?.update(now,dt,{amount:flight?.blend??0,speed:body?.speed??0,climbing:flight?.velocity[1]??0,bank:flight?.bank??0});
      avatar.update(now,action,false,{speed:mode==='walking'?body.speed:0,flying:mode==='flying'||Boolean(flight),superheroFlight:flight?.blend??0,flightGlide:flight?glideAmount(flight.pitch/Math.max(flight.blend,.01)):0,distance:body?.distance??0,heading:body?.heading,riding,carrying:!riding&&mode!=='flying',ridingDriver:true,ridingSpeed:placement?.speed??0,ridingSteering:placement?.steering??0,ridingKind:vehicle()?.kind,seatToFloor:vehicle()?vehicle().driverSeat[1]-vehicle().driverFloor:(1.635-1.1275)*coach.scale.x},environment?.groundAt??(()=>0),look??(player&&body?.speed<.2?pose.position:null),{conversing:speaking});
      if(riding&&vehicle())drivingHands?.(coach,vehicle());
      if(flight)flightHands?.update({amount:flight.blend,speed:body?.speed??0,bank:flight.bank});
      object.updateWorldMatrix(true,true);costume?.update({carrying:!riding&&mode!=='flying'});publish({mode,carrying:!riding&&mode!=='flying'});
    },
    updateOptics(camera,viewportHeight){costume?.updateOptics?.(camera,viewportHeight);},
    dispose(){reset();disposed=true;brain.dispose?.();wings?.dispose();costume?.dispose();avatar?.dispose();object.removeFromParent();listeners.clear();},
  };
}
