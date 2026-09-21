import { createPedestrianNetwork } from './sidewalks.js';
import { createWalkingEnvironment } from './walking.js';

const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const finite = point => Array.isArray(point) && point.length>=2 && point.slice(0,2).every(Number.isFinite);
function inside(point,ring) {
  let result=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>point[1])!==(b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) result=!result;
  }
  return result;
}

// Small metric grid, queried lazily. It is a simulation route planner, not a
// survey of pedestrian access. Large neighborhood scenes stay outside this budget.
export function createResidentNavigation(world) {
  const bounds=world.bounds_m;
  if(world.scene!=='district' || !bounds?.every(Number.isFinite)) return null;
  const [west,south,east,north]=bounds, cell=2;
  const width=Math.floor((east-west)/cell)+1,height=Math.floor((north-south)/cell)+1,size=width*height;
  if(width<2 || height<2 || size>40000) return null;
  const environment=createWalkingEnvironment(world), trunks=new Map(), pedestrian=createPedestrianNetwork(world);
  for(const support of world.vegetation?.branch_supports ?? []) {
    const [x,y]=support.position,key=`${Math.floor(x/4)},${Math.floor(y/4)}`;
    if(!trunks.has(key)) trunks.set(key,[]);
    trunks.get(key).push([x,y,0.4+Math.max(0.065,(support.height_m ?? 20)*0.014)]);
  }
  const free = point => {
    if(!finite(point) || !environment.isFree(point[0],-point[1]) || (world.site_ring && !inside(point,world.site_ring))) return false;
    const bx=Math.floor(point[0]/4),by=Math.floor(point[1]/4);
    for(let x=bx-1;x<=bx+1;x++) for(let y=by-1;y<=by+1;y++) {
      if(trunks.get(`${x},${y}`)?.some(stem=>distance(point,stem)<stem[2])) return false;
    }
    return true;
  };
  const ground = point => environment.groundAt(point[0],-point[1]);
  const canTravel = (a,b) => {
    if(!finite(a) || !finite(b)) return false;
    const length=distance(a,b);
    if(length>Math.hypot(east-west,north-south)) return false;
    const steps=Math.max(1,Math.ceil(length/0.2));
    let previous=ground(a);
    for(let i=0;i<=steps;i++) {
      const point=[a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps],z=ground(point);
      if(!free(point) || !Number.isFinite(z) || Math.abs(z-previous)>0.25) return false;
      previous=z;
    }
    return true;
  };
  const walkable = (a,b) => canTravel(a,b) && Number.isFinite(pedestrian.segmentCost(a,b));
  const position = id => [west+(id%width)*cell,south+Math.floor(id/width)*cell];
  const occupancy=new Int8Array(size),edges=new Map();
  const available = id => {
    if(!occupancy[id]) occupancy[id]=free(position(id)) && pedestrian.classify(position(id))!=='road'?1:-1;
    return occupancy[id]===1;
  };
  const links = id => {
    if(edges.has(id)) return edges.get(id);
    const x=id%width,y=Math.floor(id/width),result=[];
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
      if(!dx && !dy || x+dx<0 || x+dx>=width || y+dy<0 || y+dy>=height) continue;
      const next=id+dx+dy*width;
      if(available(next) && walkable(position(id),position(next))) result.push(next);
    }
    edges.set(id,result);return result;
  };
  const connectors = point => {
    const x=Math.round((point[0]-west)/cell),y=Math.round((point[1]-south)/cell),result=[];
    for(let dx=-2;dx<=2;dx++) for(let dy=-2;dy<=2;dy++) {
      if(x+dx<0 || x+dx>=width || y+dy<0 || y+dy>=height) continue;
      const id=x+dx+(y+dy)*width;
      if(available(id) && (walkable(point,position(id)) || pedestrian.classify(point)==='road' && canTravel(point,position(id)))) result.push(id);
    }
    return result;
  };
  const gridRoute = (start,end) => {
    if(!free(start) || !free(end)) return null;
    if(walkable(start,end) && pedestrian.segmentCost(start,end)<=distance(start,end)*1.15) return [[...end]];
    const starts=connectors(start),goals=new Set(connectors(end));
    if(!starts.length || !goals.size) return null;
    const scores=new Float64Array(size).fill(Infinity),parent=new Int32Array(size).fill(-1),closed=new Uint8Array(size),heap=[];
    const push=(id,cost)=>{
      const item={id,cost},priority=cost+distance(position(id),end);item.priority=priority;
      let i=heap.length;heap.push(item);
      while(i>0) {const p=(i-1)>>1;if(heap[p].priority<=priority) break;heap[i]=heap[p];i=p;} heap[i]=item;
    };
    const pop=()=>{
      const first=heap[0],last=heap.pop();
      if(heap.length) { let i=0;while(i*2+1<heap.length) {let child=i*2+1;if(child+1<heap.length && heap[child+1].priority<heap[child].priority) child++;if(heap[child].priority>=last.priority) break;heap[i]=heap[child];i=child;}heap[i]=last; }
      return first;
    };
    for(const id of starts) {scores[id]=Number.isFinite(pedestrian.segmentCost(start,position(id)))?pedestrian.segmentCost(start,position(id)):distance(start,position(id))*8;push(id,scores[id]);}
    let found=-1,visits=0;
    while(heap.length && visits<15000) {
      const {id,cost}=pop();if(closed[id] || cost>scores[id]) continue;
      closed[id]=1;visits++;
      if(goals.has(id)) {found=id;break;}
      for(const next of links(id)) {
        const score=cost+pedestrian.segmentCost(position(id),position(next));
        if(score>=scores[next]) continue;
        scores[next]=score;parent[next]=id;push(next,score);
      }
    }
    if(found<0) return null;
    const path=[[...end]];
    for(let id=found;id>=0;id=parent[id]) path.push(position(id));
    path.reverse();
    // Remove grid zigzags only when the entire replacement segment is clear.
    const result=[];let previous=start,index=0;
    while(index<path.length) {
      let next=index;
      let retained=pedestrian.segmentCost(previous,path[next]);
      while(next+1<path.length) {retained+=pedestrian.segmentCost(path[next],path[next+1]);if(!walkable(previous,path[next+1]) || pedestrian.segmentCost(previous,path[next+1])>retained*1.03)break;next++;}
      result.push(path[next]);previous=path[next];index=next+1;
    }
    return result;
  };
  // Interior furniture needs finer waypoints than the outdoor two-meter grid.
  // A visibility graph around expanded fixture corners stays bounded per room.
  const interiorExit = (room,start) => {
    const end=room.toWorld(0,-1),points=[start,end,room.toWorld(0,0.8)];
    for(const o of room.obstacles) for(const a of [o.a0-0.4,o.a1+0.4]) for(const d of [o.d0-0.4,o.d1+0.4]) {
      const p=room.toWorld(a,d);if(free(p)) points.push(p);
    }
    const costs=new Float64Array(points.length).fill(Infinity),parents=new Int32Array(points.length).fill(-1),closed=new Set();costs[0]=0;
    for(let step=0;step<points.length;step++) {
      let best=-1;for(let i=0;i<points.length;i++) if(!closed.has(i) && (best<0 || costs[i]<costs[best])) best=i;
      if(best<0 || !Number.isFinite(costs[best])) return null;
      if(best===1) {const path=[];for(let i=1;i>0;i=parents[i]) path.unshift(points[i]);return path;}
      closed.add(best);
      for(let i=1;i<points.length;i++) {
        const cost=costs[best]+distance(points[best],points[i]);
        if(cost<costs[i] && canTravel(points[best],points[i])) {costs[i]=cost;parents[i]=best;}
      }
    }
    return null;
  };
  const route = (start,end) => {
    const direct=gridRoute(start,end);if(direct) return direct;
    const room=environment.rooms.find(room=>room.contains(...start));
    if(!room) return null;
    const exit=interiorExit(room,start);if(!exit) return null;
    const rest=gridRoute(exit.at(-1),end);return rest ? [...exit,...rest] : null;
  };
  return { route,canTravel,canWalk:walkable,free,ground,pedestrian };
}
