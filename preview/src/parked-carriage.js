import { createCarriageDriver } from './carriage-driver.js';
import { createRoadVehicle } from './road-vehicles.js';
import { VEHICLES, vehicleKind, vehicleChauffeured, drivingInput } from './vehicle-config.js';
import { createChauffeur, scenicRoute } from './chauffeur.js';
import { carriageContains, findCarriageParking, vehicleCanOccupy } from './carriage-parking.js';
import { fitCarriageToGround, stepCarriage, findCarriageExit, hoverClear, stepHoverLift } from './carriage-motion.js';
import { createWalkingEnvironment } from './walking.js';
import { Vector3, Quaternion } from 'three';
import { isManeuverKind, maneuverMinimumAltitude, maneuverPose, validManeuver } from './ribbonwing-maneuvers.js';
import { serverNow } from './server-clock.js';

// Public name retained for companion integrations.
// Only road vehicles are constructed; the retired carriage and team never load.
export function createParkedCarriage({scene,walking,getWorld,getLocals,getConversation,requestExit=async()=>({ok:true}),requestChauffeur,requestManeuver=async()=>({ok:false}),reducedMotion=false}) {
 let kind='rolls',model=createRoadVehicle(kind);model.object.visible=false;scene.add(model.object);
 const driver=createCarriageDriver({scene,getLocals,getConversation}),chauffeur=createChauffeur({fetcher:requestChauffeur});
 let placement=null,loadedWorld=null,environment=null,companionEnvironment=null,mounted=false,enabled=true,exiting=false,heldControls={};
 // Jev drives only a chauffeured kind; the Ribbonwing is piloted by the
 // player from its driver (left) seat with Jev not aboard (as open #767 does
 // for every non-chauffeured kind).
 const chauffeured=()=>vehicleChauffeured(kind),seat=()=>chauffeured()?model.spec.passengerSeat:model.spec.driverSeat,floor=()=>chauffeured()?model.spec.passengerFloor:model.spec.driverFloor;
 const driverReady=()=>!chauffeured()||driver.canDrive;
 const airborne=()=>(placement?.altitude??0)>.1;
 // A server-admitted Ribbonwing maneuver (#777): while it runs the craft follows
 // the authored path from the town's start time, and nothing else moves it.
 let activeManeuver=null,maneuverPending=false,maneuverTrace=[];
 // The last few maneuver transitions, for the debug hook (`__riverCarriage().maneuverTrace`).
 const trace=event=>{maneuverTrace.push({event,at:Date.now(),id:activeManeuver?.id??null});if(maneuverTrace.length>8)maneuverTrace.shift();};
 const yawAxis=new Vector3(0,1,0),pitchAxis=new Vector3(0,0,-1),rollAxis=new Vector3(-1,0,0),turn=new Quaternion();
 // The town's path point is the pilot's seat (a riding pose reports the seat), so the
 // craft turns about the seat: its origin sits a rotated seat offset away.
 const seatOffset=(quaternion,target)=>target.set(seat()[0],0,seat()[2]).applyQuaternion(quaternion);
 const flat=new Vector3(),full=new Vector3(),heading=new Quaternion();
 const placeAtSeat=(x,z,altitude,yaw)=>{
  seatOffset(heading.setFromAxisAngle(yawAxis,yaw),flat);
  const cx=x-flat.x,cz=z-flat.z;
  Object.assign(placement,{position:[cx,environment?.groundAt(cx,cz)??placement.position[1],cz],altitude,liftTarget:altitude,verticalSpeed:0,yaw,pitch:0,roll:0,speed:0,landing:false});
 };
 const followManeuver=()=>{
  const at=maneuverPose(activeManeuver,serverNow()),x=at.east,z=-at.north;
  placeAtSeat(x,z,at.altitude,at.heading-Math.PI);
  apply();
  // Yaw, then nose-up pitch, then right-wing-down roll, in the craft's own frame (front -X, left +Z).
  model.object.quaternion.setFromAxisAngle(yawAxis,placement.yaw).multiply(turn.setFromAxisAngle(pitchAxis,at.pitch)).multiply(turn.setFromAxisAngle(rollAxis,at.roll));
  seatOffset(model.object.quaternion,full);
  model.object.position.set(x-full.x,placement.position[1]+at.altitude-full.y,z-full.z);
  model.object.updateMatrixWorld(true);
  if(at.done){trace('done');activeManeuver=null;apply();}
  return at;
 };
 const removeObstacle=walking.addObstacle({contains:(...point)=>enabled&&!mounted&&!airborne()&&carriageContains(placement,...point)});
 const apply=()=>{
  model.object.position.fromArray(placement.position);model.object.position.y+=placement.altitude??0;model.object.rotation.set(placement.pitch,placement.yaw,placement.roll,'YXZ');
  const up=new Vector3(0,1,0).applyQuaternion(model.object.quaternion.clone().invert());
  model.wheels.forEach((wheel,i)=>{wheel.position.fromArray(model.spec.wheels[i]).addScaledVector(up,placement.wheelOffsets[i]);wheel.rotation.set(0,i<model.spec.steeredWheels?placement.steering??0:0,placement.distance/model.spec.wheels[i][1],'YXZ');});
  model.updateSteering(placement.steering??0);model.object.updateMatrixWorld(true);
 };
 // In the air the hull must clear buildings and trees; on the ground the road rules apply.
 const canOccupy=next=>(next.altitude??0)>.1?hoverClear(next,environment):vehicleCanOccupy(next,environment,getWorld(),getLocals()??[]);
 const ride={
  get pose(){return {maneuver:activeManeuver?activeManeuver.kind:null,kind,driver:!chauffeured(),seat:model.object.localToWorld(new Vector3(...seat())).toArray(),cameraTarget:model.object.localToWorld(new Vector3(-1,1.25,0)).toArray(),seatToFloor:seat()[1]-floor(),yaw:placement.yaw-Math.PI/2,quaternion:model.object.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.PI/2)).toArray(),speed:placement.speed,distance:placement.distance,altitude:placement.altitude??0,flying:airborne(),landing:Boolean(placement.landing)};},
  step(input,delta){if(activeManeuver&&placement){followManeuver();return;}if(!driverReady()){placement.speed=0;chauffeur.request({mode:'stop'});return;}const lookahead={...placement,position:[placement.position[0]-Math.cos(placement.yaw)*2,placement.position[1],placement.position[2]+Math.sin(placement.yaw)*2]};const rear={...placement,position:[placement.position[0]+Math.cos(placement.yaw)*2,placement.position[1],placement.position[2]-Math.sin(placement.yaw)*2]};const manual=drivingInput(input);if(model.spec.flies){stepHoverLift(placement,environment,{lift:input?.lift},delta);if(airborne())chauffeur.request({mode:'stop'});}const controls=airborne()?manual:chauffeur.input(placement,manual.forward||manual.turn||manual.strafe?manual:heldControls,delta,{roadClear:canOccupy(lookahead),rearClear:canOccupy(rear)});if(chauffeur.status.active&&!controls.forward)placement.speed=0;stepCarriage(placement,{groundAt:environment.groundAt,wheelTreads:model.wheelTreads,canOccupy},controls,delta);apply();},
  brake(){if(placement)placement.speed=0;chauffeur.request({mode:'stop'});heldControls={};},
  takeOver(){if(chauffeur.status.active)this.brake();},
  land(){if(activeManeuver)return false;if(placement&&airborne()){placement.landing=true;placement.liftTarget=0;return true;}return false;},
  stop(){mounted=false;heldControls={};if(placement)placement.speed=0;chauffeur.request({mode:'stop'});},
 };
 const summon=()=>{
  if(!enabled||mounted||!environment||(chauffeured()&&driver.companion.mode!=='seat'))return false;
  const next=findCarriageParking(getWorld(),walking.getPose(),getLocals()??[],1,false,kind);if(!next)return false;
  chauffeur.request({mode:'stop'});placement={...next,speed:0,distance:0,steering:0,altitude:0,liftTarget:0,verticalSpeed:0,landing:false};fitCarriageToGround(placement,environment.groundAt,model.wheelTreads);
  apply();model.object.visible=true;if(chauffeured())driver.configure(getWorld(),placement);else{driver.reset();driver.object.visible=false;}return true;
 };
 return {
  get object(){return model.object;},get kind(){return kind;},get label(){return model.spec.label;},get chauffeur(){return chauffeur.status;},
  select(value){
   const next=vehicleKind(value);if(!next||mounted||(chauffeured()&&driver.companion.mode!=='seat'))return false;if(next===kind)return true;
   const parked=environment?findCarriageParking(getWorld(),walking.getPose(),getLocals()??[],1,false,next):null;if(environment&&!parked)return false;
   activeManeuver=null;model.dispose();kind=next;model=createRoadVehicle(kind);model.object.visible=false;scene.add(model.object);placement=null;
   if(parked){placement={...parked,speed:0,distance:0,steering:0,altitude:0,liftTarget:0,verticalSpeed:0,landing:false};fitCarriageToGround(placement,environment.groundAt,model.wheelTreads);apply();model.object.visible=enabled;if(chauffeured())driver.configure(getWorld(),placement);}
   if(!chauffeured()){driver.reset();driver.object.visible=false;}
   chauffeur.request({mode:'stop'});return true;
  },
  tour(){return mounted&&chauffeured()&&driver.canDrive&&!airborne()&&chauffeur.request({mode:'tour'},scenicRoute(getWorld(),placement));},
  setControls(input){if(!mounted)return false;heldControls=drivingInput(input);if(heldControls.forward||heldControls.turn||heldControls.strafe){chauffeur.request({mode:'stop'});}if(heldControls.brake){ride.brake();heldControls={brake:true};}return true;},
  pauseTour(){if(!mounted)return false;const ok=chauffeur.request({mode:'pause'});if(placement)placement.speed=0;return ok;},
  resumeTour(){return mounted&&chauffeured()&&driver.canDrive&&chauffeur.request({mode:'resume'});},
  park(){ride.brake();if(placement)apply();return mounted;},
  stopTour(){chauffeur.request({mode:'stop'});if(placement)placement.speed=0;},
  setEnabled(value){enabled=value;if(!enabled){activeManeuver=null;if(mounted){const seat=ride.pose.seat;walking.dismount([seat[0],environment.groundAt(seat[0],seat[2]),seat[2]]);}driver.reset();placement=null;loadedWorld=null;model.object.visible=false;driver.object.visible=false;}},
  get driver(){return driver.object;},get prince(){return driver;},get unicorns(){return [];},get spinners(){return model.spinners;},get placement(){return placement;},get chauffeured(){return chauffeured();},get riding(){return mounted;},get airborne(){return airborne();},land(){return ride.land();},
  // The Ribbonwing's mechanism state (canopy, steps, gear, tuck, fans, nozzles), for the journeys.
  get mechanisms(){return model.ribbonwing?.rig.value??null;},
  get maneuver(){return activeManeuver?{...activeManeuver}:null;},get maneuverTrace(){return maneuverTrace.map(entry=>({...entry}));},
  // The town's word on this player's maneuver (each snapshot): adopt one this page
  // missed (a lost reply, a reload mid-path); when the town ended it early (recovery),
  // hover level where the town put the craft.
  syncManeuver(self){
   if(!self||!placement||!mounted||kind!=='hover')return;
   const m=validManeuver(self.maneuver)?self.maneuver:null;
   if(m&&activeManeuver?.id!==m.id){activeManeuver=m;trace('adopted');placement.speed=0;heldControls={};return;}
   if(!m&&activeManeuver&&serverNow()<activeManeuver.startedAt+activeManeuver.duration-250){
    trace('ended by town');activeManeuver=null;placeAtSeat(self.position[0],-self.position[1],self.altitude,placement.yaw);apply();
   }
  },
  // Ask the town for a maneuver: piloting the Ribbonwing, aloft, high enough for this path.
  async flyManeuver(name){
   if(!isManeuverKind(name))return {ok:false,error:'invalid_maneuver'};
   if(!mounted||kind!=='hover'||chauffeured()||!placement)return {ok:false,error:'maneuver_requires_ribbonwing'};
   if(activeManeuver||maneuverPending)return {ok:false,error:'maneuver_active'};
   if((placement.altitude??0)<maneuverMinimumAltitude(name)-1e-6||placement.landing)return {ok:false,error:'maneuver_too_low',minimum:maneuverMinimumAltitude(name)};
   maneuverPending=true;
   try{
    const result=await requestManeuver(name);
    const m=result?.ok&&validManeuver(result.player?.maneuver)?result.player.maneuver:null;
    if(m&&mounted&&kind==='hover'){activeManeuver=m;placement.speed=0;heldControls={};trace('admitted');}else trace(`reply ${result?.ok?'without path':result?.error??'refused'}`);
    return result??{ok:false};
   } finally {maneuverPending=false;}
  },
  get tyreClearances(){
   if(!placement)return [];model.object.updateWorldMatrix(true,true);const point=new Vector3();
   return model.wheels.map(wheel=>{let gap=Infinity;wheel.traverse(mesh=>{if(!mesh.isMesh||mesh.material.name!=='Road tyre rubber')return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);gap=Math.min(gap,point.y-environment.groundAt(point.x,point.z));}});return gap;});
  },
  board(){const pose=walking.getPose();if(!enabled||!driverReady()||!placement||!pose||pose.flying||pose.roomId||Math.hypot(pose.position[0]-placement.position[0],pose.position[2]-placement.position[2])>8)return false;mounted=true;if(!walking.mount(ride)){mounted=false;return false;}return true;},
  get exiting(){return exiting;},
  async leave(){
   if(!mounted||exiting)return false;
   // Nobody steps out in mid-air: the coach lands first, then G works as on the ground.
   if(activeManeuver)return false;
   if(airborne()){ride.land();return false;}
   const exit=findCarriageExit(placement,environment,getLocals()??[]);if(!exit)return false;
   const seat=ride.pose.seat;ride.brake();exiting=true;
   try {
    const result=await requestExit(exit);if(!result.ok)return false;
    const destination=result.player?[result.player.position[0],result.player.position[2],-result.player.position[1]]:exit;
    walking.dismount(destination);
    walking.setYaw(Math.atan2(destination[0]-seat[0],destination[2]-seat[2]));
    return true;
   } catch {return false;} finally {exiting=false;}
  },summon,
  updateOptics(camera,viewportHeight){driver.updateOptics?.(camera,viewportHeight);},
  update(now=performance.now()){
   if(!enabled)return;
   if(placement){
    const flight=activeManeuver?followManeuver():null;
    if(!flight)apply();
    // The craft's mechanisms follow its accepted state: the canopy and steps
    // open for the owner on foot within boarding reach (8 m, as board()), the fans idle once boarded, the gear
    // retracts aloft and deploys to land (ribbonwing-rig.js).
    if(model.setFlightState){const pose=walking.getPose(),near=Boolean(pose&&!mounted&&!pose.flying&&Math.hypot(pose.position[0]-placement.position[0],pose.position[2]-placement.position[2])<8);
     model.setFlightState({phase:flight&&!flight.done?'maneuver':!mounted?(near?'boarding':'parked'):placement.landing?'landing':airborne()?(Math.abs(placement.speed)>1?'cruise':'hover'):'ready',tuck:flight&&!flight.done?flight.tuck:0,altitude:placement.altitude??0,maxSpeed:model.spec.maxSpeed,occupied:mounted,boarding:near,turn:(placement.steering??0)/model.spec.steeringLimit});}
    model.animate(now,placement.speed,reducedMotion);
    if(chauffeured())driver.update(model.object,now,walking.getPosition(),{pose:walking.getPose(),environment:companionEnvironment});else driver.object.visible=false;
   }
   const world=getWorld();if(!world||!walking.getPose()||world===loadedWorld)return;
   loadedWorld=world;environment=createWalkingEnvironment(world);
   companionEnvironment=createWalkingEnvironment(world,[{contains:(...point)=>Boolean(placement)&&carriageContains(placement,...point)}]);
   driver.reset();placement=null;mounted=false;model.object.visible=false;summon();
  },
  dispose(){activeManeuver=null;chauffeur.dispose();removeObstacle();placement=null;driver.dispose();model.dispose();},
 };
}
