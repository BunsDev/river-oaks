import { createCarriageDriver } from './carriage-driver.js';
import { createRoadVehicle } from './road-vehicles.js';
import { VEHICLES, vehicleKind } from './vehicle-config.js';
import { createChauffeur, scenicRoute } from './chauffeur.js';
import { carriageContains, carriageFootprint, findCarriageParking } from './carriage-parking.js';
import { fitCarriageToGround, stepCarriage, findCarriageExit } from './carriage-motion.js';
import { createWalkingEnvironment } from './walking.js';
import { createPedestrianNetwork } from './pedestrian-network.js';
import { Vector3, Quaternion } from 'three';

// Legacy public name keeps existing companion/force integrations compatible.
// Only road vehicles are constructed; the retired carriage and team never load.
export function createParkedCarriage({scene,walking,getWorld,getLocals,getConversation,reducedMotion=false}) {
 let kind='rolls',model=createRoadVehicle(kind);model.object.visible=false;scene.add(model.object);
 const driver=createCarriageDriver({scene,getLocals,getConversation}),chauffeur=createChauffeur();
 let placement=null,loadedWorld=null,environment=null,companionEnvironment=null,network=null,mounted=false,enabled=true;
 const removeObstacle=walking.addObstacle({contains:(...point)=>enabled&&!mounted&&carriageContains(placement,...point)});
 const apply=()=>{
  model.object.position.fromArray(placement.position);model.object.rotation.set(placement.pitch,placement.yaw,placement.roll,'YXZ');
  const up=new Vector3(0,1,0).applyQuaternion(model.object.quaternion.clone().invert());
  model.wheels.forEach((wheel,i)=>{wheel.position.fromArray(model.spec.wheels[i]).addScaledVector(up,placement.wheelOffsets[i]);wheel.rotation.set(0,i<model.spec.steeredWheels?placement.steering??0:0,placement.distance/model.spec.wheels[i][1],'YXZ');});
  model.updateSteering(placement.steering??0);model.object.updateMatrixWorld(true);
 };
 const canOccupy=next=>{
  if(carriageFootprint(next).some(([x,z])=>!environment.isFree(x,z)||environment.roomAt(x,z)||!['road','crossing'].includes(network.classify([x,-z]))))return false;
  if((getLocals()??[]).some(p=>!p.indoor&&!p.vehicleRole&&!p.abducted&&carriageContains(next,p.position[0],next.position[1]+1,-p.position[1],.65)))return false;
  return !(getWorld().vegetation?.branch_supports??[]).some(tree=>carriageContains(next,tree.position[0],next.position[1]+1,-tree.position[1],.6));
 };
 const ride={
  get pose(){return {kind,seat:model.object.localToWorld(new Vector3(...model.spec.passengerSeat)).toArray(),cameraTarget:model.object.localToWorld(new Vector3(-1,1.25,0)).toArray(),seatToFloor:model.spec.passengerSeat[1]-model.spec.passengerFloor,yaw:placement.yaw-Math.PI/2,quaternion:model.object.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.PI/2)).toArray(),speed:placement.speed,distance:placement.distance};},
  step(input,delta){if(!driver.canDrive){placement.speed=0;chauffeur.request({mode:'stop'});return;}const lookahead={...placement,position:[placement.position[0]-Math.cos(placement.yaw)*2,placement.position[1],placement.position[2]+Math.sin(placement.yaw)*2]};const controls=chauffeur.input(placement,input,delta,{roadClear:canOccupy(lookahead)});if(chauffeur.status.active&&!controls.forward)placement.speed=0;stepCarriage(placement,{groundAt:environment.groundAt,wheelTreads:model.wheelTreads,canOccupy},controls,delta);apply();},
  brake(){if(placement)placement.speed=0;chauffeur.request({mode:'stop'});},
  takeOver(){if(chauffeur.status.active)this.brake();},
  stop(){mounted=false;if(placement)placement.speed=0;chauffeur.request({mode:'stop'});},
 };
 const summon=()=>{
  if(!enabled||mounted||!environment||driver.companion.mode!=='seat')return false;
  const next=findCarriageParking(getWorld(),walking.getPose(),getLocals()??[],1,false,kind);if(!next)return false;
  chauffeur.request({mode:'stop'});placement={...next,speed:0,distance:0,steering:0};fitCarriageToGround(placement,environment.groundAt,model.wheelTreads);
  apply();model.object.visible=true;driver.configure(getWorld(),placement);return true;
 };
 return {
  get object(){return model.object;},get kind(){return kind;},get label(){return model.spec.label;},get chauffeur(){return chauffeur.status;},
  select(value){
   const next=vehicleKind(value);if(!next||mounted||driver.companion.mode!=='seat')return false;if(next===kind)return true;
   const parked=environment?findCarriageParking(getWorld(),walking.getPose(),getLocals()??[],1,false,next):null;if(environment&&!parked)return false;
   model.dispose();kind=next;model=createRoadVehicle(kind);model.object.visible=false;scene.add(model.object);placement=null;
   if(parked){placement={...parked,speed:0,distance:0,steering:0};fitCarriageToGround(placement,environment.groundAt,model.wheelTreads);apply();model.object.visible=enabled;driver.configure(getWorld(),placement);}
   chauffeur.request({mode:'stop'});return true;
  },
  tour(){return mounted&&driver.canDrive&&chauffeur.request({mode:'tour'},scenicRoute(getWorld(),placement));},
  stopTour(){chauffeur.request({mode:'stop'});if(placement)placement.speed=0;},
  setEnabled(value){enabled=value;if(!enabled){if(mounted){const seat=ride.pose.seat;walking.dismount([seat[0],environment.groundAt(seat[0],seat[2]),seat[2]]);}driver.reset();placement=null;loadedWorld=null;model.object.visible=false;driver.object.visible=false;}},
  get driver(){return driver.object;},get prince(){return driver;},get unicorns(){return [];},get spinners(){return model.spinners;},get placement(){return placement;},get riding(){return mounted;},
  get tyreClearances(){
   if(!placement)return [];model.object.updateWorldMatrix(true,true);const point=new Vector3();
   return model.wheels.map(wheel=>{let gap=Infinity;wheel.traverse(mesh=>{if(!mesh.isMesh||mesh.material.name!=='Road tyre rubber')return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);gap=Math.min(gap,point.y-environment.groundAt(point.x,point.z));}});return gap;});
  },
  board(){const pose=walking.getPose();if(!enabled||!driver.canDrive||!placement||!pose||pose.flying||pose.roomId||Math.hypot(pose.position[0]-placement.position[0],pose.position[2]-placement.position[2])>8)return false;mounted=true;if(!walking.mount(ride)){mounted=false;return false;}return true;},
  leave(){if(!mounted)return false;const exit=findCarriageExit(placement,environment,getLocals()??[]);if(!exit)return false;walking.dismount(exit);return true;},summon,
  updateOptics(camera,viewportHeight){driver.updateOptics?.(camera,viewportHeight);},
  update(now=performance.now()){
   if(!enabled)return;
   if(placement){apply();model.animate(now,placement.speed,reducedMotion);driver.update(model.object,now,walking.getPosition(),{pose:walking.getPose(),environment:companionEnvironment});}
   const world=getWorld();if(!world||!walking.getPose()||world===loadedWorld)return;
   loadedWorld=world;environment=createWalkingEnvironment(world);network=createPedestrianNetwork(world);
   companionEnvironment=createWalkingEnvironment(world,[{contains:(...point)=>Boolean(placement)&&carriageContains(placement,...point)}]);
   driver.reset();placement=null;mounted=false;model.object.visible=false;summon();
  },
  dispose(){chauffeur.dispose();removeObstacle();placement=null;driver.dispose();model.dispose();},
 };
}
