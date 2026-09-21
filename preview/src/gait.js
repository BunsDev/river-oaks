// One complete left/right stride per 1.1 meters, independent of frame rate.
export function residentStride(distance,speed) {
  const strength=Number.isFinite(speed) && Number.isFinite(distance)?Math.max(0,Math.min(1,speed/1.1)):0;
  const phase=Number.isFinite(distance)?distance/1.1*Math.PI*2:0,angles={};
  for(const [side,offset] of [['l',0],['r',Math.PI]]) {
    const swing=Math.sin(phase+offset),lift=Math.max(0,-Math.cos(phase+offset));
    angles[`thigh_${side}`]=swing*0.29*strength;
    angles[`calf_${side}`]=-lift*0.42*strength;
    angles[`foot_${side}`]=(lift*0.15-swing*0.08)*strength;
    angles[`upperarm_${side}`]=-swing*0.16*strength;
  }
  return angles;
}

// Exponential easing takes the shortest arc and is independent of refresh rate.
export function turnToward(current, target, delta, responsiveness = 9.75) {
  if (![current, target, delta].every(Number.isFinite) || delta <= 0) return current;
  const arc = Math.atan2(Math.sin(target-current), Math.cos(target-current));
  return current + arc * (1-Math.exp(-responsiveness*Math.min(delta, 0.1)));
}
