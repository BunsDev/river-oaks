// Bearing inertia belongs to the decorative centers; tyre rolling/contact
// remains owned by carriage motion. Angles are independent of wheel rotation.
export function createWheelSpinners(radii,{reducedMotion=false}={}) {
  const state=radii.map(()=>({angle:0,velocity:0}));
  return {
    update(delta,speed) {
      if(reducedMotion||!Number.isFinite(delta)||delta<=0||!Number.isFinite(speed))return;
      const dt=Math.min(delta,.08),moving=Math.abs(speed)>.05;
      state.forEach((s,i)=>{
        const target=moving?speed/radii[i]:0,rate=moving?2.8:.8;
        const decay=Math.exp(-rate*dt),previous=s.velocity;
        s.velocity=target+(previous-target)*decay;
        s.angle+=target*dt+(previous-target)*(1-decay)/rate;
        if(!moving&&Math.abs(s.velocity)<.001)s.velocity=0;
      });
    },
    offset(index,wheelAngle){return reducedMotion?0:state[index].angle-wheelAngle;},
    inspect(){return state.map(s=>({...s}));},
    reset(){state.forEach(s=>{s.angle=s.velocity=0;});},
  };
}
