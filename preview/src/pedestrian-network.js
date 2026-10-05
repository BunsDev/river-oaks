import { STREET, isWalkway, streetSection, joinStreetSegments } from './street-profile.js';
import { routeSegments, sampleRoute } from './geometry.js';

export function createPedestrianNetwork(world) {
  const segments=[],crossings=[],buckets=new Map(),bucketSize=12;
  for(const road of world.roads ?? []) {
    const route=routeSegments(road.points);if(!route)continue;
    for(const segment of route.segments) {
      const a=[segment.start[0],-segment.start[2]],b=[segment.end[0],-segment.end[2]],width=road.width_m;
      const item={a,b,width,road:road.id,walkway:isWalkway(road)};segments.push(item);
      const padding=width/2+STREET.sidewalkWidth+0.5;
      for(let x=Math.floor((Math.min(a[0],b[0])-padding)/bucketSize);x<=Math.floor((Math.max(a[0],b[0])+padding)/bucketSize);x++)for(let y=Math.floor((Math.min(a[1],b[1])-padding)/bucketSize);y<=Math.floor((Math.max(a[1],b[1])+padding)/bucketSize);y++) {const key=`${x},${y}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(item);}
    }
    if(isWalkway(road))continue;
    const distances=route.length<18?[route.length/2]:[6,route.length-6];
    for(let d=35;d<route.length-12;d+=38)distances.push(d);
    for(const distance of distances){const sample=sampleRoute(route,distance);crossings.push({center:[sample.position[0],-sample.position[2]],direction:[sample.direction[0],-sample.direction[1]],width:road.width_m,road:road.id});}
  }
  joinStreetSegments(segments);
  const crossingByRoad=new Map();for(const crossing of crossings){if(!crossingByRoad.has(crossing.road))crossingByRoad.set(crossing.road,[]);crossingByRoad.get(crossing.road).push(crossing);}
  const classify=point=>{
    let sidewalk=false,roadDistance=Infinity,nearest=null;
    for(const segment of buckets.get(`${Math.floor(point[0]/bucketSize)},${Math.floor(point[1]/bucketSize)}`) ?? []) {
      const dx=segment.b[0]-segment.a[0],dy=segment.b[1]-segment.a[1],t=Math.max(0,Math.min(1,((point[0]-segment.a[0])*dx+(point[1]-segment.a[1])*dy)/(dx*dx+dy*dy)));
      const d=Math.hypot(point[0]-segment.a[0]-dx*t,point[1]-segment.a[1]-dy*t);
      if(segment.walkway){if(d<segment.width/2)sidewalk=true;continue;}
      if(d<segment.width/2+STREET.sidewalkWidth && d>segment.width/2+streetSection({width_m:segment.width}).furnitureWidth)sidewalk=true;
      if(d<segment.width/2+0.15 && d<roadDistance){roadDistance=d;nearest=segment;}
    }
    if(nearest){
      const crossing=crossingByRoad.get(nearest.road)?.some(({center,direction,width})=>{
        const dx=point[0]-center[0],dy=point[1]-center[1];return Math.abs(dx*direction[0]+dy*direction[1])<=STREET.crossingWidth/2 && Math.abs(dx*direction[1]-dy*direction[0])<=width/2+0.6;
      });
      return crossing?'crossing':'road';
    }
    return sidewalk?'sidewalk':'plaza';
  };
  const cost=point=>{const type=classify(point);return type==='road'?Infinity:type==='plaza'&&segments.length?3.2:1;};
  const segmentCost=(a,b)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),steps=Math.max(1,Math.ceil(length/0.5));let sum=0;
    // Uniform samples can step over a narrow piece of roadway at a crossing
    // edge. Split at road-capsule and crossing boundaries before costing it.
    const nearby=new Set(),cuts=[0,1],add=t=>{if(t>0 && t<1)cuts.push(t);};
    for(let x=Math.floor(Math.min(a[0],b[0])/bucketSize);x<=Math.floor(Math.max(a[0],b[0])/bucketSize);x++)for(let y=Math.floor(Math.min(a[1],b[1])/bucketSize);y<=Math.floor(Math.max(a[1],b[1])/bucketSize);y++)for(const segment of buckets.get(`${x},${y}`) ?? [])if(!segment.walkway)nearby.add(segment);
    const boundary=(origin,axis,half)=>{
      const start=(a[0]-origin[0])*axis[0]+(a[1]-origin[1])*axis[1],change=dx*axis[0]+dy*axis[1];
      if(Math.abs(change)>1e-12){add((half-start)/change);add((-half-start)/change);}
    };
    const roads=new Set();
    for(const segment of nearby) {
      roads.add(segment.road);
      const sx=segment.b[0]-segment.a[0],sy=segment.b[1]-segment.a[1],span=Math.hypot(sx,sy),radius=segment.width/2+0.15;
      boundary(segment.a,[-sy/span,sx/span],radius);
      if(length>1e-12)for(const center of [segment.a,segment.b]) {
        const px=a[0]-center[0],py=a[1]-center[1],linear=2*(px*dx+py*dy),constant=px*px+py*py-radius*radius,discriminant=linear*linear-4*length*length*constant;
        if(discriminant>=0){const root=Math.sqrt(discriminant);add((-linear-root)/(2*length*length));add((-linear+root)/(2*length*length));}
      }
    }
    for(const road of roads)for(const crossing of crossingByRoad.get(road) ?? []) {
      boundary(crossing.center,crossing.direction,STREET.crossingWidth/2);
      boundary(crossing.center,[-crossing.direction[1],crossing.direction[0]],crossing.width/2+0.6);
    }
    cuts.sort((x,y)=>x-y);
    for(let i=1;i<cuts.length;i++) {
      const t=(cuts[i-1]+cuts[i])/2;
      if(classify([a[0]+dx*t,a[1]+dy*t])==='road')return Infinity;
    }
    for(let i=0;i<=steps;i++)sum+=cost([a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps]);
    return length*sum/(steps+1);
  };
  const clearOfOtherRoads=(point,owner,clearance=0)=>{
    for(const s of buckets.get(`${Math.floor(point[0]/bucketSize)},${Math.floor(point[1]/bucketSize)}`)??[]) {
      if(s.walkway||s.road===owner)continue;
      const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],t=Math.max(0,Math.min(1,((point[0]-s.a[0])*dx+(point[1]-s.a[1])*dy)/(dx*dx+dy*dy)));
      if(Math.hypot(point[0]-s.a[0]-t*dx,point[1]-s.a[1]-t*dy)<s.width/2+clearance)return false;
    }
    return true;
  };
  return {segments,crossings,classify,cost,segmentCost,clearOfOtherRoads};
}
