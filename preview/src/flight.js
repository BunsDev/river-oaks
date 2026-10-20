const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
// Jevica's bubble, horizontal m/s: cruising, and held fast (Shift). The fast speed doubled from 7 (Val, 2026-10-19);
// the server's pose budget (server/world.js) and Jev's flying companion (prince-flight.js) follow it.
export const FLIGHT_SPEED = Object.freeze({ cruise: 4.5, fast: 14 });
export function createFlightState() { return { active:false, altitude:0, target:0, verticalSpeed:0, landing:false }; }
// Keep every unacknowledged flight endpoint: the server can still be sweeping
// from any one of them. Receipts use identity, not ambiguous position equality.
const samePoint=(a,b)=>a.every((value,i)=>Math.abs(value-b[i])<1e-6);
export function recordFlightPose(flight,pose) {
  const point=[pose.position[0],pose.position[2],pose.altitude];
  const pending=flight.submitted??(flight.submitted=[]);
  if(!pending.length||!samePoint(pending.at(-1),point))pending.push(point);
  return pending.at(-1);
}
export function acknowledgeFlightPose(flight,player,receipt) {
  const point=[player.position[0],-player.position[1],player.altitude];
  if(!receipt){flight.acknowledged??=point;return;}
  const pending=flight.submitted??[],index=pending.indexOf(receipt);
  if(index<0)return; // A later acknowledgment or an authoritative reset won.
  flight.submitted=pending.slice(index+1);flight.acknowledged=point;
}
export function beginFlight(state,environment,flight) {
  const [x,,z]=state.position;
  const clear=environment.canFly??((x,_height,z)=>environment.isFree(x,z));
  if(flight.active||environment.roomAt?.(x,z)||!clear(x,environment.groundAt(x,z)+.04,z))return false;
  Object.assign(flight,{active:true,target:3.5,landing:false});
  return true;
}
export function stepFlight(state, environment, flight, input, delta) {
  if (!Number.isFinite(delta) || delta <= 0 || !flight.active) return;
  // Do not grow an unbounded path while the server stops acknowledging poses.
  if((flight.submitted?.length??0)>=8){state.velocity=[0,0];state.speed=0;return;}
  const dt=Math.min(delta,0.08);
  const limit=environment.flightCeiling??32;
  if(!flight.landing) flight.target=clamp(flight.target+(input.lift ?? 0)*4*dt,1,limit);
  const difference=flight.target-flight.altitude, desired=Math.sign(difference)*Math.min(3,Math.sqrt(6*Math.abs(difference)));
  flight.verticalSpeed+=clamp(desired-flight.verticalSpeed,-3*dt,3*dt);
  const oldAltitude=flight.altitude;
  flight.altitude=clamp(flight.altitude+flight.verticalSpeed*dt,0,Math.max(limit,oldAltitude));
  if(Math.sign(flight.target-oldAltitude)!==Math.sign(flight.target-flight.altitude)) {flight.altitude=flight.target;flight.verticalSpeed=0;}
  state.yaw+=clamp(input.turn ?? 0,-1,1)*1.35*dt;
  const forward=clamp(input.forward ?? 0,-1,1),strafe=clamp(input.strafe ?? 0,-1,1),norm=Math.max(1,Math.hypot(forward,strafe)),speed=input.fast?FLIGHT_SPEED.fast:FLIGHT_SPEED.cruise;
  const vx=(-Math.sin(state.yaw)*forward+Math.cos(state.yaw)*strafe)*speed/norm,vz=(-Math.cos(state.yaw)*forward-Math.sin(state.yaw)*strafe)*speed/norm;
  state.velocity[0]+=(vx-state.velocity[0])*(1-Math.exp(-3.5*dt));state.velocity[1]+=(vz-state.velocity[1])*(1-Math.exp(-3.5*dt));
  const [x,,z]=state.position,px=x+state.velocity[0]*dt,pz=z+state.velocity[1]*dt;
  const clear=environment.canFly ?? ((east,up,south)=>environment.isFree(east,south));
  // Resolve a blocked descent first, so touching a roof cannot cancel escape
  // across it at the last valid height.
  if(!clear(x,environment.groundAt(x,z)+flight.altitude,z)) {flight.altitude=oldAltitude;flight.verticalSpeed=0;}
  // Match the authoritative pose sweep: clear endpoints alone can cut through
  // a roof corner while rising. At the bounded flight speeds/dt this stays small.
  const sweepClear=(east,south,candidateAltitude)=>{
    const origins=[[x,z,oldAltitude],...(flight.acknowledged?[flight.acknowledged]:[]),...(flight.submitted??[])];
    for(const [fromX,fromZ,fromAltitude] of origins) {
      const distance=Math.hypot(east-fromX,south-fromZ);
      if(distance>32||Math.abs(candidateAltitude-fromAltitude)>32)return false;
      const steps=Math.max(1,Math.ceil(distance/.15),Math.ceil(Math.abs(candidateAltitude-fromAltitude)/.15));
      for(let i=1;i<=steps;i++) {
        const t=i/steps,ex=fromX+(east-fromX)*t,sz=fromZ+(south-fromZ)*t;
        const altitude=fromAltitude+(candidateAltitude-fromAltitude)*t;
        if(altitude<=.1?!environment.isFree(ex,sz):!clear(ex,environment.groundAt(ex,sz)+altitude,sz))return false;
      }
    }
    return true;
  };
  let nextAltitude=flight.altitude,nextX=x,nextZ=z;
  const canMove=(east,south)=>{
    if(sweepClear(east,south,flight.altitude)){nextAltitude=flight.altitude;nextX=east;nextZ=south;return true;}
    // Ground-relative altitude can push a horizontal move down into a roof.
    // Preserve world height only when needed; this never lifts over a wall.
    // On steep ground, shorten the move to retain the normal 3m/s lift budget.
    for(let scale=1;scale>=1/128;scale/=2){
      const ex=x+(east-x)*scale,sz=z+(south-z)*scale;
      const levelAltitude=environment.groundAt(x,z)+flight.altitude-environment.groundAt(ex,sz);
      if(levelAltitude<=flight.altitude)break;
      if(Math.abs(levelAltitude-oldAltitude)<=3*dt+1e-8&&levelAltitude<=Math.max(limit,oldAltitude)&&sweepClear(ex,sz,levelAltitude)){
        nextAltitude=levelAltitude;nextX=ex;nextZ=sz;return true;
      }
    }
    return false;
  };
  if(!canMove(x,z)){flight.altitude=oldAltitude;nextAltitude=oldAltitude;flight.verticalSpeed=0;}
  if(canMove(px,pz)) {state.position[0]=nextX;state.position[2]=nextZ;}
  else {
    const normal=environment.flightWallNormal?.(px,environment.groundAt(px,pz)+flight.altitude,pz,x,z);
    const inward=normal?Math.min(0,state.velocity[0]*normal[0]+state.velocity[1]*normal[1]):0;
    const sx=normal?state.velocity[0]-inward*normal[0]:0,sz=normal?state.velocity[1]-inward*normal[1]:0;
    if(normal&&inward<0&&canMove(x+sx*dt,z+sz*dt)) {
      state.position[0]=nextX;state.position[2]=nextZ;
      state.velocity=[sx,sz];
    } else {
      // Bounds and non-building obstacles retain axis sliding, with each final
      // segment checked from the original position against the server sweep.
      if(canMove(px,z)){state.position[0]=nextX;state.position[2]=nextZ;}else state.velocity[0]=0;
      if(canMove(state.position[0],pz)){state.position[0]=nextX;state.position[2]=nextZ;}else state.velocity[1]=0;
    }
  }
  flight.altitude=nextAltitude;
  state.speed=Math.hypot(state.position[0]-x,state.position[2]-z)/dt;
  state.distance+=state.speed*dt;
  state.position[1]=environment.groundAt(state.position[0],state.position[2])+1.68+flight.altitude;
  if(flight.landing && flight.altitude<0.04 && environment.isFree(state.position[0],state.position[2])) {Object.assign(flight,createFlightState());state.position[1]=environment.groundAt(state.position[0],state.position[2])+1.68;}
}
