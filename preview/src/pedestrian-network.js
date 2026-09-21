import { routeSegments, sampleRoute } from './geometry.js';

export function createPedestrianNetwork(world) {
  const segments=[],crossings=[],buckets=new Map(),bucketSize=12;
  for(const road of world.roads ?? []) {
    const route=routeSegments(road.points);if(!route)continue;
    for(const segment of route.segments) {
      const a=[segment.start[0],-segment.start[2]],b=[segment.end[0],-segment.end[2]],width=road.width_m;
      const item={a,b,width,road:road.id};segments.push(item);
      const padding=width/2+3.5;
      for(let x=Math.floor((Math.min(a[0],b[0])-padding)/bucketSize);x<=Math.floor((Math.max(a[0],b[0])+padding)/bucketSize);x++)for(let y=Math.floor((Math.min(a[1],b[1])-padding)/bucketSize);y<=Math.floor((Math.max(a[1],b[1])+padding)/bucketSize);y++) {const key=`${x},${y}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(item);}
    }
    if(road.width_m<5)continue;
    const distances=route.length<18?[route.length/2]:[6,route.length-6];
    for(let d=35;d<route.length-12;d+=38)distances.push(d);
    for(const distance of distances){const sample=sampleRoute(route,distance);crossings.push({center:[sample.position[0],-sample.position[2]],direction:[sample.direction[0],-sample.direction[1]],width:road.width_m,road:road.id});}
  }
  const crossingByRoad=new Map();for(const crossing of crossings){if(!crossingByRoad.has(crossing.road))crossingByRoad.set(crossing.road,[]);crossingByRoad.get(crossing.road).push(crossing);}
  const classify=point=>{
    let sidewalk=false,roadDistance=Infinity,nearest=null;
    for(const segment of buckets.get(`${Math.floor(point[0]/bucketSize)},${Math.floor(point[1]/bucketSize)}`) ?? []) {
      const dx=segment.b[0]-segment.a[0],dy=segment.b[1]-segment.a[1],t=Math.max(0,Math.min(1,((point[0]-segment.a[0])*dx+(point[1]-segment.a[1])*dy)/(dx*dx+dy*dy)));
      const d=Math.hypot(point[0]-segment.a[0]-dx*t,point[1]-segment.a[1]-dy*t);
      if(segment.width<5){if(d<segment.width/2)sidewalk=true;continue;}
      if(d<segment.width/2+3.1 && d>segment.width/2+0.25)sidewalk=true;
      if(d<segment.width/2+0.15 && d<roadDistance){roadDistance=d;nearest=segment;}
    }
    if(nearest){
      const crossing=crossingByRoad.get(nearest.road)?.some(({center,direction,width})=>{
        const dx=point[0]-center[0],dy=point[1]-center[1];return Math.abs(dx*direction[0]+dy*direction[1])<=2.2 && Math.abs(dx*direction[1]-dy*direction[0])<=width/2+0.6;
      });
      return crossing?'crossing':'road';
    }
    return sidewalk?'sidewalk':'plaza';
  };
  const cost=point=>{const type=classify(point);return type==='road'?Infinity:type==='plaza'&&segments.length?3.2:1;};
  const segmentCost=(a,b)=>{
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(length/0.5));let sum=0;
    for(let i=0;i<=steps;i++)sum+=cost([a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps]);
    return length*sum/(steps+1);
  };
  return {segments,crossings,classify,cost,segmentCost};
}
