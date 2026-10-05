// Local +Z is the front of the authored furniture. Walking yaw faces -Z;
// avatar heading faces +Z. Only stable build/slot IDs enter checkpoints.
export const SEAT_REACH=3.6;
export const seatSlots=kind=>kind==='seat'?[0,1]:kind==='armchair'?[0]:[];
export const seatYaw=yaw=>Math.atan2(Math.sin(yaw),Math.cos(yaw));
export function resolveSeat(build,slot) {
  if(!build || !Number.isInteger(slot) || !seatSlots(build.kind).includes(slot))return null;
  const x=build.kind==='seat'?(slot===0?-.32:.32):0,z=build.kind==='armchair'?.07:0;
  const c=Math.cos(build.yaw),s=Math.sin(build.yaw);
  return {buildId:build.id,slot,height:build.kind==='seat'?.705:.595,yaw:seatYaw(build.yaw),
    position:[build.position[0]+c*x+s*z,build.position[1]+s*x-c*z,build.ground]};
}
