import { createCarriageDriver } from './carriage-driver.js';
import { createUnicornTeam, loadUnicornAsset } from './unicorn-team.js';
import { createWheelSpinners } from './wheel-spinners.js';
import { createJevicaCarriage } from './jevica-carriage.js';
import { carriageContains, carriageFootprint, findCarriageParking } from './carriage-parking.js';
import { CARRIAGE_WHEELS, fitCarriageToGround, stepCarriage, findCarriageExit } from './carriage-motion.js';
import { createWalkingEnvironment } from './walking.js';
import { createPedestrianNetwork } from './pedestrian-network.js';
import { Vector3, Quaternion } from 'three';

export function createParkedCarriage({scene,walking,getWorld,getLocals,getConversation,reducedMotion=false}) {
  const scale=.9,model=createJevicaCarriage();model.object.scale.setScalar(scale);model.object.visible=false;scene.add(model.object);
  const spinnerMotion=createWheelSpinners(CARRIAGE_WHEELS.map(w=>w[1]*scale),{reducedMotion});
  const driver=createCarriageDriver({scene,getLocals,getConversation});
  let previousTime=null;
  let placement=null,loadedWorld=null,environment=null,network=null,mounted=false;
  let unicorns=null,disposed=false,enabled=true;
  loadUnicornAsset().then(asset=>{if(disposed)return;unicorns=createUnicornTeam({scene,coach:model.object,groundAt:(x,z)=>environment?.groundAt(x,z)??0,asset});unicorns.object.visible=enabled&&model.object.visible;document.querySelector('#canvas-host').dataset.unicornsReady='true';}).catch(()=>{if(!disposed)document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));});
  const removeObstacle=walking.addObstacle({contains:(...point)=>enabled&&!mounted&&carriageContains(placement,...point)});
  const apply=()=>{
    model.object.position.fromArray(placement.position);
    model.object.rotation.set(placement.pitch,placement.yaw,placement.roll,'YXZ');
    const up=new Vector3(0,1,0).applyQuaternion(model.object.quaternion.clone().invert());
    model.wheels.forEach((wheel,i)=>{
      wheel.position.fromArray(CARRIAGE_WHEELS[i]).addScaledVector(up,placement.wheelOffsets[i]/scale);
      wheel.rotation.z=placement.distance/(CARRIAGE_WHEELS[i][1]*scale);
      model.spinners[i].rotation.z=spinnerMotion.offset(i,wheel.rotation.z);
    });
    model.object.updateMatrixWorld(true);
  };
  const canOccupy=next=>{
    if(carriageFootprint(next).some(([x,z])=>!environment.isFree(x,z)||environment.roomAt(x,z)||!['road','crossing'].includes(network.classify([x,-z]))))return false;
    if((getLocals()??[]).some(p=>!p.indoor&&!p.vehicleRole&&!p.abducted&&carriageContains(next,p.position[0],next.position[1]+1,-p.position[1],.65)))return false;
    return !(getWorld().vegetation?.branch_supports??[]).some(tree=>carriageContains(next,tree.position[0],next.position[1]+1,-tree.position[1],.6));
  };
  const ride={
    get pose(){const seat=model.object.localToWorld(new Vector3(.99,1.555,0));return {seat:seat.toArray(),cameraTarget:model.object.localToWorld(new Vector3(-2,2,0)).toArray(),seatToFloor:(1.555-1.1725)*scale,yaw:placement.yaw-Math.PI/2,quaternion:model.object.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.PI/2)).toArray(),speed:placement.speed,distance:placement.distance};},
    step(input,delta){stepCarriage(placement,{groundAt:environment.groundAt,wheelTreads:model.wheelTreads,canOccupy},input,delta);apply();},
    brake(){if(placement)placement.speed=0;},
    stop(){mounted=false;if(placement)placement.speed=0;},
  };
  const summon=()=>{
    if(!enabled||mounted)return false;
    const next=findCarriageParking(getWorld(),walking.getPose(),getLocals()??[],scale,true);
    if(!next)return false;
    spinnerMotion.reset();unicorns?.reset();placement={...next,speed:0,distance:0};fitCarriageToGround(placement,environment.groundAt,model.wheelTreads);
    apply();model.object.visible=true;
    return true;
  };
  return {
    object:model.object,
    setEnabled(value){
      enabled=value;
      if(!enabled){
        if(mounted){const seat=ride.pose.seat;walking.dismount([seat[0],environment.groundAt(seat[0],seat[2]),seat[2]]);}
        placement=null;loadedWorld=null;model.object.visible=false;driver.object.visible=false;
        if(unicorns)unicorns.object.visible=false;
      }
    },
    get driver(){return driver.object;},
    get unicorns(){return unicorns?.inspect()??[];},
    get placement(){return placement;},
    get riding(){return mounted;},
    get spinners(){return spinnerMotion.inspect().map((s,i)=>({...s,rotation:model.spinners[i].rotation.z,wheelRotation:model.wheels[i].rotation.z}));},
    // Acceptance reads the rendered, rotated tread vertices independently of
    // the cached wheel-local contact samples used by the suspension solver.
    get tyreClearances(){
      if(!placement)return [];
      model.object.updateWorldMatrix(true,true);const point=new Vector3();
      return model.wheels.map(wheel=>{
        let gap=Infinity;
        wheel.traverse(mesh=>{
          if(!mesh.isMesh||mesh.material.name!=='Dark leather wheel treads')return;
          const vertices=mesh.geometry.attributes.position;
          for(let i=0;i<vertices.count;i++) {
            point.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);
            gap=Math.min(gap,point.y-environment.groundAt(point.x,point.z));
          }
        });
        return gap;
      });
    },
    board(){
      const pose=walking.getPose();
      if(!enabled||!placement||!pose||pose.flying||pose.roomId||(Math.hypot(pose.position[0]-placement.position[0],pose.position[2]-placement.position[2])>8&&!carriageContains(placement,pose.position[0],placement.position[1]+1,pose.position[2],3)))return false;
      mounted=true;if(!walking.mount(ride)){mounted=false;return false;}return true;
    },
    leave(){
      if(!mounted)return false;
      const exit=findCarriageExit(placement,environment,getLocals()??[]);
      if(!exit)return false;
      walking.dismount(exit);return true;
    },
    summon,
    update(now=performance.now()){
      if(!enabled){previousTime=now;return;}
      const delta=previousTime===null?0:Math.max(0,(now-previousTime)/1000);previousTime=now;
      if(placement){spinnerMotion.update(delta,placement.speed);apply();driver.update(model.object,now,walking.getPosition());unicorns?.update(now/1000,Math.min(delta,.08),placement.speed,placement.distance,driver.object);}
      const world=getWorld();if(!world||!walking.getPose()||world===loadedWorld)return;
      loadedWorld=world;environment=createWalkingEnvironment(world);network=createPedestrianNetwork(world);
      placement=null;mounted=false;model.object.visible=false;summon();
    },
    dispose(){disposed=true;removeObstacle();placement=null;unicorns?.dispose();driver.dispose();model.dispose();},
  };
}
