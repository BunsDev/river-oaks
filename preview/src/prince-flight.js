// Physical flight companion: bounded acceleration, swept clearance and gentle landing.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const HOVER_LEAN=.18,GLIDE_PITCH=1.28;
// 0 while hovering, 1 in a horizontal glide: drives the body pose between them.
export const glideAmount=pitch=>clamp((pitch-HOVER_LEAN)/(GLIDE_PITCH-HOVER_LEAN),0,1);
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function createPrinceFlight(position,heading=0) {
  return {position:[...position],velocity:[0,0,0],acceleration:[0,0,0],avoidAge:0,avoidance:null,heading,pitch:0,bank:0,blend:0,landed:false,blocked:false};
}
export function flightSlot(pose,heading,side=1) {
  // Clear Jevica's bubble and leave her forward view open.
  return [pose.position[0]+clamp(pose.velocity?.[0]??0,-7,7)*.35+Math.cos(heading)*4.8*side-Math.sin(heading)*.6,
    pose.position[1]-1.68+.35,pose.position[2]+clamp(pose.velocity?.[1]??0,-7,7)*.35-Math.sin(heading)*4.8*side-Math.cos(heading)*.6];
}
export function stepPrinceFlight(state,target,environment,delta,{landing=false,playerSpeed=0}={}) {
  if(!Number.isFinite(delta)||delta<=0)return state;
  const dt=Math.min(.08,delta),ground=environment.groundAt(state.position[0],state.position[2]);
  const destination=[...target];destination[1]=Math.max(environment.groundAt(target[0],target[2]),destination[1]);
  // A short prediction absorbs her turn without chasing the position she just left.
  const difference=destination.map((v,i)=>v-state.position[i]),gap=Math.hypot(...difference);
  const maxSpeed=landing?4:Math.min(10,Math.max(5,playerSpeed+2));
  const speed=Math.min(maxSpeed,Math.sqrt(2*8*gap),gap*2.4);
  let desired=difference.map(v=>gap>.001?v/gap*speed:0);
  state.avoidAge-=dt;
  if(state.avoidAge<=0&&gap>.6) {
    state.avoidAge=.12;state.avoidance=null;
    const horizon=Math.min(gap,Math.max(1.2,Math.min(5,speed*.85)));
    const direction=desired.map(v=>v/(speed||1));
    const clearDirection=dir=>{
      const steps=Math.ceil(horizon/.22);
      for(let i=1;i<=steps;i++){
        const p=state.position.map((v,k)=>v+dir[k]*horizon*i/steps);
        if(!environment.canFly(p[0],p[1],p[2]))return false;
      }return true;
    };
    if(!clearDirection(direction)) {
      let best=-Infinity;
      for(const turn of [0,-.55,.55,-1.05,1.05])for(const lift of [.5,0,1]) {
        const c=Math.cos(turn),s=Math.sin(turn),candidate=[direction[0]*c+direction[2]*s,Math.max(direction[1],lift),direction[2]*c-direction[0]*s];
        const length=Math.hypot(...candidate);if(!length)continue;
        const unit=candidate.map(v=>v/length),score=unit.reduce((n,v,i)=>n+v*direction[i],0)+lift*.08;
        if(score>best&&clearDirection(unit)){best=score;state.avoidance=unit;}
      }
      state.avoidance??=[0,1,0];
    }
  }
  if(state.avoidance&&gap>.6)desired=state.avoidance.map(v=>v*Math.min(speed,5));
  const change=desired.map((v,i)=>(v-state.velocity[i])*4),magnitude=Math.hypot(...change);
  const wanted=change.map(v=>v*Math.min(1,8/(magnitude||1)));
  const jerk=wanted.map((v,i)=>v-state.acceleration[i]),jerkLength=Math.hypot(...jerk);
  state.acceleration=state.acceleration.map((v,i)=>v+jerk[i]*Math.min(1,32*dt/(jerkLength||1)));
  state.velocity=state.velocity.map((v,i)=>v+state.acceleration[i]*dt);
  const next=state.position.map((v,i)=>v+state.velocity[i]*dt);
  next[1]=Math.max(environment.groundAt(next[0],next[2]),next[1]);
  const clear=point=>environment.canFly(point[0],point[1],point[2]);
  const travel=Math.hypot(...next.map((v,i)=>v-state.position[i])),steps=Math.max(1,Math.ceil(travel/.1));
  state.blocked=false;
  for(let i=1;i<=steps;i++)if(!clear(next.map((v,k)=>state.position[k]+(v-state.position[k])*i/steps))){state.blocked=true;break;}
  if(!state.blocked)state.position=next;
  else {
    // Rise over roofs rather than moving through them. Never raise through an overhang.
    const rise=[state.position[0],state.position[1]+Math.min(2,Math.max(.6,Math.abs(state.velocity[1])))*dt,state.position[2]];
    if(gap>.6&&rise[1]-ground<(environment.flightCeiling??32)&&clear(rise))state.position=rise;
    state.velocity=state.velocity.map(v=>v*Math.exp(-12*dt));
  }
  const horizontal=Math.hypot(state.velocity[0],state.velocity[2]);
  const heading=horizontal>.15?Math.atan2(state.velocity[0],state.velocity[2]):state.heading;
  const turn=angle(state.heading,heading);
  state.heading+=clamp(turn*(1-Math.exp(-5*dt)),-2.8*dt,2.8*dt);
  const altitude=state.position[1]-environment.groundAt(state.position[0],state.position[2]);
  const targetBlend=landing?clamp(altitude/1.1,0,1):clamp(altitude/.8,0,1);
  state.blend+=(targetBlend-state.blend)*(1-Math.exp(-5*dt));
  // Hovering leans about 10° into the wind rather than standing bolt upright;
  // speed tips the body toward a horizontal glide.
  state.pitch+=((HOVER_LEAN+clamp(horizontal/4,0,1)*(GLIDE_PITCH-HOVER_LEAN))*state.blend-state.pitch)*(1-Math.exp(-4*dt));
  state.bank+=(clamp(-turn*.3,-.22,.22)*state.blend-state.bank)*(1-Math.exp(-4*dt));
  state.landed=landing&&gap<.08&&altitude<.05&&horizontal<.2&&environment.isFree(state.position[0],state.position[2]);
  if(state.landed){state.position[1]=environment.groundAt(state.position[0],state.position[2]);state.velocity=[0,0,0];}
  return state;
}
