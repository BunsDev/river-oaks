// Scene coordinates, metres and seconds. One upright body under a controlled
// lift, a mass-dependent impulse, or a damped descent. Small swept substeps keep
// a slow rendered frame from skipping collision checks.
export function createForceBody(position,mass=75,lift=1.2) {
  return {position:[...position],velocity:[0,0,0],mass:Math.max(1,mass),lift,mode:'lift',blocked:false};
}
export function createForceAnchor(position,pose) {
  return {offset:[position[0]-pose.position[0],position[2]-pose.position[2]],yaw:pose.yaw};
}
export function forceAnchorPosition(anchor,pose) {
  const angle=pose.yaw-anchor.yaw,c=Math.cos(angle),s=Math.sin(angle),[x,z]=anchor.offset;
  return [pose.position[0]+x*c+z*s,pose.position[2]+z*c-x*s];
}
export function pushForceBody(body,direction) {
  const length=Math.hypot(...direction);if(!Number.isFinite(length)||length<1e-6)return false;
  const speed=Math.min(4.5,150/body.mass);
  body.velocity[0]=direction[0]/length*speed;body.velocity[2]=direction[1]/length*speed;
  body.mode='push';return true;
}
export function releaseForceBody(body) {if(body.mode!=='landed')body.mode='lower';}
export function stepForceBody(body,delta,{groundAt,canMove,anchor=null}) {
  if(!Number.isFinite(delta)||delta<=0||body.mode==='landed')return;
  body.blocked=false;
  const count=Math.ceil(Math.min(delta,.08)*120),dt=Math.min(delta,.08)/count;
  for(let step=0;step<count;step++) {
    const p=body.position,v=body.velocity,ground=groundAt(p[0],p[2]);
    if(body.mode==='push')v[1]-=9.81*dt;
    else {
      const frequency=body.mode==='lift'?Math.max(5,10/Math.sqrt(body.mass/20)):8;
      const target=ground+(body.mode==='lift'?body.lift:0);
      v[1]+=((target-p[1])*frequency**2-2*frequency*v[1])*dt;
      v[1]=Math.max(-2.2,Math.min(2.2,v[1]));
    }
    if(body.mode==='lift'&&anchor) {
      const frequency=Math.max(4,6/Math.sqrt(body.mass/20));
      let ax=(anchor[0]-p[0])*frequency**2-2*frequency*v[0],az=(anchor[1]-p[2])*frequency**2-2*frequency*v[2];
      const acceleration=Math.hypot(ax,az),limit=Math.min(1,8/Math.max(acceleration,1e-9));
      ax*=limit;az*=limit;v[0]+=ax*dt;v[2]+=az*dt;
      const speed=Math.hypot(v[0],v[2]);if(speed>4){v[0]*=4/speed;v[2]*=4/speed;}
    }else {
      const drag=body.mode==='push'?(p[1]>ground+.02?.45:5):8;
      v[0]*=Math.exp(-drag*dt);v[2]*=Math.exp(-drag*dt);
    }
    const next=[p[0]+v[0]*dt,p[1]+v[1]*dt,p[2]+v[2]*dt];
    const nextGround=groundAt(next[0],next[2]);
    if((Math.abs(next[0]-p[0])+Math.abs(next[2]-p[2])>1e-9)&&(!canMove(p,next)||nextGround>p[1]+.3)) {
      body.blocked=true;
      // Keep the free axis moving along a wall instead of sticking or vibrating.
      const xOnly=[next[0],next[1],p[2]],zOnly=[p[0],next[1],next[2]];
      if(canMove(p,xOnly)&&groundAt(xOnly[0],xOnly[2])<=p[1]+.3){next[2]=p[2];v[2]=0;}
      else if(canMove(p,zOnly)&&groundAt(zOnly[0],zOnly[2])<=p[1]+.3){next[0]=p[0];v[0]=0;}
      else {next[0]=p[0];next[2]=p[2];v[0]=v[2]=0;}
    }
    const floor=groundAt(next[0],next[2]);
    if(next[1]<floor){next[1]=floor;v[1]=Math.max(0,v[1]);}
    p.splice(0,3,...next);
    if(body.mode!=='lift'&&p[1]-floor<.002&&Math.hypot(...v)<.06) {
      p[1]=floor;v.fill(0);body.mode='landed';break;
    }
  }
}
