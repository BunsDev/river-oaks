import { createWalkingEnvironment } from './walking.js';
import { createPedestrianNetwork } from './pedestrian-network.js';

export const CARRIAGE_SCALE=.78;

const HALF_LENGTH=3.12,HALF_WIDTH=1.36,HEIGHT=3.7,TEAM_HALF_WIDTH=2.9;
const halfWidth=(team,x)=>team&&x< -3.12?TEAM_HALF_WIDTH:HALF_WIDTH;
function localPoint(placement,x,z) {
  const dx=x-placement.position[0],dz=z-placement.position[2],c=Math.cos(placement.yaw),s=Math.sin(placement.yaw);
  return [dx*c-dz*s,dx*s+dz*c];
}
export function carriageContains(placement,x,y,z,radius=0) {
  if(!placement)return false;
  const [a,b]=localPoint(placement,x,z),scale=placement.scale??1;
  return a>-(placement.team?8:HALF_LENGTH)*scale-radius && a<HALF_LENGTH*scale+radius && Math.abs(b)<halfWidth(placement.team,a/scale)*scale+radius
    && y+radius>placement.position[1]-.15 && y-radius<placement.position[1]+(a< -3.12*scale?3.2:Math.abs(a)>1.65*scale?2:HEIGHT)*scale;
}
export function carriageFootprint(placement) {
  const points=[],c=Math.cos(placement.yaw),s=Math.sin(placement.yaw),scale=placement.scale??1;
  const front=placement.team?8:HALF_LENGTH,steps=Math.ceil((front+HALF_LENGTH)/.38);
  for(let i=0;i<=steps;i++)for(let j=0;j<=8;j++){
    const localX=-front+i*(front+HALF_LENGTH)/steps,width=halfWidth(placement.team,localX);
    const x=localX*scale,z=(-width+j*width/4)*scale;
    points.push([placement.position[0]+x*c+z*s,placement.position[2]-x*s+z*c]);
  }
  return points;
}
export function findCarriageParking(world,pose,people=[],scale=1,team=false) {
  if(!world||!pose||pose.roomId||pose.flying||pose.altitude>0.05)return null;
  const environment=createWalkingEnvironment(world),network=createPedestrianNetwork(world),candidates=[];
  const [vx,,vz]=pose.position;
  for(const road of world.roads??[]) {
    if(road.width_m<5)continue;
    for(let i=1;i<road.points.length;i++) {
      const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dn=b[1]-a[1],length=Math.hypot(dx,dn);
      if(length<1)continue;
      const ux=dx/length,un=dn/length,nearest=(vx-a[0])*ux+(-vz-a[1])*un;
      for(const shift of [0,-3,3,-6,6,-9,9,-12,12,-18,18])for(const side of [-1,1]) {
        const t=Math.max(0,Math.min(length,nearest+shift)),offset=side*(road.width_m/2-(team?TEAM_HALF_WIDTH:HALF_WIDTH)*scale-.45);
        const x=a[0]+ux*t-un*offset,z=-(a[1]+un*t+ux*offset),distance=Math.hypot(x-vx,z-vz);
        if(distance>25||distance<3)continue;
        candidates.push({position:[x,environment.groundAt(x,z),z],yaw:Math.atan2(un,ux),pitch:0,roll:0,distance,scale,team});
      }
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  for(const placement of candidates) {
    if(carriageContains(placement,vx,placement.position[1]+1,vz,1))continue;
    if(people.some(p=>!p.indoor&&!p.vehicleRole&&!p.abducted&&carriageContains(placement,p.position[0],placement.position[1]+1,-p.position[1],1.1)))continue;
    if((world.vegetation?.branch_supports??[]).some(tree=>carriageContains(placement,tree.position[0],placement.position[1]+1,-tree.position[1],.6)))continue;
    const points=carriageFootprint(placement);
    if(points.some(([x,z])=>!environment.isFree(x,z)||environment.roomAt(x,z)||network.classify([x,-z])!=='road'))continue;
    const [x,y,z]=placement.position,c=Math.cos(placement.yaw),s=Math.sin(placement.yaw);
    const sx=(environment.groundAt(x+c*2,z-s*2)-environment.groundAt(x-c*2,z+s*2))/4;
    const sz=(environment.groundAt(x+s,z+c)-environment.groundAt(x-s,z-c))/2;
    placement.pitch=-Math.atan(sz);placement.roll=Math.atan(sx);
    if(Math.abs(placement.pitch)>.08||Math.abs(placement.roll)>.08)continue;
    placement.terrainError=Math.max(...points.map(([px,pz])=>{const [a,b]=localPoint(placement,px,pz);return Math.abs(environment.groundAt(px,pz)-(y+a*sx+b*sz));}));
    if(placement.terrainError>.035)continue;
    return placement;
  }
  return null;
}
