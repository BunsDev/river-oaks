const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*t*(t*(t*6-15)+10);};

// The load settles before hands withdraw. Re-grasp finishes before liftoff.
// Sampling the authoritative work clock preserves pauses and culling exactly.
export function workerLoadCycle(time,docked) {
  const phase=((time%12)+12)%12;
  const lift=smooth((phase-2)/2)*(1-smooth((phase-8)/2));
  const grip=docked?smooth(phase/2)*(1-smooth((phase-10)/2)):1;
  return {lift,grip,release:1-grip};
}
