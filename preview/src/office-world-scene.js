import * as THREE from 'three';
import { ARRIVAL, arrivalCamera, arrivalFrame, ease } from './office-arrival-model.js';
import { OFFICE_ROOM, OFFICE_SPAWN } from './office-contract.js';
import { buildWorkplaceOffice } from './workplace-office.js';
import { createRemotePlayers } from './remote-players.js';
import { borrowOfficePresentation, officeStreetApproach, createOfficeArrivalClock, officePeerVisible } from './office-world-presentation.js';
import { buildOfficeGeometry } from './office-penthouse-graybox.js';
import { OFFICE_EYE_HEIGHT, OFFICE_LAYOUT_LEGACY, OFFICE_SEATED_EYE_HEIGHT, officeElevationAt, officeLayout, officeLevelElevation, officeSeatedPose, officeView } from './office-layouts.js';
import { createVisitSkyline } from './office-skyline.js';
import { arrivalBehindGlass } from './office-arrival-architecture.js';

// The street, car and office share one scene/camera/composer. Once both car
// doors close the outside district is occluded and can stop drawing. The same
// cabin then rises to level 6; there is no framebuffer or scene replacement.
export function createOfficeWorldScene({street,host,self,reducedMotion=false}) {
  const lease=borrowOfficePresentation(street),approach=officeStreetApproach(street),stage=lease.stage,clock=createOfficeArrivalClock();
  let office,actors,disposed=false,started=null,skipped=reducedMotion,lastNow=null,lastBody=null,distance=street.startPose.distance;
  let position=[...OFFICE_SPAWN],yaw=0,current=null,levelId=self.office?.levelId??null,floor=0,eye=OFFICE_EYE_HEIGHT,viewId=null,seatId=null;
  const layoutId=self.office?.layout??OFFICE_LAYOUT_LEGACY,layout=officeLayout(layoutId);
  const live=street.skyline?.mode==='live'&&layout?.levels?.some(level=>level.rooms?.some(room=>room.kind==='terrace'));
  // A glazed layout would show the borrowed cabin and lobby through its front glass once arrived.
  const glass=arrivalBehindGlass(street.lobby,layoutId!==OFFICE_LAYOUT_LEGACY);
  const peerRoot=new THREE.Group();street.scene.add(peerRoot);lease.allow(peerRoot);
  const dispose=()=>{if(disposed)return;disposed=true;actors?.dispose();peerRoot.removeFromParent();office?.dispose();glass.restore();lease.dispose();};
  try{
    office=buildOfficeGeometry(THREE,layoutId,{buildLegacy:()=>buildWorkplaceOffice(THREE,OFFICE_ROOM)});stage.add(office.object);office.object.visible=false;
    const lights=[2,-3].map((z,i)=>({position:new THREE.Vector3(0,2.9,z),color:new THREE.Color('#fff1df'),intensity:i?65:45,distance:i?10:7,decay:2}));
    // Preserve the office's authored lighting using the existing world pool.
    // Detached owned light objects have no GPU resources to dispose.
    const authored=[...office.object.children].filter(n=>n.isPointLight);
    for(const light of authored){
      lights.push({position:light.position.clone(),color:light.color.clone(),intensity:light.intensity,distance:light.distance,decay:light.decay});if(!live)light.removeFromParent();
    }
    // A layout with an outside shows the district captured once as the doors close (office-skyline.js).
    // It changes the scene only once captured, so it is released with the visit's own dispose below.
    const skyline=createVisitSkyline(street,layout,[stage,street.lobby.object,street.avatar.object,peerRoot]);
    const worldLights=lights.map(light=>({...light,position:light.position.clone()}));
    // First entry (#449): in the live outlook the office's lamps join the scene's lights when it first
    // shows, which changes the program of every lit material in view. Compile them during the arrival,
    // one batch a frame, for the pipeline's scene pass, with the office shown just for each call so its
    // lamps count. Only what is drawn is queued: the visible district
    // and the office, one object per material and kind (instanced and skinned meshes are kinds of
    // their own). A skipped arrival has nothing to hide that behind, so it holds on the street until
    // they are ready, for at most three seconds.
    const precompile=street.pipeline?.compileAsync?[]:null,kinds=new Set(),drawn=o=>(o.isMesh||o.isPoints||o.isLine||o.isSprite)&&o.material;
    const enqueue=o=>{if(!drawn(o))return;const kind=[...[o.material].flat().map(m=>m.uuid),o.isInstancedMesh?'instanced':o.isSkinnedMesh?'skinned':o.isBatchedMesh?'batched':o.type,o.receiveShadow,!!o.instanceColor,!!o.geometry?.attributes?.color].join();if(!kinds.has(kind)){kinds.add(kind);precompile.push(o);}};
    if(precompile){street.scene.traverseVisible(enqueue);office.object.traverse(enqueue);}
    const queued=precompile?.length??0;let compiling=0,batches=0,batchSize=8,holdFrom=null;
    const compiled=()=>!precompile?.length&&!compiling,settle=()=>{compiling--;};
    const compileSome=()=>{
      if(!precompile?.length)return;
      const items=precompile.splice(-batchSize).filter(o=>o.parent),batch=new THREE.Object3D(),shown=office.object.visible,started=performance.now();
      batch.traverse=visit=>items.forEach(visit);batch.traverseVisible=()=>{};
      office.object.visible=true;compiling++;batches++;
      try{street.pipeline.compileAsync(batch,street.camera,street.scene).then(settle,settle);}catch{settle();}
      finally{office.object.visible=shown;}
      // Each call also walks the scene for its lights, a fixed cost; size batches past it so the queue
      // drains during the arrival rather than one object a frame.
      const spent=performance.now()-started;batchSize=spent<12?batchSize*2:spent>32?Math.max(8,batchSize>>1):batchSize;
    };
    actors=createRemotePlayers(peerRoot,host,{snapInitialHeading:true,isVisible:p=>current?.done&&officePeerVisible({...p,position:p.office.position},self.id,position,!fixedView(),levelId)});
    const view=street.startCamera.clone(),localView=new THREE.PerspectiveCamera(),worldRotation=new THREE.Quaternion().setFromRotationMatrix(street.frame);
    const basePosition=new THREE.Vector3().setFromMatrixPosition(street.frame),point=new THREE.Vector3(),worldBody=new THREE.Vector3();
    const turn=Math.atan2(street.frame.elements[8],street.frame.elements[10]);
    // A view (#363) puts the camera at its fixed eye; otherwise the first-person eye follows the visitor.
    const fixedView=()=>viewId&&layout?officeView(layout,viewId):null;
    const placeCamera=()=>{
      const fixed=fixedView();
      if(fixed){const base=officeLevelElevation(layout,fixed.levelId)??0;view.position.set(fixed.eye[0],fixed.eye[1]+base,-fixed.eye[2]);view.lookAt(fixed.target[0],fixed.target[1]+base,-fixed.target[2]);}
      else{view.position.set(position[0],eye+floor,-position[1]);view.rotation.set(0,yaw,0,'YXZ');}
      view.fov=62;
    };
    function prepare(now){
      if(disposed)return;
      const ready=street.avatar.ready;
      if(started===null&&ready)started=now;
      const elapsed=clock.tick(now,ready),time=Math.max(0,elapsed-approach.duration);
      compileSome();
      if(skipped&&!compiled())holdFrom??=now;
      const holding=skipped&&!compiled()&&now-holdFrom<3000,entering=holding||!skipped&&elapsed<approach.duration;
      const frame=arrivalFrame(time,{reducedMotion:skipped}),aspect=host.clientWidth/Math.max(1,host.clientHeight);
      current={...frame,phase:started===null&&!skipped?'loading':entering?'lobby':frame.phase,ready,progress:skipped?1:Math.min(1,elapsed/(approach.duration+ARRIVAL.duration))};
      const ascent=frame.done?1:ease((time-ARRIVAL.closingEnd)/(ARRIVAL.ascentEnd-ARRIVAL.closingEnd));
      const height=ARRIVAL.officeElevation*ascent;
      stage.position.copy(basePosition);stage.position.y+=height;
      // The office lights follow the street's time of day; in the pool they carry it as well.
      const atmosphere=street.atmosphere?.();
      if(atmosphere&&office.relight){office.relight(atmosphere,street.scene.environment);authored.forEach((light,i)=>{lights[2+i].color.copy(light.color);lights[2+i].intensity=light.intensity;});}
      worldLights.forEach((light,i)=>{light.position.copy(lights[i].position).applyMatrix4(street.frame);light.position.y+=height;light.color.copy(lights[i].color);light.intensity=lights[i].intensity;});
      const lightBlend=skipped?1:ease(elapsed/.8);if(!live)lease.lights(worldLights,lightBlend);
      const inside=!entering&&(skipped||time>=ARRIVAL.closingEnd);
      // The capture sees the street's own lighting, not the cabin's (office-skyline.js).
      if(inside&&skyline?.pending){lease.inside(false);lease.lights(worldLights,0);skyline.capture();lease.lights(worldLights,lightBlend);}
      lease.inside(inside&&!(live&&frame.done));
      office.object.visible=!entering&&['opening','arriving','office'].includes(frame.phase);
      street.lobby.setEntryOpen(entering?ease(elapsed/.8):1);
      street.lobby.update(entering?{phase:'idle',doors:0,floor:1}:frame);
      // Once arrived there, only the car's front doors stay drawn, closed, in the doorway.
      glass.update(frame);
      let body;
      if(entering){
        const start=approach.at(holding?0:elapsed,aspect);body=start.player;view.position.copy(start.camera);view.quaternion.copy(start.quaternion);view.fov=start.fov;
      }else if(frame.done){
        body=point.set(position[0],floor,-position[1]);placeCamera();
      }else{
        body=point.set(frame.position[0],0,-frame.position[1]);const path=arrivalCamera(time,{aspect});view.position.fromArray(path.position);view.lookAt(...path.target);view.fov=path.verticalFov;
      }
      // Keep a local camera for the exact first-person boundary and diagnostics.
      localView.copy(view);view.position.applyMatrix4(street.frame);view.position.y+=height;view.quaternion.premultiply(worldRotation);view.aspect=aspect;
      lease.camera(view);
      worldBody.copy(body).applyMatrix4(street.frame);worldBody.y+=height;
      const delta=lastNow===null?0:Math.max(0,(now-lastNow)/1000),dx=lastBody?worldBody.x-lastBody.x:0,dz=lastBody?worldBody.z-lastBody.z:0;
      const speed=delta?Math.hypot(dx,dz)/delta:0;
      if(delta>0)distance+=Math.hypot(dx,dz);
      const firstPerson=frame.done&&!fixedView()||(!entering&&frame.phase==='arriving'&&localView.position.distanceTo(body)<1.9);
      const seated=frame.done&&seatId&&layout?officeSeatedPose(layout,{seat:{id:seatId},levelId}):null;
      const ground=worldBody.y;
      // The car floor carries the body (foot-placement.js `platform`): read as a curb step,
      // each frame of the climb left the body and shoes behind, sinking out through the floor.
      street.avatar.setPresentation({...street.startPose,position:[worldBody.x,ground+1.68,worldBody.z],ground,groundAt:()=>ground,platform:stage.position.toArray(),altitude:0,flying:false,landing:false,riding:null,sitting:seated?{buildId:'office',slot:0,height:seated.height,yaw:seated.yaw+turn}:null,roomId:'authorized-office',showBody:!firstPerson&&(frame.presence??1)>0&&(entering?street.startPose.showBody:true),speed,velocity:delta?[dx/delta,dz/delta]:[0,0],distance,heading:Math.hypot(dx,dz)>.0001?Math.atan2(dx,dz):undefined});
      lastNow=now;lastBody=worldBody.clone();
      current.position=[body.x,-body.z];
    }
    return {prepare,
      render(now,nextPosition,nextYaw,players,place={}){
        if(disposed)return null;position=[...nextPosition];yaw=nextYaw;
        levelId=place.levelId??levelId;floor=layout?officeElevationAt(layout,levelId,position)??0:0;eye=place.seatId?OFFICE_SEATED_EYE_HEIGHT:OFFICE_EYE_HEIGHT;
        viewId=place.viewId??null;seatId=place.seatId??null;
        if(lastNow!==now)prepare(now);
        if(current.done){placeCamera();view.position.applyMatrix4(street.frame);view.position.y+=ARRIVAL.officeElevation;view.quaternion.premultiply(worldRotation);lease.camera(view);}
        actors.sync(players.filter(p=>p.id!==self.id&&p.office?.id===self.office.id).map(p=>{
          const v=new THREE.Vector3(p.office.position[0],p.office.elevation??0,-p.office.position[1]).applyMatrix4(street.frame);v.y+=ARRIVAL.officeElevation;
          // A claimed seat (#363) poses the peer on it, turned with the office into the street frame.
          const seated=layout?officeSeatedPose(layout,p.office):null;
          return {...p,position:[v.x,-v.z,v.y],yaw:p.office.yaw+turn,altitude:0,vehicle:null,sitting:seated?{...seated,yaw:seated.yaw+turn}:null,interaction:null};
        }),null);
        actors.update(now,street.camera);office.update?.(now/1000);
        if(live&&current.done)skyline.render(()=>lease.render(1/60));else lease.render(1/60);
        skyline?.mainFrameRendered();
        return current;
      },
      releaseGraphics(){skyline?.releaseGraphics();},
      skip(){skipped=true;},get position(){return current?.position??position;},
      inspect(){return {camera:{position:street.camera.position.toArray(),quaternion:street.camera.quaternion.toArray(),verticalFov:street.camera.fov},actors:actors.stats(),duration:approach.duration+ARRIVAL.duration,dimensions:ARRIVAL,presentation:'shared-world',skyline:skyline?.stats??null,precompile:precompile&&{queued,remaining:precompile.length,compiling,batches},elevation:stage.position.y-basePosition.y,phase:current?.phase,progress:current?.progress,skipped,avatar:street.avatar.object.position.toArray(),
        // The rendered shoes' world height: where the body is drawn, not only where it is placed.
        shoes:['foot_l','foot_r'].map(name=>street.avatar.object.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).y??null)};},
      dispose(){skyline?.dispose();dispose();},
    };
  }catch(error){dispose();throw error;}
}
