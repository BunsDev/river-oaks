import fs from 'node:fs';
import * as THREE from 'three';
import {buildDesignatedSidewalks} from '../src/sidewalks.js';
import {createWalkingEnvironment} from '../src/walking.js';
const {registerGroundSurfaces,groundSurfaceHeight}=await import(process.argv[2]??'../src/world-surface.js');
const world=JSON.parse(fs.readFileSync('preview/public/data/district.json')),t=world.terrain,positions=[],indices=[];
for(let row=0;row<t.height;row++)for(let col=0;col<t.width;col++) {
 positions.push(t.grid_origin_m[0]+col*t.spacing_m[0],t.heights_m[row*t.width+col]+.15,-t.grid_origin_m[1]-row*t.spacing_m[1]);
 if(row<t.height-1&&col<t.width-1){const a=row*t.width+col,b=a+1,c=a+t.width,d=c+1;indices.push(a,b,c,b,d,c);}
}
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
const floor=new THREE.Mesh(geometry),sidewalks=buildDesignatedSidewalks(world,createWalkingEnvironment(world).isFree);
global.gc?.();const heapBefore=process.memoryUsage().heapUsed;const buildStart=performance.now();registerGroundSurfaces(world,[floor,...sidewalks.children]);const compileMs=performance.now()-buildStart;global.gc?.();const indexHeapBytes=process.memoryUsage().heapUsed-heapBefore;
const queries=[];
for(let frame=0;frame<180;frame++)for(const place of world.communityLocations)for(let i=0;i<64;i++)queries.push([place.position[0]+Math.sin(frame*.03)*.3+(i%8-3.5)*.04,-place.position[1]+Math.cos(frame*.03)*.3+(Math.floor(i/8)-3.5)*.04]);
const timings=[];let checksum=0;
for(let run=0;run<9;run++){const start=performance.now();checksum=0;for(const [x,z] of queries)checksum+=groundSurfaceHeight(world,x,z);if(run>1)timings.push(performance.now()-start);}
timings.sort((a,b)=>a-b);console.log(JSON.stringify({queries:queries.length,medianMs:timings[3],minMs:timings[0],compileMs,indexHeapBytes,checksum,scope:'Actual district terrain and generated sidewalks; coherent foot-sized query batches, no rendering or kerb meshes.'}));
