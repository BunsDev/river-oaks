import * as THREE from 'three';

// Sample authored quaternion clips on a small pose buffer, then layer them onto
// the live rig. Binding the mixer directly to reset-every-frame bones would let
// its unchanged-value cache erase a held pose on the next frame.
function createArmClips(avatar,armSwing) {
  const pose=new THREE.Group(),bindings=[],sweep=[],follow=[];
  const quaternion=new THREE.Quaternion();
  for(const side of ['l','r'])for(const part of ['upperarm','lowerarm','hand']) {
    const bone=avatar.model.getObjectByName(`${part}_${side}`);if(!bone)continue;
    const proxy=new THREE.Object3D();proxy.name=bone.name;pose.add(proxy);
    bindings.push({bone,proxy,loaded:side==='r'});
    const direction=side==='l'?1:-1,axis=avatar.axes.get(bone).x.clone().normalize();
    const values=[-1,0,1].flatMap(phase=>{
      const angle=part==='upperarm'?armSwing*phase*direction
        :part==='lowerarm'?-.14+.09*phase*direction:.03*phase*direction;
      return quaternion.setFromAxisAngle(axis,angle).toArray();
    });
    (part==='upperarm'?sweep:follow).push(new THREE.QuaternionKeyframeTrack(`${proxy.name}.quaternion`,[0,.5,1],values));
  }
  const mixer=new THREE.AnimationMixer(pose);
  const action=(name,tracks)=>{
    const result=mixer.clipAction(new THREE.AnimationClip(name,1,tracks));
    result.paused=true;result.play();return result;
  };
  const shoulders=action('Contact-driven arm swing',sweep),forearms=action('Elbow and wrist follow-through',follow);
  return {
    apply(phase,lag,strength,carried,casting) {
      shoulders.time=(phase+1)*.5;forearms.time=(lag+1)*.5;
      forearms.setEffectiveWeight(strength);mixer.update(0);
      for(const {bone,proxy,loaded}of bindings) {
        const weight=loaded?1-.7*Math.max(carried,casting):1-.92*casting;
        quaternion.identity().slerp(proxy.quaternion,weight);
        bone.quaternion.multiply(quaternion);
      }
    },
    dispose() {mixer.stopAllAction();mixer.uncacheRoot(pose);},
  };
}

// Drive arm opposition from the rendered legs, not an independent stride clock.
// This retains coordination when foot placement shortens a start or adapts a turn.
export function createUpperBodyGait(avatar,root,{reducedMotion=false,armSwing=.22}={}) {
  const joints=new Map(avatar.bones.map(bone=>[bone.name,bone]));
  const forward=new THREE.Vector3(),offset=new THREE.Vector3(),hip=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const neckRotation=new THREE.Quaternion(),neckParent=new THREE.Quaternion();
  const clips=createArmClips(avatar,armSwing);
  let phase=0,velocity=0,carried=0,casting=0,lean=0,leanVelocity=0,lag=0,strength=0,strengthVelocity=0;
  const rotate=(name,axis,angle)=>{
    const bone=joints.get(name);if(!bone)return;
    bone.quaternion.multiply(rotation.setFromAxisAngle(avatar.axes.get(bone)[axis],angle));
  };
  return {
    update(delta,speed,legs,{flying=false,carrying=false,casting:cast=false}={}) {
      let target=0,leanTarget=0,strengthTarget=0;
      if(!reducedMotion&&!flying&&legs.length===2&&Number.isFinite(speed)) {
        forward.set(0,0,1).applyQuaternion(root.getWorldQuaternion(rotation));
        const lead=leg=>leg.foot.getWorldPosition(offset).sub(leg.thigh.getWorldPosition(hip)).dot(forward);
        const left=legs.find(leg=>leg.side==='l'),right=legs.find(leg=>leg.side==='r');
        const span=(left.upperLength+left.lowerLength+right.upperLength+right.lowerLength)*.325;
        strengthTarget=THREE.MathUtils.clamp(speed/.65,0,1);
        target=THREE.MathUtils.clamp((lead(left)-lead(right))/span,-1,1)*strengthTarget;
        const swing=legs.find(leg=>leg.swing?.turning),support=legs.find(leg=>leg.contact);
        if(swing&&support&&speed<.3) {
          // Counterbalance a standing step using its actual support side. The
          // sine envelope eases in after lift-off and releases toward landing.
          forward.set(1,0,0).applyQuaternion(root.getWorldQuaternion(rotation));
          hip.copy(left.thigh.getWorldPosition(offset));hip.add(right.thigh.getWorldPosition(offset)).multiplyScalar(.5);
          const side=support.foot.getWorldPosition(offset).sub(hip).dot(forward);
          leanTarget=-THREE.MathUtils.clamp(side/.08,-1,1)*.075*Math.sin(Math.PI*swing.swing.progress)*(1-speed/.3);
        }
      }
      const dt=Number.isFinite(delta)?THREE.MathUtils.clamp(delta,0,.08):0;
      const frequency=32,decay=Math.exp(-frequency*dt),difference=phase-target,c=velocity+frequency*difference;
      phase=target+(difference+c*dt)*decay;velocity=(velocity-frequency*c*dt)*decay;
      const leanFrequency=22,leanDecay=Math.exp(-leanFrequency*dt),leanDifference=lean-leanTarget,leanC=leanVelocity+leanFrequency*leanDifference;
      lean=leanTarget+(leanDifference+leanC*dt)*leanDecay;leanVelocity=(leanVelocity-leanFrequency*leanC*dt)*leanDecay;
      carried+=((carrying?1:0)-carried)*(1-Math.exp(-12*dt));
      casting+=((cast?1:0)-casting)*(1-Math.exp(-10*dt));
      // Forearms trail the shoulder reversal; the activity weight eases the
      // flex in and out without snapping on the first or last walking frame.
      lag+=(phase-lag)*(1-Math.exp(-12*dt));
      const strengthFrequency=16,strengthDecay=Math.exp(-strengthFrequency*dt),strengthDifference=strength-strengthTarget,strengthC=strengthVelocity+strengthFrequency*strengthDifference;
      strength=strengthTarget+(strengthDifference+strengthC*dt)*strengthDecay;
      strengthVelocity=(strengthVelocity-strengthFrequency*strengthC*dt)*strengthDecay;
      clips.apply(phase,lag,strength,carried,casting);
      // A small chest counter-rotation follows the same transfer. Counter it
      // through the neck so walking alone does not sweep the gaze side to side.
      rotate('spine_01','y',-.035*phase);
      rotate('neck_01','y',.035*phase);
      if(Math.abs(lean)>1e-8) {
        // Neck and waist rest axes differ between rigs. Preserve the actual
        // world orientation rather than assuming equal local-axis rotations.
        const neck=joints.get('neck_01');neck?.getWorldQuaternion(neckRotation).normalize();
        rotate('spine_01','z',lean);
        if(neck)neck.quaternion.copy(neck.parent.getWorldQuaternion(neckParent).normalize().invert().multiply(neckRotation));
      }
    },
    dispose() {clips.dispose();},
  };
}
