import { planWorkplaceRoom, AVATAR_ENVELOPE } from './workplace-room.js';
import { facadeEdges } from './reference-facades.js';

export const OFFICE_ID = 'jevica-office';
export const OFFICE_SPEED = 2.6;
export const OFFICE_ROOM = planWorkplaceRoom();
export const OFFICE_SPAWN = [0, 1.25];
// Same north-lane lobby bay as reference-blocks.js. No tenant is replaced.
const catalogCache=new WeakMap();
export function officesFor(world) {
  if(catalogCache.has(world))return catalogCache.get(world);
  const building = world.buildings?.find(b => b.id === 'osm-way-625330785');
  const gym = world.stores?.find(s => s.name === 'Equinox' && s.building_id === building?.id);
  const edge = building && facadeEdges(building).find(e => e.facing === 'north');
  if (!edge || !gym) return [];
  const forward = -edge.o[1] * edge.u[0] + edge.o[0] * edge.u[1] > 0;
  const start = forward ? 0 : edge.length, direction = forward ? 1 : -1;
  const gymAlong = (gym.facade[0]-edge.a[0])*edge.u[0]+(gym.facade[1]-edge.a[1])*edge.u[1];
  const gymDoor = (gymAlong-start)*direction, pylon = Math.max(gymDoor+1.6,37.6);
  const left = edge.length-17.6-4.3-4.7;
  const middle = (Math.max(pylon+3.2,left-9.2)+left-2.6)/2;
  const along = start+direction*middle;
  const at = d => [edge.a[0]+edge.u[0]*along+edge.o[0]*d,edge.a[1]+edge.u[1]*along+edge.o[1]*d];
  const result=[{id:OFFICE_ID,name:'Jevica’s office',ownerName:'Jevica',floor:6,entrance:at(4.5),facade:at(0),outward:edge.o}];
  catalogCache.set(world,result);return result;
}
export function officeFree(point) {
  if (!Array.isArray(point) || point.length!==2 || !point.every(Number.isFinite)) return false;
  const [x,d]=point,r=AVATAR_ENVELOPE.turningRadius,room=OFFICE_ROOM;
  if(Math.abs(x)>room.width/2-r || d<r || d>room.depth-r)return false;
  if(room.obstacles.some(o=>Math.hypot(x-Math.max(o.x0,Math.min(x,o.x1)),d-Math.max(o.d0,Math.min(d,o.d1)))<r))return false;
  // Chairs are real collision, in addition to the plan's desks and table.
  return room.stations.every(s=>Math.hypot(x-s.seat[0],d-s.seat[1])>=r+.4);
}
export function officeSegmentFree(from,to) {
  if(!officeFree(from)||!officeFree(to))return false;
  const steps=Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/.1);
  if(steps>150)return false;
  for(let i=1;i<steps;i++)if(!officeFree(from.map((n,j)=>n+(to[j]-n)*i/steps)))return false;
  return true;
}
export function stepOffice(position,dx,dd) {
  let next=[...position];
  for(const delta of [[dx,0],[0,dd]]){const p=next.map((v,i)=>v+delta[i]);if(officeSegmentFree(next,p))next=p;}
  return next;
}
// Seconds: walk into the car, close, ride, open, step into the office.
export function elevatorFrame(seconds,{reducedMotion=false}={}) {
  const t=Math.max(0,seconds),ease=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
  if(reducedMotion||t>=8)return {phase:'office',position:[...OFFICE_SPAWN],doors:1,floor:6,done:true};
  if(t<2)return {phase:'boarding',position:[0,-5+3.8*ease(t/2)],doors:1,floor:1};
  if(t<3)return {phase:'closing',position:[0,-1.2],doors:1-ease(t-2),floor:1};
  if(t<5.5)return {phase:'ascending',position:[0,-1.2],doors:0,floor:1+Math.floor(5*(t-3)/2.5)};
  if(t<6.5)return {phase:'opening',position:[0,-1.2],doors:ease(t-5.5),floor:6};
  return {phase:'arriving',position:[0,-1.2+2.45*ease((t-6.5)/1.5)],doors:1,floor:6};
}
