const joints=['head','spine_03','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r','hand_l','hand_r'];
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
  const wave={upperarm_r:[-1.05,0,-.2],lowerarm_r:[0,0,1.25]};
  // Watering: lean in, look down at the planter, right arm forward with the
  // can tipped, and a slow pour that sways the wrist.
  const water={spine_03:[.16,0,0],head:[.22,0,0],upperarm_r:[-.78,0,-.08],lowerarm_r:[0,0,.32],hand_r:[.42,0,0]};
  let suspended=false;
  return {
    suspend(){suspended=true;},
    update(action,delta,time=0) {
      if(reducedMotion || !Number.isFinite(delta) || delta<0)return pose;
      // A visible slow frame still needs to animate. Explicit suspension keeps
      // a culled avatar from catching up across its hidden interval.
      if(suspended){suspended=false;return pose;}
      greeting.lowerarm_r[2]=-0.32+Math.sin(time*2)*0.025;
      wave.lowerarm_r[2]=1.25+Math.sin(time*9)*.16;
      water.hand_r[0]=.42+Math.sin(time*2.6)*.08;
      const target=action==='force'?force:action==='acknowledge'?acknowledgement:action==='startled'?startled:action==='amazed'||action==='enchanted'?surprised:action==='greet'?greeting:action==='wave'?wave:action==='bow'?bow:action==='water'?water:{};
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
