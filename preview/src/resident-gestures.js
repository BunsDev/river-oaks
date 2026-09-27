const joints=['head','spine_03','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r','hand_l'];
const surprised={head:[0.04,0,0],upperarm_l:[-0.25,0,0],upperarm_r:[-0.7,0,0],lowerarm_l:[0,0,0.7],lowerarm_r:[0,0,1.35]};
const startled={...surprised,head:[-0.1,0,0],upperarm_l:[-0.7,0,0],lowerarm_l:[0,0,1.35]};
const acknowledgement={head:[0.075,0,0]};
const force={head:[-.02,0,0],upperarm_l:[-1.15,0,0],lowerarm_l:[-.28,0,0],hand_l:[.3,0,0]};
// A courtly bow: hand to heart, chest and head inclined.
const bow={spine_03:[.34,0,0],head:[.16,0,0],upperarm_r:[-.5,0,0],lowerarm_r:[0,0,1.45]};
const empty=[0,0,0];

// Preserve angular velocity when a reaction is interrupted. The exact critically
// damped response avoids a pose jump, a velocity reset, and refresh-rate-dependent
// easing. This affects gestures only; grounded locomotion retains its own solver.
export function createResidentGestures({reducedMotion=false}={}) {
  const pose=Object.fromEntries(joints.map(name=>[name,[0,0,0]]));
  const velocities=Object.fromEntries(joints.map(name=>[name,[0,0,0]]));
  const greeting={lowerarm_r:[0,0,0]};
  return {
    update(action,delta,time=0) {
      // Culling suspends avatar updates. Resume from the last displayed pose;
      // do not spend hidden time as a large first-visible catch-up step.
      if(reducedMotion||delta>0.25)return pose;
      greeting.lowerarm_r[2]=-0.32+Math.sin(time*2)*0.025;
      const target=action==='force'?force:action==='acknowledge'?acknowledgement:action==='startled'?startled:action==='amazed'||action==='enchanted'?surprised:action==='greet'?greeting:action==='bow'?bow:{};
      const dt=Number.isFinite(delta)?Math.max(0,Math.min(0.08,delta)):0;
      const frequency=10,decay=Math.exp(-frequency*dt);
      for(const name of joints)for(let axis=0;axis<3;axis++){
        const goal=(target[name]??empty)[axis],offset=pose[name][axis]-goal;
        const c=velocities[name][axis]+frequency*offset;
        pose[name][axis]=goal+(offset+c*dt)*decay;
        velocities[name][axis]=(velocities[name][axis]-frequency*c*dt)*decay;
      }
      return pose;
    },
  };
}
