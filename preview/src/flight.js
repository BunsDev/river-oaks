const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function createFlightState() { return { active:false, altitude:0, target:0, verticalSpeed:0, landing:false }; }
export function beginFlight(state,environment,flight) {
  const [x,,z]=state.position;
  const clear=environment.canFly??((x,_height,z)=>environment.isFree(x,z));
  if(flight.active||environment.roomAt?.(x,z)||!clear(x,environment.groundAt(x,z)+.04,z))return false;
  Object.assign(flight,{active:true,target:3.5,landing:false});
  return true;
}
export function stepFlight(state, environment, flight, input, delta) {
  if (!Number.isFinite(delta) || delta <= 0 || !flight.active) return;
  const dt=Math.min(delta,0.08);
  if(!flight.landing) flight.target=clamp(flight.target+(input.lift ?? 0)*4*dt,1,32);
  const difference=flight.target-flight.altitude, desired=Math.sign(difference)*Math.min(3,Math.sqrt(6*Math.abs(difference)));
  flight.verticalSpeed+=clamp(desired-flight.verticalSpeed,-3*dt,3*dt);
  const oldAltitude=flight.altitude;
  flight.altitude=clamp(flight.altitude+flight.verticalSpeed*dt,0,32);
  if(Math.sign(flight.target-oldAltitude)!==Math.sign(flight.target-flight.altitude)) {flight.altitude=flight.target;flight.verticalSpeed=0;}
  state.yaw+=clamp(input.turn ?? 0,-1,1)*1.35*dt;
  const forward=clamp(input.forward ?? 0,-1,1),strafe=clamp(input.strafe ?? 0,-1,1),norm=Math.max(1,Math.hypot(forward,strafe)),speed=input.fast?7:4.5;
  const vx=(-Math.sin(state.yaw)*forward+Math.cos(state.yaw)*strafe)*speed/norm,vz=(-Math.cos(state.yaw)*forward-Math.sin(state.yaw)*strafe)*speed/norm;
  state.velocity[0]+=(vx-state.velocity[0])*(1-Math.exp(-3.5*dt));state.velocity[1]+=(vz-state.velocity[1])*(1-Math.exp(-3.5*dt));
  const [x,,z]=state.position,px=x+state.velocity[0]*dt,pz=z+state.velocity[1]*dt;
  const clear=environment.canFly ?? ((east,up,south)=>environment.isFree(east,south));
  const ground=environment.groundAt(px,pz),height=ground+flight.altitude;
  if(clear(px,height,pz)) {state.position[0]=px;state.position[2]=pz;state.speed=Math.hypot(px-x,pz-z)/dt;state.distance+=state.speed*dt;}
  else {state.velocity=[0,0];state.speed=0;}
  if(!clear(state.position[0],environment.groundAt(state.position[0],state.position[2])+flight.altitude,state.position[2])) {flight.altitude=oldAltitude;flight.verticalSpeed=0;}
  state.position[1]=environment.groundAt(state.position[0],state.position[2])+1.68+flight.altitude;
  if(flight.landing && flight.altitude<0.04 && environment.isFree(state.position[0],state.position[2])) {Object.assign(flight,createFlightState());state.position[1]=environment.groundAt(state.position[0],state.position[2])+1.68;}
}
