import { createPedestrianNetwork } from './pedestrian-network.js';
import { createWalkingEnvironment } from './walking.js';

const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const finite = point => Array.isArray(point) && point.length>=2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);
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
export function createResidentNavigation(world,{allowRoads=false,placedObjects=[]}={}) {
  const bounds=world.bounds_m;
  if(world.scene!=='district' || !bounds?.every(Number.isFinite)) return null;
  const [west,south,east,north]=bounds, cell=1;
  const width=Math.floor((east-west)/cell)+1,height=Math.floor((north-south)/cell)+1,size=width*height;
  if(width<2 || height<2 || size>80000) return null;
  const environment=createWalkingEnvironment(world), trunks=new Map(), wideTrunks=[], pedestrian=createPedestrianNetwork(world);
  for(const support of world.vegetation?.branch_supports ?? []) {
    const [x,y]=support.position,radius=0.4+Math.max(0.065,(support.height_m ?? 20)*0.014);
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(radius))continue;
    const stem=[x,y,radius*radius],left=Math.floor((x-radius)/4),right=Math.floor((x+radius)/4);
    const bottom=Math.floor((y-radius)/4),top=Math.floor((y+radius)/4);
    if((right-left+1)*(top-bottom+1)>4096) {wideTrunks.push(stem);continue;}
    for(let bx=left;bx<=right;bx++)for(let by=bottom;by<=top;by++) {
      const key=`${bx},${by}`;
      if(!trunks.has(key))trunks.set(key,[]);
      trunks.get(key).push(stem);
    }
  }
  const staticFree = point => {
    if(!finite(point) || !environment.isFree(point[0],-point[1]) || (world.site_ring && !inside(point,world.site_ring))) return false;
    const blocked=stem=>(point[0]-stem[0])**2+(point[1]-stem[1])**2<stem[2];
    return !trunks.get(`${Math.floor(point[0]/4)},${Math.floor(point[1]/4)}`)?.some(blocked) && !wideTrunks.some(blocked);
  };
  const ground = point => environment.groundAt(point[0],-point[1]);
  const objectBuckets=new Map(),wideObjects=[],bucketSize=4;
  const indexObjects=()=>{
    objectBuckets.clear();wideObjects.length=0;
    for(const object of placedObjects){
      const b=object.bounds;
      if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)){wideObjects.push(object);continue;}
      const left=Math.floor((b[0]-.35)/bucketSize),right=Math.floor((b[2]+.35)/bucketSize);
      const bottom=Math.floor((b[1]-.35)/bucketSize),top=Math.floor((b[3]+.35)/bucketSize);
      if((right-left+1)*(top-bottom+1)>4096){wideObjects.push(object);continue;}
      for(let x=left;x<=right;x++)for(let z=bottom;z<=top;z++){
        const key=`${x},${z}`;if(!objectBuckets.has(key))objectBuckets.set(key,[]);objectBuckets.get(key).push(object);
      }
    }
  };
  indexObjects();
  const objectFree=point=>{
    if(!placedObjects.length)return true;
    const x=point[0],z=-point[1],near=objectBuckets.get(`${Math.floor(x/bucketSize)},${Math.floor(z/bucketSize)}`);
    if(!near?.length&&!wideObjects.length)return true;
    const y=ground(point)+.9,blocked=object=>object.contains(x,y,z,.35,.9);
    return !near?.some(blocked)&&!wideObjects.some(blocked);
  };
  const free=point=>staticFree(point)&&objectFree(point);
  const canTravel = (a,b,objects=true) => {
    if(!finite(a) || !finite(b)) return false;
    const clear=objects?free:staticFree;
    const length=distance(a,b);
    if(length>Math.hypot(east-west,north-south)) return false;
    // Resolve thin fixture corners that the physical walker cannot step through.
    const steps=Math.max(1,Math.ceil(length/0.05));
    // A body already beside a fixture must not choose a long segment that
    // skips the immediate edge in the first sample interval.
    if(length>0)for(const offset of [.001,.01,.025])for(const t of [Math.min(.5,offset/length),Math.max(.5,1-offset/length)]) {
      if(!clear([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]))return false;
    }
    let previous=ground(a);
    for(let i=0;i<=steps;i++) {
      const point=[a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps];
      if(!clear(point))return false;
      const z=ground(point);
      if(!Number.isFinite(z) || Math.abs(z-previous)>0.25) return false;
      previous=z;
    }
    return true;
  };
  const travelCost=(a,b)=>allowRoads?distance(a,b):pedestrian.segmentCost(a,b);
  const walkable = (a,b) => canTravel(a,b) && Number.isFinite(travelCost(a,b));
  const position = id => [west+(id%width)*cell,south+Math.floor(id/width)*cell];
  const occupancy=new Int8Array(size),edges=new Map(),objectOccupancy=new Int8Array(size),objectEdges=new Map();
  const staticAvailable = id => {
    if(!occupancy[id]) occupancy[id]=staticFree(position(id)) && (allowRoads||pedestrian.classify(position(id))!=='road')?1:-1;
    return occupancy[id]===1;
  };
  const available=id=>{
    if(!staticAvailable(id))return false;
    if(!placedObjects.length)return true;
    if(!objectOccupancy[id])objectOccupancy[id]=objectFree(position(id))?1:-1;
    return objectOccupancy[id]===1;
  };
  const staticLinks = id => {
    if(edges.has(id)) return edges.get(id);
    const x=id%width,y=Math.floor(id/width),result=[];
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
      if(!dx && !dy || x+dx<0 || x+dx>=width || y+dy<0 || y+dy>=height) continue;
      const next=id+dx+dy*width;
      if(!staticAvailable(next))continue;
      // Each grid edge is traversable in both directions. Reuse the reverse
      // edge when its other endpoint has already been expanded by A*.
      const previous=edges.get(next);
      // Collision and pedestrian cost are both expensive; evaluate each once
      // for a new edge, then reuse the cached reverse edge on later searches.
      const cost=previous
        ? previous.find(link=>link.id===id)?.cost??Infinity
        : canTravel(position(id),position(next),false)?travelCost(position(id),position(next)):Infinity;
      if(Number.isFinite(cost))result.push({id:next,cost});
    }
    edges.set(id,result);return result;
  };
  const links=id=>{
    const base=staticLinks(id);
    if(!placedObjects.length)return base;
    if(objectEdges.has(id))return objectEdges.get(id);
    const start=position(id),result=base.filter(link=>{
      if(!available(link.id))return false;
      const end=position(link.id),length=distance(start,end),steps=Math.ceil(length/.05);
      // Match canTravel's probes beside thin corners at both endpoints.
      for(const offset of [.001,.01,.025])for(const t of [Math.min(.5,offset/length),Math.max(.5,1-offset/length)])
        if(!objectFree([start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t]))return false;
      for(let i=0;i<=steps;i++)if(!objectFree([start[0]+(end[0]-start[0])*i/steps,start[1]+(end[1]-start[1])*i/steps]))return false;
      return true;
    });
    objectEdges.set(id,result);return result;
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
    if(canTravel(start,end) && travelCost(start,end)<=distance(start,end)*1.15) return [[...end]];
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
    for(const id of starts) {const cost=travelCost(start,position(id));scores[id]=Number.isFinite(cost)?cost:distance(start,position(id))*8;push(id,scores[id]);}
    let found=-1,visits=0;
    while(heap.length && visits<15000) {
      const {id,cost}=pop();if(closed[id] || cost>scores[id]) continue;
      closed[id]=1;visits++;
      if(goals.has(id)) {found=id;break;}
      for(const link of links(id)) {
        const next=link.id,score=cost+link.cost;
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
      let retained=travelCost(previous,path[next]);
      while(next+1<path.length) {retained+=travelCost(path[next],path[next+1]);if(!canTravel(previous,path[next+1]) || travelCost(previous,path[next+1])>retained*1.03)break;next++;}
      result.push(path[next]);previous=path[next];index=next+1;
    }
    return result;
  };
  // Interior furniture needs finer waypoints than the outdoor grid.
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
  const sidewalkPoint = point => {
    if(pedestrian.classify(point)!=='road')return [...point.slice(0,2)];
    for(let radius=0.5;radius<=10;radius+=0.5)for(let i=0;i<48;i++) {
      const angle=i/48*Math.PI*2,p=[point[0]+Math.cos(angle)*radius,point[1]+Math.sin(angle)*radius];
      if(pedestrian.classify(p)==='sidewalk' && free(p) && canTravel(point,p))return p;
    }
    return [...point.slice(0,2)];
  };
  // Static geography remains fingerprinted/immutable. Assembly edits evict
  // only dynamic occupancy/edges and rebuild the nearby-object index. Held
  // routes still check each movement and recover through the existing slot.
  const invalidate=()=>{objectOccupancy.fill(0);objectEdges.clear();indexObjects();};
  const setPlacedObjects=objects=>{placedObjects.splice(0,placedObjects.length,...objects);invalidate();};
  return { route,canTravel,canWalk:walkable,free,ground,pedestrian,sidewalkPoint,invalidate,setPlacedObjects };
}
