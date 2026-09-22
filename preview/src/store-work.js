const smooth = value => {const t=Math.max(0,Math.min(1,value));return t*t*t*(t*(t*6-15)+10);};
const routines = {
  fashion:'inspect', leather:'inspect', jewelry:'inspect', perfumery:'inspect', optician:'inspect',
  gallery:'present', dining:'serve', gelato:'prepare', cinema:'present', salon:'prepare', wellness:'present',
};

// A reach, a short deliberate task and a return. Feet and pelvis remain at the
// authored station; conversation interrupts work without sliding the worker.
export function staffWorkPose(theme, seconds) {
  const phase=((seconds%12)+12)%12;
  const reach=smooth((phase-1)/2)*(1-smooth((phase-8)/2));
  const task=smooth((phase-3)/1.5)*(1-smooth((phase-7)/1.5));
  const motion=Math.sin((phase-3)*2.1)*task;
  const kind=routines[theme] ?? 'inspect';
  const pose={head:[0.18*reach,0.08*motion,0],spine_03:[0.035*reach,0,0]};
  if(kind==='present')Object.assign(pose,{upperarm_r:[-0.35*reach,0.1*reach,0],lowerarm_r:[0,0,0.8*reach],hand_r:[0,0.14*motion,0]});
  else {
    const height=kind==='serve'?0.35:kind==='prepare'?0.57:0.4;
    for(const [side,sign] of [['l',-1],['r',1]]) {
      pose[`upperarm_${side}`]=[-height*reach + (kind==='prepare'?sign*motion*0.045:0),sign*0.1*reach,0];
      pose[`lowerarm_${side}`]=[0,sign*0.15*reach,(0.8+(kind==='inspect'?0.2:0))*reach];
      pose[`hand_${side}`]=[0.05*motion,sign*0.1*motion,0];
    }
  }
  return pose;
}

export function blendStationPose(base, work, attention, yaw = 0) {
  const result={...base,...work};
  const greeting={head:[-0.02,Math.max(-0.85,Math.min(0.85,yaw)),0],spine_03:[0,Math.max(-0.15,Math.min(0.15,yaw*0.2)),0],upperarm_r:[-0.3,0,0],lowerarm_r:[0,0,0.85]};
  // Return the other working arm to rest while looking at the visitor.
  for(const name of Object.keys(work)) if(!greeting[name])greeting[name]=base[name] ?? [0,0,0];
  const weight=Math.max(0,Math.min(1,attention));
  for(const [name,target] of Object.entries(greeting))result[name]=target.map((angle,i)=>(result[name]?.[i]??0)*(1-weight)+angle*weight);
  return result;
}
