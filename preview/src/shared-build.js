// Pure data shared by the browser and the authoritative town. IDs are stable
// checkpoint values; changing a label or model does not invalidate old builds.
import { validAssembly,objectBounds } from './creator-object.js';
export const BUILD_KINDS = [
  {id:'seat',label:'Garden seat',radius:.88,height:.9},
  {id:'planter',label:'Flower planter',radius:.65,height:.8},
  {id:'lamp',label:'Orbital lamp',radius:.48,height:2.8},
  {id:'sculpture',label:'Ribbon sculpture',radius:.72,height:2.1},
  {id:'armchair',label:'Lounge chair',radius:.78,height:1.12},
  {id:'side-table',label:'Side table',radius:.55,height:.66},
  {id:'object',label:'Custom object',radius:.71,height:1},
];
export const BUILD_FINISHES = [
  {id:'rose',label:'Rose',color:'#b97986',accent:'#edc6bc'},
  {id:'teal',label:'Deep teal',color:'#386b69',accent:'#a5d3c4'},
  {id:'brass',label:'Warm brass',color:'#a77e4c',accent:'#efd39a'},
  {id:'slate',label:'Blue slate',color:'#596a83',accent:'#c0c7d8'},
];
export const buildKind = id => BUILD_KINDS.find(item=>item.id===id)??null;
export const buildFinish = id => BUILD_FINISHES.find(item=>item.id===id)??null;
export const buildGeometry = item => item?.kind==='object'
  ? validAssembly(item.assembly)?{...buildKind('object'),...objectBounds(item.assembly)}:null
  : item?.assembly===undefined?buildKind(item?.kind):null;

// Placement rules shared by the browser preview and the authoritative town, so
// builder mode shows exactly what the server will accept. Positions are
// [east, north]; environment is a walking environment (z = -north).
export const buildYaw=yaw=>Math.round(Math.atan2(Math.sin(yaw),Math.cos(yaw))/(Math.PI/8))*(Math.PI/8);
export const BUILD_REACH = 3.6, BUILD_EDIT_REACH = 4.5, BUILD_PLAYER_GAP = .65;
export const MAX_SAVED_DESIGNS = 48;
export const BUILD_REASONS = {
  ground: 'Find solid ground to build on.',
  indoors: 'Build outside or inside a home, not in a shop.',
  room: 'Keep the whole creation inside the home.',
  threshold: 'Step fully outside or inside the home before building.',
  doorway: 'Leave the home doorway clear.',
  uneven: 'This spot is not level enough.',
  blocked: 'Something is in the way here.',
  road: 'Keep clear of the road.',
  creation: 'Too close to another creation.',
  player: 'Someone is standing there.',
  reach: 'Move closer to place it there.',
};
export const segmentDistance = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length)) : 0;
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
};
export const buildRoads = world => (world?.roads ?? []).flatMap(road => (road.points ?? []).slice(1).map((end, index) => ({ a: road.points[index], b: end, radius: Math.max(.5, (road.width_m ?? 3) / 2) })));
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function buildRoomAt(environment, position) {
  const room=environment.roomAt(position[0],-position[1]);
  return room?.contains(position[0],position[1]) ? room : null;
}
export function checkBuildSite({ environment, roads, position, kind, builds = [], ignoreId = null }) {
  const [east, north] = position, z = -north, ground = environment.groundAt(east, z);
  if (!Number.isFinite(ground)) return { reason: 'ground' };
  const room=environment.roomAt(east,z);
  if (room && room.category !== 'home') return { reason: 'indoors' };
  if (room && kind.height>room.height-.1) return { reason:'room' };
  if (room && !room.contains(east,north,kind.radius+.35)) return { reason: 'room' };
  if (room && room.toLocal(east,north)[1] < kind.radius+1.5) return { reason: 'doorway' };
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4, x = east + Math.cos(angle) * kind.radius, n = north + Math.sin(angle) * kind.radius;
    if (room && !room.contains(x,n,.35)) return { reason: 'room' };
    if (!environment.isFree(x, -n)) return { reason: 'blocked' };
    if (Math.abs(environment.groundAt(x, -n) - ground) > .35) return { reason: 'uneven' };
  }
  if (!environment.isFree(east, z) || kind.id==='object' && environment.isAreaFree && !environment.isAreaFree(east,z,kind.radius)) return { reason: 'blocked' };
  if (!room && roads.some(road => segmentDistance(east, north, road.a, road.b) < road.radius + kind.radius + .25)) return { reason: 'road' };
  if (builds.some(item => item.id !== ignoreId && gap(item.position, position) < (buildGeometry(item)?.radius ?? 0) + kind.radius + .25)) return { reason: 'creation' };
  return { ground };
}
