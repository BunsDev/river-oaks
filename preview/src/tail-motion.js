import * as THREE from 'three';

// Tail carriage for the anthropomorphic looks. An idle tail swishes slowly on
// the wall clock. In beast movement it lifts to stream behind the body as speed
// builds, wags faster, and swings against a turn like a counterweight.
export function createTailMotion({sway=.16,pitch=.08}={}) {
  let previous=null,lift=0,swing=0,wag=0,wagPhase=0;
  const ease=(value,target,rate,dt)=>value+(target-value)*(1-Math.exp(-rate*dt));
  return {
    pose(now,{reducedMotion=false,motion=null}={}) {
      const dt=previous===null?0:THREE.MathUtils.clamp((now-previous)/1000,0,.08);previous=now;
      if(reducedMotion){lift=swing=wag=0;return {yaw:0,pitch:0};}
      const beast=Boolean(motion?.beast),run=beast?THREE.MathUtils.clamp((motion.speed??0)/3.2,0,1):0;
      lift=ease(lift,beast?.16+.34*run:0,6,dt);
      swing=ease(swing,beast?THREE.MathUtils.clamp(-(motion.turn??0)*.14,-.4,.4):0,5,dt);
      wag=ease(wag,beast?.05+.07*run:0,4,dt);
      wagPhase+=dt*(5+7*run);
      return {yaw:Math.sin(now*.0015)*sway*(1-.5*run)+Math.sin(wagPhase)*wag+swing,pitch:Math.sin(now*.0011+.8)*pitch+lift};
    },
  };
}
