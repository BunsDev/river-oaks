import * as THREE from 'three';
import {loadResidentAvatar} from './avatars.js';

export function createCarriageDriver({scene,getLocals,getConversation=()=>null}) {
  const object=new THREE.Group();object.name='Jules · pink-clad coachman';object.userData.localId='carriage-driver';object.visible=false;scene.add(object);
  const up=new THREE.Vector3(0,1,0),seat=new THREE.Vector3(),orientation=new THREE.Quaternion(),turn=new THREE.Quaternion().setFromAxisAngle(up,-Math.PI/2);
  let avatar=null,disposed=false;
  const ready=loadResidentAvatar(1,'carriage-driver','man-tailored',{folk:false}).then(next=>{
    if(disposed){next.dispose();return;}
    avatar=next;object.add(next.object);object.userData.avatar=next;
    for(const [source,material]of next.rig.materials) {
      if(/suit|shirt|jacket|trouser|pants|vest|shoes|tie/i.test(source.name)) {
        material.color.set(/shoes/i.test(source.name)?'#ce6e9c':'#efa1c3');material.roughness=.57;material.metalness=.02;
        // Retain the original cloth variation while lifting its black dye into
        // a rose palette. Texture and geometry ownership stay with this rig.
        material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
float clothLuma=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
diffuseColor.rgb=diffuse*mix(.55,1.0,pow(clamp(clothLuma,0.0,1.0),.35));
#endif`);};
        material.customProgramCacheKey=()=> 'river-oaks-rose-coachman-v1';material.needsUpdate=true;
      }
    }
    document.querySelector('#canvas-host').dataset.carriageDriverReady='true';
  }).catch(()=>{if(!disposed)document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));});
  return {
    object,ready,
    get avatar(){return avatar;},
    update(coach,now,visitor) {
      const local=getLocals()?.find(p=>p.id==='carriage-driver');
      object.visible=Boolean(avatar&&coach.visible&&local&&!local.abducted);
      if(!object.visible){avatar?.suspend();return;}
      coach.updateWorldMatrix(true,false);coach.localToWorld(seat.set(-2.10,1.635,0));coach.getWorldQuaternion(orientation).multiply(turn);
      object.quaternion.copy(orientation);object.position.copy(seat).addScaledVector(up.clone().applyQuaternion(orientation),-avatar.rig.hipHeight+.025);
      local.position=[object.position.x,-object.position.z,object.position.y];local.life.heading=Math.atan2(2*(orientation.w*orientation.y+orientation.x*orientation.z),1-2*(orientation.y**2+orientation.x**2));
      const speaking=getConversation()?.id===local.id,look=visitor&&speaking?[visitor[0],visitor[2],-visitor[1]]:null;
      avatar.update(now,'continue',false,{speed:0,distance:0,riding:true,seatToFloor:(1.635-1.1275)*coach.scale.x},()=>0,look,{conversing:speaking});
      object.updateWorldMatrix(true,true);
    },
    dispose(){disposed=true;avatar?.dispose();object.removeFromParent();},
  };
}
