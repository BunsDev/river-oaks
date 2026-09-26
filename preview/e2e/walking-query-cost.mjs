import fs from 'node:fs';
import * as THREE from 'three';
import {buildDesignatedSidewalks} from '../src/sidewalks.js';
import {registerGroundSurfaces,groundSurfaceHeight} from '../src/world-surface.js';
import {createWalkingEnvironment} from '../src/walking.js';

const walkingURL=new URL('../src/walking.js',import.meta.url),source=fs.readFileSync(walkingURL,'utf8');
const start=source.indexOf('  const isFree ='),end=source.indexOf('  const canFly =',start);
if(start<0||end<0||!source.slice(start,end).includes('const y=groundAt(x,z)+.9'))throw new Error('Missing optimized occupancy seam');
const referenceSource=(source.slice(0,start)+'  const isFree = (x,z) => baseIsFree(x,z) && !placedObjects.some(object=>object.contains(x,groundAt(x,z)+.9,z,RADIUS));\n'+source.slice(end))
 .replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,walkingURL).href}'`);
const reference=await import(`data:text/javascript;base64,${Buffer.from(referenceSource).toString('base64')}`);
const world=JSON.parse(fs.readFileSync('preview/public/data/district.json')),t=world.terrain,positions=[],indices=[];
for(let row=0;row<t.height;row++)for(let col=0;col<t.width;col++) {
 positions.push(t.grid_origin_m[0]+col*t.spacing_m[0],t.heights_m[row*t.width+col]+.15,-t.grid_origin_m[1]-row*t.spacing_m[1]);
 if(row<t.height-1&&col<t.width-1){const a=row*t.width+col,b=a+1,c=a+t.width,d=c+1;indices.push(a,b,c,b,d,c);}
}
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
const floor=new THREE.Mesh(geometry),sidewalks=buildDesignatedSidewalks(world,createWalkingEnvironment(world).isFree);
registerGroundSurfaces(world,[floor,...sidewalks.children]);
let heightChecksum=0,objectChecks=0;
const objects=Array.from({length:16},(_,i)=>{
 const location=world.communityLocations[i%world.communityLocations.length].position,x=location[0]+1+(i%4)*.8,z=-location[1]+1,ground=groundSurfaceHeight(world,x,z);
 return {contains(px,y,pz,radius){heightChecksum+=y;objectChecks++;return y>ground-radius&&y<ground+1.2+radius&&Math.hypot(px-x,pz-z)<.2+radius;}};
});
const environments={reference:reference.createWalkingEnvironment(world,objects),optimized:createWalkingEnvironment(world,objects)};
const queries=[];
for(let frame=0;frame<60;frame++)for(const place of world.communityLocations)for(let i=0;i<16;i++)queries.push([place.position[0]+Math.sin(frame*.03)*1.5+(i%4-1.5)*.25,-place.position[1]+Math.cos(frame*.03)*1.5+(Math.floor(i/4)-1.5)*.25]);
const runs=[];
for(const mode of ['reference','optimized','optimized','reference']) {
 const timings=[];let free=0;
 for(let run=0;run<9;run++) {
  free=0;heightChecksum=0;objectChecks=0;const start=performance.now();
  for(const [x,z]of queries)if(environments[mode].isFree(x,z))free++;
  if(run>1)timings.push(performance.now()-start);
 }
 timings.sort((a,b)=>a-b);runs.push({mode,medianMs:timings[3],minMs:timings[0],free,objectChecks,heightChecksum});
}
if(runs.some(r=>r.free!==runs[0].free||r.objectChecks!==runs[0].objectChecks||r.heightChecksum!==runs[0].heightChecksum))throw new Error('Occupancy or sampled obstacle heights changed');
console.log(JSON.stringify({queries:queries.length,obstacles:objects.length,runs,scope:'Paired ABBA CPU query benchmark on actual district terrain and sidewalks with sixteen finite obstacles; not a frame-rate benchmark.'}));
