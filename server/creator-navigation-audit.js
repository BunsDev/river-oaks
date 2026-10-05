// Local route CPU probe; no GPU, hosted service, network, or global acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { cpus,loadavg } from 'node:os';
import { createResidentNavigation } from '../preview/src/navigation.js';
import { newObjectPart,objectCollider,validAssembly } from '../preview/src/creator-object.js';
import { createWalkingEnvironment } from '../preview/src/walking.js';
import { buildRoads,checkBuildSite,buildGeometry } from '../preview/src/shared-build.js';

const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1];
const assembly={name:'Navigation capacity probe',parts:Array.from({length:16},(_,i)=>({...newObjectPart(),
  size:[.4,.2,.4],position:[(i%4-1.5)*.5,.1+Math.floor(i/4)*.4,0]}))};
assert.ok(validAssembly(assembly));
const definition={kind:'object',assembly},geometry=buildGeometry(definition);
const synthetic={scene:'district',bounds_m:[-40,-40,40,40],roads:[],collisionPolygons:[]};
const syntheticItems=Array.from({length:48},(_,i)=>({...definition,id:`probe-${i}`,
  position:[(i%8-3.5)*7,(Math.floor(i/8)-2.5)*7],ground:0,yaw:0}));
const district=JSON.parse(await readFile(new URL('../preview/public/data/district.json',import.meta.url)));
district.vegetation=JSON.parse(await readFile(new URL('../preview/public/data/district-vegetation.json',import.meta.url)));
const environment=createWalkingEnvironment(district),roads=buildRoads(district),districtItems=[];
const staticNavigation=createResidentNavigation(district);
const stops=district.communityLocations.map(stop=>staticNavigation.sidewalkPoint(stop.position)).filter(point=>staticNavigation.free(point));
// Spread valid whole-footprint placements across the district rather than
// overlapping roots or covering the destination anchors.
const [west,south,east,north]=district.bounds_m;
for(let y=south+5;y<north-5&&districtItems.length<48;y+=6)for(let x=west+5;x<east-5&&districtItems.length<48;x+=6){
  const position=[x,y];
  if(!staticNavigation.free(position)||environment.roomAt(x,-y)||stops.some(p=>Math.hypot(p[0]-x,p[1]-y)<3))continue;
  const site=checkBuildSite({environment,roads,position,kind:geometry,builds:districtItems});
  if(site.ground!==undefined)districtItems.push({...definition,id:`probe-${districtItems.length}`,position,ground:site.ground,yaw:0});
}
assert.equal(districtItems.length,48,'district probe requires all 48 valid roots');
function measure(world,items,pairs){
  const objects=items.map(objectCollider),nav=createResidentNavigation(world,{placedObjects:objects});
  const samples=[],routes=[];
  for(let i=0;i<10;i++){
    const [start,end]=pairs[i%pairs.length];
    nav.invalidate();
    let before=performance.now();const route=nav.route(start,end);const afterDynamicResetMs=performance.now()-before;
    assert.ok(route?.length,'all probe destinations stay reachable');
    let previous=start;
    for(const point of route){assert.ok(nav.canTravel(previous,point),'whole route clears geography and assemblies');previous=point;}
    before=performance.now();assert.ok(nav.route(start,end)?.length);const warmMs=performance.now()-before;
    samples.push({afterDynamicResetMs,warmMs,waypoints:route.length});routes.push({start,end,waypoints:route.length});
  }
  // Removing the assembly set must release its cached occupancy and links.
  nav.setPlacedObjects([]);
  for(const [start,end]of pairs)assert.ok(nav.route(start,end)?.length);
  return {roots:items.length,parts:items.length*assembly.parts.length,samples,
    dynamicResetP95Ms:percentile(samples.map(s=>s.afterDynamicResetMs),.95),warmP95Ms:percentile(samples.map(s=>s.warmMs),.95),
    maxDynamicResetMs:Math.max(...samples.map(s=>s.afterDynamicResetMs)),routes:routes.slice(0,pairs.length),removalRecovered:true};
}
const pairs=[];
for(const start of stops.slice(0,4)){
  const end=stops.filter(p=>p!==start).sort((a,b)=>Math.hypot(b[0]-start[0],b[1]-start[1])-Math.hypot(a[0]-start[0],a[1]-start[1]))
    .find(end=>staticNavigation.route(start,end));
  assert.ok(end);pairs.push([start,end]);
}
const baseline=measure(district,[],pairs),populated=measure(district,districtItems,pairs);
const dense=measure(synthetic,syntheticItems,[[[-35,-35],[35,35]],[[-35,35],[35,-35]]]);
const files=['preview/src/navigation.js','preview/src/creator-object.js','preview/src/walking.js','preview/src/resident-life.js',
  'server/world.js','server/creator-navigation-audit.js','preview/public/data/district.json','preview/public/data/district-vegetation.json'];
const report={createdAt:new Date().toISOString(),status:'passed',
  scope:'Local Node CPU route searches with valid static district placements and synthetic maximum assemblies. Not shared tick latency, GPU/frame time, hosted capacity, regional latency, or physical-device acceptance.',
  machine:{node:process.version,cpu:cpus()[0]?.model,loadAverage:loadavg()},
  limits:{verifiedCreatorAccounts:2,rootsPerAccount:24,partsPerRoot:16,sharedNPCs:98,soloNPCs:193,playerCap:32},
  probes:{districtBaseline:baseline,districtMaximumAssemblies:populated,denseSyntheticMaximumAssemblies:dense},
  assertions:['Every measured route remains reachable and each whole segment clears confirmed geometry.',
    'Dynamic reset samples invalidate assembly occupancy/edges, retain static geography caches, and rebuild the object index. Each probe begins with fresh static caches; later samples reuse them.',
    'Removing assemblies releases navigation occupancy.'],
  gaps:['Local route CPU timing is not a hosted SLA or global capacity sign-off.',
    'Maximum-assembly GPU, physical devices and multi-region soak remain unverified.'],
  sha256:Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex')])))};
const output=process.argv[2]??'data/reports/creator-navigation.json';
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.probes).map(([key,value])=>[key,{roots:value.roots,parts:value.parts,dynamicResetP95Ms:value.dynamicResetP95Ms,warmP95Ms:value.warmP95Ms}])),null,2));
