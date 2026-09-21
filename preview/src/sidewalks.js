import * as THREE from 'three';
import { routeSegments, sampleRoute, terrainHeight } from './geometry.js';

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

export function buildDesignatedSidewalks(world,isFree) {
  const network=createPedestrianNetwork(world),group=new THREE.Group();group.name='Designated sidewalks and crossings';
  const positions=[],colors=[];
  const add=(center,along,across,length,width,color,height)=>{
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>[center[0]+along[0]*u*length/2+across[0]*v*width/2,center[1]+along[1]*u*length/2+across[1]*v*width/2]);
    for(const index of [0,2,1,0,3,2]){const [x,y]=corners[index];positions.push(x,terrainHeight(world.terrain,x,y)+height,-y);colors.push(...color);}
  };
  for(const segment of network.segments) {
    if(segment.width<5)continue;
    const length=Math.hypot(segment.b[0]-segment.a[0],segment.b[1]-segment.a[1]),along=[(segment.b[0]-segment.a[0])/length,(segment.b[1]-segment.a[1])/length],across=[-along[1],along[0]],steps=Math.ceil(length/1.4);
    for(let i=0;i<steps;i++)for(const side of [-1,1]) {
      const t=(i+0.5)/steps,center=[segment.a[0]+along[0]*length*t+across[0]*side*(segment.width/2+1.65),segment.a[1]+along[1]*length*t+across[1]*side*(segment.width/2+1.65)];
      if(!isFree(center[0],-center[1]) || network.classify(center)==='road')continue;
      // A pale stone walking band between the existing kerb and storefront.
      add(center,along,across,length/steps-0.025,2.4,[0.59,0.58,0.54],0.258);
      for(const edge of [-1,1])add([center[0]+across[0]*edge*1.17,center[1]+across[1]*edge*1.17],along,across,length/steps,0.055,[0.79,0.74,0.61],0.262);
    }
  }
  for(const crossing of network.crossings) {
    const along=crossing.direction,across=[-along[1],along[0]];
    for(let stripe=-2;stripe<=2;stripe++)add([crossing.center[0]+along[0]*stripe*0.82,crossing.center[1]+along[1]*stripe*0.82],along,across,0.44,crossing.width,[0.84,0.84,0.75],0.263);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.94,side:THREE.DoubleSide}));mesh.receiveShadow=true;group.add(mesh);group.userData.crossings=network.crossings.length;return group;
}
