import { treeSupports } from './tree-placements.js';
import { createPedestrianNetwork } from './pedestrian-network.js';
import { createWalkingEnvironment } from './walking.js';
import { COMMONS_ID } from '../../shared/east-garden-commons-layout.js';

const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
// Each route grid stays at or under 80,000 one-metre cells.
const GRID_CELLS=80000;
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
// `locations` lets a planner cross into composed locations (the Commons) through
// their own bounded grids; without it the District grid is all there is.
// A location larger than `locationCells` is split into east/west strips under it.
export function createResidentNavigation(world,{allowRoads=false,placedObjects=[],locations=false,locationCells=GRID_CELLS}={}) {
  // Preserve the District grid budget while each adjacent location gets its own grid.
  const bounds=world.eastGardenCommons?.districtBounds ?? world.bounds_m;
  if(world.scene!=='district' || !bounds?.every(Number.isFinite)) return null;
  const geography=createGeography(world);
  const district=createGridNavigation(world,bounds,{allowRoads,placedObjects,ring:world.site_ring,geography});
  if(!district || !locations || !world.eastGardenCommons) return district;
  return composeLocations(world,district,{allowRoads,placedObjects,geography,locationCells:Math.min(locationCells,GRID_CELLS)}) ?? district;
}

// The walking environment, pedestrian network and trunk index serve every grid in a town.
function createGeography(world) {
  const environment=createWalkingEnvironment(world), trunks=new Map(), wideTrunks=[], pedestrian=createPedestrianNetwork(world);
  for(const support of treeSupports(world)) {
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
  return {environment,trunks,wideTrunks,pedestrian};
}

function createGridNavigation(world,bounds,{allowRoads,placedObjects,ring,geography}) {
  if(!bounds?.every(Number.isFinite)) return null;
  const [west,south,east,north]=bounds, cell=1;
  const width=Math.floor((east-west)/cell)+1,height=Math.floor((north-south)/cell)+1,size=width*height;
  if(width<2 || height<2 || size>GRID_CELLS) return null;
  const {environment,trunks,wideTrunks,pedestrian}=geography;
  const clearOfTrunks = point => {
    const blocked=stem=>(point[0]-stem[0])**2+(point[1]-stem[1])**2<stem[2];
    return !trunks.get(`${Math.floor(point[0]/4)},${Math.floor(point[1]/4)}`)?.some(blocked) && !wideTrunks.some(blocked);
  };
  const staticFree = point => {
    if(!finite(point) || !environment.isFree(point[0],-point[1]) || (ring && !inside(point,ring))) return false;
    return clearOfTrunks(point);
  };
  // Walkable ground anywhere in the town, ignoring this grid's site ring: seam corridors use it.
  const open = point => finite(point) && environment.isFree(point[0],-point[1]) && clearOfTrunks(point) && objectFree(point);
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
  // A waypoint at a fixture edge leaves a walker no room to approach it: the
  // spatial-streets journey stalled 0.08 m from a slanted edge. Move such an
  // intermediate waypoint to the nearest point with WAYPOINT_CLEARANCE of free
  // ground around it, keeping both of its legs walkable; otherwise leave it.
  const WAYPOINT_CLEARANCE=0.3;
  const roomy=point=>{
    for(let r=0.05;r<=WAYPOINT_CLEARANCE+1e-9;r+=0.05)for(let i=0;i<24;i++) {
      const angle=i/24*Math.PI*2;if(!free([point[0]+Math.cos(angle)*r,point[1]+Math.sin(angle)*r]))return false;
    }
    return true;
  };
  const clearWaypoints=(start,path)=>{
    for(let i=0;i<path.length-1;i++) {
      if(roomy(path[i]))continue;
      const before=i?path[i-1]:start,after=path[i+1];
      search:for(let r=0.1;r<=0.6+1e-9;r+=0.1)for(let k=0;k<24;k++) {
        const angle=k/24*Math.PI*2,point=[path[i][0]+Math.cos(angle)*r,path[i][1]+Math.sin(angle)*r];
        if(roomy(point)&&walkable(before,point)&&walkable(point,after)){path[i]=point;break search;}
      }
    }
    return path;
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
    return clearWaypoints(start,result);
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
  return { route,canTravel,canWalk:walkable,free,ground,pedestrian,sidewalkPoint,invalidate,setPlacedObjects,open,travelCost };
}

const insideBounds=(bounds,point)=>point[0]>=bounds[0] && point[0]<=bounds[2] && point[1]>=bounds[1] && point[1]<=bounds[3];

// The fewest equal east/west strips of `bounds` whose 1 m grids fit in `cells`.
function strips(bounds,cells) {
  const [west,south,east,north]=bounds,height=Math.floor(north-south)+1;
  let count=1;
  while((Math.floor((east-west)/count)+1)*height>cells && count<64) count++;
  const width=(east-west)/count;
  return Array.from({length:count},(_,index)=>[index,[west+index*width,south,index===count-1 ? east : west+(index+1)*width,north],count]);
}

// Each composed location keeps its own bounded grid; seam corridors join
// neighbours that share an east/west edge. Corridors are found, not authored:
// perpendicular crossings of the shared edge whose ground is open, off the road
// and within the step limit, grouped into runs at least a metre wide.
function composeLocations(world,district,{allowRoads,placedObjects,geography,locationCells}) {
  const layout=world.eastGardenCommons;
  const plaza=layout.surfaces?.find(surface=>surface.id===`${COMMONS_ID}/plaza`)?.rect;
  // The layout's own bounds span the District too; the location is edge to plaza.
  const commons=plaza && [layout.edge,plaza[1],plaza[2],plaza[3]];
  const regions=[{id:'district',bounds:layout.districtBounds,nav:district}];
  for(const [id,bounds] of [[COMMONS_ID,commons],[layout.heights?.id ?? 'heights',layout.heights?.bounds]]) {
    // Bayou Heights (308 × 291 cells) is over the cap: its strips meet at seams like any other.
    for(const [index,strip,count] of bounds?.every(Number.isFinite) ? strips(bounds,locationCells) : []) {
      const nav=createGridNavigation(world,strip,{allowRoads,placedObjects:[...placedObjects],ring:null,geography});
      if(nav) regions.push({id:count>1 ? `${id}#${index+1}` : id,bounds:strip,nav});
    }
  }
  if(regions.length<2) return null;
  const {pedestrian,environment}=geography;
  const ground=point=>environment.groundAt(point[0],-point[1]);
  const offRoad=point=>allowRoads || pedestrian.classify(point)!=='road';
  const firstFree=(nav,x,north,direction)=>{
    for(let step=0.5;step<=24;step+=0.5) {const point=[x+direction*step,north];if(nav.free(point)&&offRoad(point))return point;}
    return null;
  };
  const crossingClear=(a,b)=>{
    const steps=Math.ceil(distance(a,b)/0.05);let previous=ground(a);
    for(let i=0;i<=steps;i++) {
      const point=[a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps],z=ground(point);
      if(!district.open(point) || !Number.isFinite(z) || Math.abs(z-previous)>0.25) return false;
      previous=z;
    }
    return Number.isFinite(district.travelCost(a,b));
  };
  const portals=[];
  for(const west of regions)for(const east of regions) {
    if(west===east || Math.abs(west.bounds[2]-east.bounds[0])>1e-6) continue;
    const x=west.bounds[2],south=Math.max(west.bounds[1],east.bounds[1]),north=Math.min(west.bounds[3],east.bounds[3]);
    let run=[];
    const close=()=>{
      if(run.length>=3) {
        // Keep right: walkers heading east cross in the southern part of the run,
        // walkers heading west in the northern part, so they never share a waypoint.
        const middle=run[run.length>>1],south=run[Math.floor(run.length/4)],north=run[Math.min(run.length-1,Math.floor(run.length*3/4))];
        const xs=run.flatMap(item=>[item.from[0],item.to[0]]);
        portals.push({west,east,from:middle.from,to:middle.to,eastbound:[south.from,south.to],westbound:[north.to,north.from],
          crossings:run.map(item=>[item.from,item.to]),rect:[Math.min(...xs),run[0].from[1]-0.25,Math.max(...xs),run.at(-1).from[1]+0.25]});
      }
      run=[];
    };
    for(let n=Math.ceil(south*2)/2+0.5;n<=north-0.5;n+=0.5) {
      const from=firstFree(west.nav,x,n,-1),to=from && firstFree(east.nav,x,n,1);
      if(to && crossingClear(from,to)) run.push({from,to}); else close();
    }
    close();
  }
  if(!portals.length) return null;
  const inCorridor=point=>portals.some(portal=>insideBounds(portal.rect,point));
  const regionOf=point=>regions.find(region=>region!==regions[0] && insideBounds(region.bounds,point))
    ?? (insideBounds(regions[0].bounds,point) ? regions[0] : null);
  const free=point=>{
    if(!finite(point)) return false;
    if(regionOf(point)?.nav.free(point)) return true;
    return inCorridor(point) && district.open(point) && offRoad(point);
  };
  const reach=Math.hypot(Math.max(...regions.map(region=>region.bounds[2]))-Math.min(...regions.map(region=>region.bounds[0])),
    Math.max(...regions.map(region=>region.bounds[3]))-Math.min(...regions.map(region=>region.bounds[1])));
  const canTravel=(a,b)=>{
    if(!finite(a) || !finite(b)) return false;
    const region=regionOf(a);
    if(region && region===regionOf(b) && region.nav.free(a) && region.nav.free(b)) return region.nav.canTravel(a,b);
    // Across a seam: sample like a grid does, against the composed ground.
    const length=distance(a,b);
    if(length>reach) return false;
    if(length>0)for(const offset of [.001,.01,.025])for(const t of [Math.min(.5,offset/length),Math.max(.5,1-offset/length)])
      if(!free([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t])) return false;
    const steps=Math.max(1,Math.ceil(length/0.05));let previous=ground(a);
    for(let i=0;i<=steps;i++) {
      const point=[a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps],z=ground(point);
      if(!free(point) || !Number.isFinite(z) || Math.abs(z-previous)>0.25) return false;
      previous=z;
    }
    return true;
  };
  const canWalk=(a,b)=>canTravel(a,b) && Number.isFinite(district.travelCost(a,b));
  // Regions form a short chain; breadth-first search finds the hops.
  const hops=(from,to)=>{
    const previous=new Map([[from,null]]),queue=[from];
    while(queue.length) {
      const region=queue.shift();
      if(region===to) break;
      for(const portal of portals)for(const [a,b] of [[portal.west,portal.east],[portal.east,portal.west]])
        if(a===region && !previous.has(b)) {previous.set(b,region);queue.push(b);}
    }
    if(!previous.has(to)) return null;
    const chain=[];for(let region=to;region;region=previous.get(region)) chain.unshift(region);
    return chain;
  };
  // A body standing in a corridor steps to its end on the side it is heading for.
  const settle=(point,toward)=>{
    const region=regionOf(point);
    if(region?.nav.free(point)) return {region,lead:[]};
    const portal=portals.find(item=>insideBounds(item.rect,point));
    if(!portal) return null;
    const ends=[[portal.west,portal.from],[portal.east,portal.to]].sort((a,b)=>distance(a[1],toward)-distance(b[1],toward));
    for(const [side,end] of ends) if(canWalk(point,end)) return {region:side,lead:[[...end]],at:end};
    return null;
  };
  // Corridors are found before anything is built. A placed object can block a
  // keep-right lane later: cross on the clear row of the run nearest to it.
  const lane=(portal,eastward)=>{
    const preferred=eastward ? portal.eastbound : portal.westbound;
    if(canWalk(...preferred)) return preferred;
    return portal.crossings.map(([west,east])=>eastward ? [west,east] : [east,west])
      .sort((a,b)=>Math.abs(a[0][1]-preferred[0][1])-Math.abs(b[0][1]-preferred[0][1]))
      .find(([near,far])=>canWalk(near,far)) ?? null;
  };
  // A grid search gives up after a bounded number of cells. Leaving an enclosure
  // whose exits face away from the goal (Heights Green, from the bandstand) can
  // take longer than finding the way in, so a location leg that fails is searched
  // in reverse; every leg a route returns is walkable either way. District legs
  // keep the District grid's own answers.
  const legRoute=(region,a,b)=>{
    const path=region.nav.route(a,b);
    if(path || region===regions[0]) return path;
    const back=region.nav.route(b,a);
    return back && [...back.slice(0,-1).reverse(),[...b]];
  };
  const route=(start,end)=>{
    if(!finite(start) || !finite(end)) return null;
    const from=settle(start,end),to=settle(end,start);
    if(!from || !to) return null;
    const origin=from.at ?? start,goal=to.at ?? end;
    const chain=hops(from.region,to.region);
    if(!chain) return null;
    const path=[...from.lead];let current=origin;
    for(let i=0;i<chain.length-1;i++) {
      const choices=portals.filter(portal=>portal.west===chain[i] && portal.east===chain[i+1] || portal.east===chain[i] && portal.west===chain[i+1])
        .map(portal=>({portal,eastward:portal.west===chain[i],ends:portal.west===chain[i] ? portal.eastbound : portal.westbound}))
        .sort(({ends:a},{ends:b})=>distance(current,a[0])+distance(a[1],goal)-distance(current,b[0])-distance(b[1],goal)).slice(0,3);
      let crossed=false;
      for(const choice of choices) {
        const crossing=lane(choice.portal,choice.eastward);
        if(!crossing) continue;
        const [near,far]=crossing,leg=distance(current,near)<1e-9 ? [] : legRoute(chain[i],current,near);
        if(!leg) continue;
        path.push(...leg,[...far]);current=far;crossed=true;break;
      }
      if(!crossed) return null;
    }
    const last=distance(current,goal)<1e-9 ? [] : legRoute(chain.at(-1),current,goal);
    if(!last) return null;
    path.push(...last);
    if(to.at) path.push([...end]);
    return path;
  };
  const sidewalkPoint=point=>regionOf(point)===regions[0] ? district.sidewalkPoint(point) : [...point.slice(0,2)];
  const invalidate=()=>{for(const region of regions) region.nav.invalidate();};
  const setPlacedObjects=objects=>{for(const region of regions) region.nav.setPlacedObjects(objects);};
  return { route,canTravel,canWalk,free,ground:district.ground,pedestrian,sidewalkPoint,invalidate,setPlacedObjects,
    open:district.open,travelCost:district.travelCost,
    locations:{regions:regions.map(({id,bounds})=>({id,bounds:[...bounds]})),portals:portals.map(({west,east,from,to,eastbound,westbound,rect})=>({west:west.id,east:east.id,from:[...from],to:[...to],
      eastbound:eastbound.map(point=>[...point]),westbound:westbound.map(point=>[...point]),rect:[...rect]}))} };
}
