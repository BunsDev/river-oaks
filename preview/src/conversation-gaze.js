const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

// Angles are in the character's frame: positive x looks down, positive yaw
// looks right. Limit the neck's contribution instead of twisting a whole rig.
export function createConversationGaze() {
 const pose={yaw:0,pitch:0},velocity={yaw:0,pitch:0};
 return {
  update(origin,target,heading,delta) {
   if(!Number.isFinite(delta)||delta<=0||delta>.25)return pose;
   let yaw=0,pitch=0;
   if(target&&[...origin,...target,heading].every(Number.isFinite)) {
    const dx=target[0]-origin[0],dy=target[1]-origin[1],dz=target[2]-origin[2];
    const angle=Math.atan2(dx,dz)-heading;
    yaw=clamp(Math.atan2(Math.sin(angle),Math.cos(angle)),-.85,.85);
    pitch=clamp(-Math.atan2(dy,Math.hypot(dx,dz)),-.5,.4);
   }
   const dt=Math.min(.08,delta),frequency=8,decay=Math.exp(-frequency*dt);
   for(const [axis,goal] of Object.entries({yaw,pitch})) {
    const offset=pose[axis]-goal,c=velocity[axis]+frequency*offset;
    pose[axis]=goal+(offset+c*dt)*decay;
    velocity[axis]=(velocity[axis]-frequency*c*dt)*decay;
   }
   return pose;
  },
 };
}
