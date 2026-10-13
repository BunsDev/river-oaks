import { planWorkplaceRoom, AVATAR_ENVELOPE } from './workplace-room.js';
import { facadeEdges } from './reference-facades.js';
import { officeLobbySpan, officeLobbyFloor, ARRIVAL } from './office-arrival-model.js';
export { arrivalFrame as elevatorFrame } from './office-arrival-model.js';

export const OFFICE_ID = 'jevica-office';
export const OFFICE_SPEED = 2.6;
export const OFFICE_ROOM = planWorkplaceRoom();
export const OFFICE_SPAWN = [0, 1.25];
// Same north-lane lobby bay as reference-blocks.js. No tenant is replaced.
const catalogCache=new WeakMap(),siteCache=new WeakMap();
export function officeLobbyFor(world) {
  if(siteCache.has(world))return siteCache.get(world);
  const building = world.buildings?.find(b => b.id === 'osm-way-625330785');
  const gym = world.stores?.find(s => s.name === 'Equinox' && s.building_id === building?.id);
  const edge = building && facadeEdges(building).find(e => e.facing === 'north');
  if (!edge || !gym) return null;
  const forward = -edge.o[1] * edge.u[0] + edge.o[0] * edge.u[1] > 0;
  const start = forward ? 0 : edge.length, direction = forward ? 1 : -1;
  const gymAlong = (gym.facade[0]-edge.a[0])*edge.u[0]+(gym.facade[1]-edge.a[1])*edge.u[1];
  const gymDoor = (gymAlong-start)*direction;
  const [l0,l1] = officeLobbySpan(edge.length,gymDoor),middle=(l0+l1)/2;
  const along = start+direction*middle;
  const at = d => [edge.a[0]+edge.u[0]*along+edge.o[0]*d,edge.a[1]+edge.u[1]*along+edge.o[1]*d];
  const result={buildingId:building.id,width:l1-l0,entrance:at(4.5),facade:at(0),outward:edge.o,floor:officeLobbyFloor(world,at(0))};
  siteCache.set(world,result);return result;
}
// Render-only floor mask. This is not a walk-in store and must not be added to
// authoritative room/collision plans or removed by the boutique layer toggle.
export function officeLobbyGroundCutout(world) {
  const site=officeLobbyFor(world);if(!site)return null;
  const outward=site.outward,right=[-outward[1],outward[0]],facade=site.facade.map((v,i)=>v+outward[i]*.3);
  const aMin=-ARRIVAL.lobbyWidth/2,aMax=ARRIVAL.lobbyWidth/2,depth=ARRIVAL.facadeOffset+.3;
  const toWorld=(a,d)=>facade.map((v,i)=>v+right[i]*a-outward[i]*d);
  const toLocal=(east,north)=>{const rel=[east-facade[0],north-facade[1]];return [rel[0]*right[0]+rel[1]*right[1],-rel[0]*outward[0]-rel[1]*outward[1]];};
  return {facade,right,aMin,aMax,depth,floor:site.floor,toWorld,toLocal,footprint:[[aMin,0],[aMax,0],[aMax,depth],[aMin,depth]].map(([a,d])=>toWorld(a,d))};
}
export function officesFor(world) {
  if(catalogCache.has(world))return catalogCache.get(world);
  const site=officeLobbyFor(world);
  const result=site?[{id:OFFICE_ID,name:'Jevica’s office',ownerName:'Jevica',floor:6,entrance:site.entrance,facade:site.facade,outward:site.outward}]:[];
  catalogCache.set(world,result);return result;
}
// Subtract the authored lobby from generic shop alcoves on this facade only.
// Clipping partial bays preserves the displays belonging to neighboring tenants.
export function officeRetailOpenings(site,buildingId,a,b,open) {
  if(!open)return [];
  if(!site||site.buildingId!==buildingId)return [open];
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  const sx=site.facade[0]-a[0],sy=site.facade[1]-a[1];
  if(length===0||Math.abs(sx*dy-sy*dx)/length>.2)return [open];
  const along=(sx*dx+sy*dy)/length,lo=(along-site.width/2)/length,hi=(along+site.width/2)/length;
  if(hi<=open[0]||lo>=open[1])return [open];
  return [[open[0],Math.min(open[1],lo)],[Math.max(open[0],hi),open[1]]].filter(([a,b])=>(b-a)*length>.1);
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
