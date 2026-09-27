import { VEHICLES } from './vehicle-config.js';
import {createResidentNavigation} from './navigation.js';
import {createWalkingEnvironment} from './walking.js';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

export function createCompanionNavigation(world,{placement=null}={}) {
  let routeWorld=world;
  if(placement) {
    const {position,yaw,scale=1,team=false}=placement,c=Math.cos(yaw),s=Math.sin(yaw);
    const spec=VEHICLES[placement.vehicle],halfLength=spec?.length/2,halfWidth=spec?.width/2;
    const outlines=spec?[[[-halfLength,-halfWidth],[halfLength,-halfWidth],[halfLength,halfWidth],[-halfLength,halfWidth]]]:[[[-3.12,-1.36],[3.12,-1.36],[3.12,1.36],[-3.12,1.36]],...(team?[[[-8,-2.9],[-2.9,-2.9],[-2.9,2.9],[-8,2.9]]]:[])];
    const rings=outlines.map(outline=>{
      const cx=outline.reduce((n,p)=>n+p[0],0)/outline.length;
      return outline.map(([x,z])=>[x+Math.sign(x-cx)*.18,z+Math.sign(z)*.18])
        .map(([x,z])=>[position[0]+(x*c+z*s)*scale,-position[2]+(x*s-z*c)*scale]);
    });
    const buildings=world.collisionPolygons??(world.buildings??[]).map(b=>b.ring??(()=>{
      const a=(b.yaw_deg??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
      return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[b.center[0]+x*b.size[0]/2*c-y*b.size[1]/2*s,b.center[1]+x*b.size[0]/2*s+y*b.size[1]/2*c]);
    })());
    routeWorld={...world,collisionPolygons:[...buildings,...rings]};
  }
  const nav=createResidentNavigation(routeWorld,{allowRoads:true});if(!nav)return null;
  const environment=createWalkingEnvironment(routeWorld);
  // Both endpoints may be inside shops. Explicit door portals and fixture
  // corners avoid forcing a narrow doorway onto the outdoor two-metre grid.
  const insideRoute=(room,start,end)=>{
    if(nav.canTravel(start,end))return [[...end]];
    const points=[start,end,room.toWorld(0,.8),room.toWorld(0,-1)];
    for(const obstacle of room.obstacles)for(const a of [obstacle.a0-.4,obstacle.a1+.4])for(const d of [obstacle.d0-.4,obstacle.d1+.4]) {
      const point=room.toWorld(a,d);if(nav.free(point))points.push(point);
    }
    const costs=points.map(()=>Infinity),parents=[],closed=new Set();costs[0]=0;
    for(let step=0;step<points.length;step++) {
      let best=-1;for(let i=0;i<points.length;i++)if(!closed.has(i)&&(best<0||costs[i]<costs[best]))best=i;
      if(best<0||!Number.isFinite(costs[best]))return null;
      if(best===1){const path=[];for(let i=1;i>0;i=parents[i])path.unshift(points[i]);return path;}
      closed.add(best);
      for(let i=1;i<points.length;i++) {
        const cost=costs[best]+distance(points[best],points[i]);
        if(cost<costs[i]&&nav.canTravel(points[best],points[i])){costs[i]=cost;parents[i]=best;}
      }
    }
    return null;
  };
  const roomAt=point=>environment.roomAt(point[0],-point[1]);
  return {...nav,roomAt,
    route(start,end) {
      if(!nav.free(start)||!nav.free(end))return null;
      const from=roomAt(start),to=roomAt(end);
      if(from&&from===to)return insideRoute(from,start,end);
      const out=from?from.toWorld(0,-1):start,entry=to?to.toWorld(0,-1):end;
      const first=from?insideRoute(from,start,out):[],last=to?insideRoute(to,entry,end):[];
      if(!first||!last)return null;
      const outside=distance(out,entry)<.001?[]:nav.route(out,entry);
      return outside?[...first,...outside,...last]:null;
    },
  };
}

export function createCompanionRouteService(world,placement) {
  let worker=null,pending=null,sequence=0,disposed=false;
  const settle=value=>{if(!pending)return;clearTimeout(pending.timer);const {resolve}=pending;pending=null;resolve(value);};
  const stop=()=>{worker?.terminate();worker=null;};
  return {
    route(start,end) {
      if(disposed||pending)return Promise.resolve(null);
      return new Promise(resolve=>{
        const id=++sequence;pending={id,resolve,timer:setTimeout(()=>{stop();settle(null);},2500)};
        try {
          if(!worker) {
            worker=new Worker(new URL('./companion-navigation-worker.js',import.meta.url),{type:'module'});
            worker.onmessage=({data})=>{if(data.id===pending?.id)settle(data.route);};
            worker.onerror=()=>{stop();settle(null);};
            const {scene,bounds_m,site_ring,roads,collisionPolygons,terrain,walkSurfaceOffset,stores,buildings,vegetation}=world;
            worker.postMessage({type:'init',world:{scene,bounds_m,site_ring,roads,collisionPolygons,terrain,walkSurfaceOffset,stores,buildings,vegetation:{branch_supports:vegetation?.branch_supports??[]}},placement});
          }
          worker.postMessage({type:'route',id,start,end});
        }catch{stop();settle(null);}
      });
    },
    dispose(){disposed=true;stop();settle(null);},
  };
}

// Convert scene X/Z to the planner's east/north coordinates at this boundary.
// Pending routes are fenced on manual holds, return commands and world resets.
export function createCompanionRouteFollower(navigation,service) {
  let path=[],target=null,pending=false,epoch=0,cooldown=0,waiting=false;
  const reset=()=>{epoch++;pending=false;path=[];target=null;cooldown=0;waiting=false;};
  return {
    reset,
    get waiting(){return waiting;},
    update(position,destination,delta) {
      if(!destination){if(path.length||pending||target)reset();return null;}
      const start=[position[0],-position[1]],end=[destination[0],-destination[1]];
      cooldown=Math.max(0,cooldown-Math.min(.08,Math.max(0,delta)));
      if(distance(start,end)<.14){path=[];waiting=false;return null;}
      // Local adjustments stay responsive. Jev may follow her across roads and plazas,
      // but proximity never permits cutting through a wall.
      if(navigation.canWalk(start,end)){path=[];waiting=false;return destination;}
      if(!pending&&!cooldown&&(!path.length||!target||distance(target,end)>.65)) {
        const generation=epoch;target=end;pending=true;cooldown=.7;
        Promise.resolve().then(()=>generation===epoch?service.route(start,end):null).then(next=>{
          if(generation!==epoch)return;pending=false;
          if(next?.length&&navigation.canTravel(start,next[0])){path=next;waiting=false;}
          else if(!path.length)waiting=true;
        }).catch(()=>{if(generation===epoch){pending=false;waiting=true;}});
      }
      // Skip a waypoint he is already on only when the next one is reachable from
      // here; a planner snap point can be the only way around a corner.
      while(path.length&&distance(start,path[0])<.18&&(path.length===1||navigation.canTravel(start,path[1])))path.shift();
      if(!path.length)return null;
      if(!navigation.canTravel(start,path[0])){path=[];waiting=true;return null;}
      return [path[0][0],-path[0][1]];
    },
  };
}
