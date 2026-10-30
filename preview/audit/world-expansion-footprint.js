// Source geometry inventory, not a claim of reachable or legally accessible land.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadDistrictData } from '../../server/district-data.js';
import { DISTRICT_REVISION_GARDENS, districtRevisionOf } from '../src/garden-campus-district.js';
import { createWalkingEnvironment, createWalkingState } from '../src/walking.js';
import { createResidentNavigation } from '../src/navigation.js';
import { validateWorldManifest, locationWorldBounds } from '../src/world-manifest.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION } from '../../shared/bayou-heights-layout.js';
import { STUDEWOOD_REVISION } from '../../shared/studewood-layout.js';
import { TERRACES_REVISION } from '../../shared/bayou-terraces-layout.js';
import { WOODLAND_REVISION } from '../../shared/woodland-heights-layout.js';
import { TYPESAFE_REVISION } from '../../shared/typesafe-place-layout.js';
const districtBytes = await readFile(new URL('../public/data/district.json', import.meta.url));
const world = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS });
const manifest = validateWorldManifest(JSON.parse(await readFile(new URL('../public/data/world-manifest.json', import.meta.url))));
const area = ([w,s,e,n]) => (e-w)*(n-s);
const polygonArea = ring => Math.abs(ring.reduce((sum, a, i) => {
  const b = ring[(i+1)%ring.length]; return sum + a[0]*b[1] - b[0]*a[1];
}, 0))/2;
const [west,south,east,north] = world.bounds_m;
const width = Math.floor(east-west)+1, height = Math.floor(north-south)+1;
const nav = createResidentNavigation(world), environment = createWalkingEnvironment(world);
const candidates = world.roads.filter(road => road.kind === 'footway')
  .flatMap(road => [road.points[0],road.points.at(-1)].map(point => ({ roadId:road.id, point:point.slice(0,2) })))
  .filter(item => item.point[0] > east-10);
const report = {
  districtSha256:createHash('sha256').update(districtBytes).digest('hex'), districtRevision:districtRevisionOf(world),
  units:'metres', bounds:world.bounds_m, widthM:east-west, depthM:north-south,
  boundsAreaM2:area(world.bounds_m), sitePolygonAreaM2:polygonArea(world.site_ring),
  residentGrid:{width,height,cells:width*height,limit:80000,created:Boolean(nav)},
  locations:manifest.locations.map(location => ({id:location.id,status:location.status,worldBounds:locationWorldBounds(location),boundsAreaM2:area(locationWorldBounds(location))})),
  eastFootwayEndpoints:candidates.map(candidate=>({...candidate, residentFree:nav?.free(candidate.point) ?? false, playerFree:environment.isFree(candidate.point[0],-candidate.point[1])})),
  scope:'Exact source rectangle/polygon area and current resident-navigation endpoint queries only. Neither polygon area nor collision-free endpoint samples measure connected playable area. No browser ground-triangle registration, dynamic placed objects, timed traversal, physical access or survey evidence.',
};
// Optional, bounded ground-level estimate. Flood only traversable cardinal grid
// edges from the actual walking spawn; sample each edge at <= 10 cm. Upper levels,
// flying, travel commands and disconnected islands do not contribute to this area.
function reachableSample(data, cell) {
  const started = performance.now(), env = createWalkingEnvironment(data);
  const [w,s,e,n] = data.bounds_m, west = Math.floor(w / cell) * cell, south = Math.floor(s / cell) * cell;
  const width = Math.floor((e - west) / cell) + 1, height = Math.floor((n - south) / cell) + 1, size = width * height;
  if (size > 1000000) throw new Error('Reachability audit exceeds its one-million-cell budget');
  const occupancy = new Int8Array(size), heights = new Float64Array(size), visited = new Uint8Array(size), queue = new Int32Array(size);
  const point = id => [west + (id % width) * cell, south + Math.floor(id / width) * cell];
  const free = id => {
    if (!occupancy[id]) { const [x,y] = point(id); heights[id] = env.groundAt(x,-y); occupancy[id] = env.isFree(x,-y) && Number.isFinite(heights[id]) ? 1 : -1; }
    return occupancy[id] === 1;
  };
  const clear = (a,b) => {
    const length = Math.hypot(b[0]-a[0], b[1]-a[1]), steps = Math.max(1,Math.ceil(length/.1));
    let previous = env.groundAt(a[0],-a[1]);
    for (let i=0;i<=steps;i++) {
      const x=a[0]+(b[0]-a[0])*i/steps, y=a[1]+(b[1]-a[1])*i/steps, h=env.groundAt(x,-y);
      if (!env.isFree(x,-y) || !Number.isFinite(h) || Math.abs(h-previous)>=.4) return false;
      previous=h;
    }
    return true;
  };
  const pose = createWalkingState(env,env.spawn).position, spawn = [pose[0],-pose[2]];
  const sx=Math.round((spawn[0]-west)/cell), sy=Math.round((spawn[1]-south)/cell);
  let seed=-1, best=Infinity;
  for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++) {
    const x=sx+dx,y=sy+dy;if(x<0||x>=width||y<0||y>=height)continue;
    const id=x+y*width,p=point(id),distance=Math.hypot(p[0]-spawn[0],p[1]-spawn[1]);
    if(distance<best&&free(id)&&clear(spawn,p)){seed=id;best=distance;}
  }
  if(seed<0)throw new Error('No sampled cell connects to the walking spawn');
  let head=0,tail=1;queue[0]=seed;visited[seed]=1;
  while(head<tail) {
    const id=queue[head++],x=id%width,y=Math.floor(id/width),a=point(id);
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      if(x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
      const next=id+dx+dy*width;
      if(visited[next]||!free(next)||!clear(a,point(next)))continue;
      visited[next]=1;queue[tail++]=next;
    }
  }
  return { revision:districtRevisionOf(data), worldSha256:createHash('sha256').update(JSON.stringify(data)).digest('hex'), cellM:cell,
    gridCells:size, reachableSamples:tail, sampledAreaM2:tail*cell*cell, spawn, seconds:(performance.now()-started)/1000 };
}
if(process.argv.includes('--reachable')) {
  const expanded=await loadDistrictData({districtRevision:COMMONS_REVISION}), garage=await loadDistrictData();
  const connected=await loadDistrictData({districtRevision:HEIGHTS_REVISION}),beyond=await loadDistrictData({districtRevision:STUDEWOOD_REVISION}),banks=await loadDistrictData({districtRevision:TERRACES_REVISION});
  const woods=await loadDistrictData({districtRevision:WOODLAND_REVISION}),place=await loadDistrictData({districtRevision:TYPESAFE_REVISION});
  report.groundReachability=[];
  for(const cell of [1,.5]) {
    const original=reachableSample(world,cell),commons=reachableSample(expanded,cell),defaultRevision=reachableSample(garage,cell);
    // Bayou Heights is reached only on foot over the footbridge from the same District spawn.
    const heights=reachableSample(connected,cell);
    // Studewood is reached on foot along Twentieth or Eighteenth Street from Heights Boulevard.
    const studewood=reachableSample(beyond,cell);
    // The Bayou Terraces are reached over their footbridges from the Heights greenway.
    const terraces=reachableSample(banks,cell);
    // Woodland Heights is reached on foot along Twentieth or Eighteenth Street from Studewood.
    const woodland=reachableSample(woods,cell);
    // TypeSafe Place is reached on foot along Twentieth or Eighteenth Street from Woodland Heights.
    // Its 0.5 m grid (1.11 million cells) exceeds the audit's cell budget, so it is sampled at 1 m only.
    const typesafe=cell>=1?reachableSample(place,cell):null;
    report.groundReachability.push({defaultRevision,original,commons,addedSampledAreaM2:commons.sampledAreaM2-original.sampledAreaM2,ratio:commons.sampledAreaM2/original.sampledAreaM2,
      heights,heightsAddedSampledAreaM2:heights.sampledAreaM2-commons.sampledAreaM2,heightsRatio:heights.sampledAreaM2/original.sampledAreaM2,
      studewood,studewoodAddedSampledAreaM2:studewood.sampledAreaM2-heights.sampledAreaM2,studewoodRatio:studewood.sampledAreaM2/original.sampledAreaM2,
      terraces,terracesAddedSampledAreaM2:terraces.sampledAreaM2-studewood.sampledAreaM2,terracesRatio:terraces.sampledAreaM2/original.sampledAreaM2,
      woodland,woodlandAddedSampledAreaM2:woodland.sampledAreaM2-terraces.sampledAreaM2,woodlandRatio:woodland.sampledAreaM2/original.sampledAreaM2,
      ...(typesafe&&{typesafe,typesafeAddedSampledAreaM2:typesafe.sampledAreaM2-woodland.sampledAreaM2,typesafeRatio:typesafe.sampledAreaM2/original.sampledAreaM2})});
  }
  // 3–5x is measured reachable ground. Project the remaining reserved envelopes at
  // the District's own measured density to show whether the layout can hold it.
  const fine=report.groundReachability.at(-1), baseline=fine.original.sampledAreaM2;
  const districtBounds=area(locationWorldBounds(manifest.locations.find(location=>location.id===manifest.default_location)));
  const density=baseline/districtBounds;
  const reservedM2=report.locations.filter(location=>location.status==='reserved').reduce((sum,location)=>sum+location.boundsAreaM2,0);
  const projected=fine.woodland.sampledAreaM2+reservedM2*density;
  report.expansionCapacity={baselineRevision:fine.original.revision,baselineM2:baseline,targetM2:{low:3*baseline,high:5*baseline},
    districtDensity:density,reservedBoundsM2:reservedM2,projectedTotalM2:projected,projectedRatio:projected/baseline,
    reservedBoundsNeededM2:{low:(3*baseline-fine.woodland.sampledAreaM2)/density,high:(5*baseline-fine.woodland.sampledAreaM2)/density},
    scope:'Projection assumes future neighborhoods match the District\'s measured walkable density; it is a layout sizing check, not measured area.'};
  report.reachabilityScope='Approximate ground-level area from connected sampled cell centres using authoritative collision/height queries. Samples have finite resolution; the full area of boundary cells is not proven clear, narrow routes may be missed, and source/rendered differences remain unmeasured. No upper-floor, flight, dynamic-object, physical accessibility or browser traversal acceptance. This does not establish the 3–5x playable-area target.';
}
await mkdir(new URL('../../.runtime/world-expansion/',import.meta.url),{recursive:true});
await writeFile(new URL('../../.runtime/world-expansion/footprint.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
