import * as THREE from 'three';

// Beast movement: a beast form that chooses it carries itself like its animal.
// Standing, it settles into a low, alert crouch. Walking becomes a prowl, the
// chest carried forward over bent knees with the arms held ready, and running
// opens into a long, springy lope that rises through each swing.
//
// The legs keep their contact solve. prepare() lowers (and, in a lope, lifts)
// the pelvis before foot placement runs, so the knees fold to keep every planted
// foot where it is; apply() then poses the spine, arms and head on top of the
// ordinary arm gait. A weight eases the whole posture in and out, so turning
// beast movement on or off never snaps the body.
export const BEAST_STRIDE = .35;
const WALK = 1.65, RUN = 3.2;

export function createBeastGait(avatar,{reducedMotion=false}={}) {
  const joints=new Map(avatar.bones.map(bone=>[bone.name,bone])),rotation=new THREE.Quaternion();
  const crouch=avatar.hipHeight*.072,rise=avatar.hipHeight*.04;
  let weight=0,run=0,walk=0,bound=0;
  const ease=(value,target,rate,dt)=>value+(target-value)*(1-Math.exp(-rate*dt));
  // Rig signs: spine +x leans forward, neck and head -x lift the gaze, upper arm
  // -x swings forward and +z (left) / -z (right) away from the body, forearm -x
  // bends the elbow and hand -x curls the wrist.
  const rotate=(name,axis,angle)=>{
    const bone=joints.get(name);if(!bone||!angle)return;
    bone.quaternion.multiply(rotation.setFromAxisAngle(avatar.axes.get(bone)[axis],angle));
  };
  return {
    get weight(){return weight;},
    get active(){return weight>1e-3;},
    prepare(delta,{active=false,speed=0,legs=[]}={}) {
      const dt=Number.isFinite(delta)?THREE.MathUtils.clamp(delta,0,.08):0;
      weight=ease(weight,active?1:0,7,dt);
      // Fully released, the gait forgets its pace; the next request eases in fresh.
      if(!active&&weight<1e-3){weight=walk=run=bound=0;return {drop:0,stride:1};}
      walk=ease(walk,THREE.MathUtils.clamp(speed/1.2,0,1),8,dt);
      run=ease(run,THREE.MathUtils.clamp((speed-WALK)/(RUN-WALK),0,1),6,dt);
      // The bound follows the swing that is actually in the air, so the body
      // rises while a foot travels and settles as it lands.
      const swing=legs.find(leg=>leg.swing&&!leg.swing.settling);
      bound=ease(bound,reducedMotion||!swing?0:Math.sin(Math.PI*swing.swing.progress)*run,14,dt);
      return {drop:weight*(crouch*(1+.3*walk-.35*run)-rise*bound),stride:1+BEAST_STRIDE*run*weight};
    },
    apply() {
      if(!weight)return;
      const lean=weight*(.16+.12*walk+.2*run);
      rotate('spine_01','x',lean*.4);rotate('spine_02','x',lean*.35);rotate('spine_03','x',lean*.25);
      rotate('neck_01','x',-lean*.45);rotate('head','x',-lean*.4);
      for(const [side,away] of [['l',1],['r',-1]]){
        rotate(`upperarm_${side}`,'x',-weight*(.22+.14*walk+.16*run));
        rotate(`upperarm_${side}`,'z',away*weight*(.1+.06*run));
        rotate(`lowerarm_${side}`,'x',-weight*(.55+.25*run));
        rotate(`hand_${side}`,'x',-weight*.22);
      }
    },
  };
}
