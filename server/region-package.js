import { createHash } from 'node:crypto';
import { terrainHeight } from '../preview/src/geometry.js';
import { createWalkingEnvironment } from '../preview/src/walking.js';

export const MAX_REGION_REQUEST_BYTES = 128 * 1024;
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const keys=(value,allowed)=>record(value) && Object.keys(value).every(key=>allowed.includes(key));
const finite=(value,min,max)=>Number.isFinite(value) && value>=min && value<=max;
const slug=value=>typeof value==='string' && value.length<=48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const label=value=>typeof value==='string' && value===value.trim() && [...value].length>0 && [...value].length<=64
  && !/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(value);
const pair=value=>Array.isArray(value) && value.length===2 && value.every(Number.isFinite);
const fail=()=>{throw new Error('Invalid creator region package');};

/** Compile a bounded, creator-authored local-metre map into the shared district contract. */
export function compileRegionPackage(region,title) {
  if(!label(title) || !keys(region,['schema_version','bounds_m','terrain','spawn','roads','buildings','trees','places'])
    || region.schema_version!==1 || !Array.isArray(region.bounds_m) || region.bounds_m.length!==4)fail();
  const [west,south,east,north]=region.bounds_m;
  if(![west,south,east,north].every(value=>finite(value,-10000,10000))
    || east-west<40 || north-south<40 || east-west>512 || north-south>512)fail();
  const inBounds=([x,y],margin=0)=>x>=west+margin && x<=east-margin && y>=south+margin && y<=north-margin;
  const position=value=>pair(value) && inBounds(value,1);
  const terrain=region.terrain;
  if(!keys(terrain,['width','height','heights_m']) || !Number.isInteger(terrain.width) || !Number.isInteger(terrain.height)
    || terrain.width<5 || terrain.width>65 || terrain.height<5 || terrain.height>65
    || !Array.isArray(terrain.heights_m) || terrain.heights_m.length!==terrain.width*terrain.height
    || !terrain.heights_m.every(value=>finite(value,-50,500)))fail();
  const surface={grid_origin_m:[west,south],spacing_m:[(east-west)/(terrain.width-1),(north-south)/(terrain.height-1)],
    width:terrain.width,height:terrain.height,heights_m:[...terrain.heights_m]};
  const altitude=point=>terrainHeight(surface,point[0],point[1]);
  if(!position(region.spawn))fail();
  for(const [name,min,max] of [['roads',1,64],['buildings',0,80],['trees',0,256],['places',4,64]])
    if(!Array.isArray(region[name]) || region[name].length<min || region[name].length>max)fail();
  const unique=new Set();
  const takeId=id=>{if(!slug(id)||unique.has(id))fail();unique.add(id);return id;};
  const roads=region.roads.map(road=>{
    if(!keys(road,['id','name','kind','width_m','points']) || !label(road.name) || !['residential','footway'].includes(road.kind)
      || !finite(road.width_m,road.kind==='footway'?2:6,road.kind==='footway'?8:16)
      || !Array.isArray(road.points) || road.points.length<2 || road.points.length>128
      || !road.points.every(position))fail();
    const points=road.points.map(point=>[...point,altitude(point)]);
    if(points.every((point,index)=>index===0 || Math.hypot(point[0]-points[index-1][0],point[1]-points[index-1][1])<.1))fail();
    return {id:takeId(road.id),name:road.name,kind:road.kind,width_m:road.width_m,points};
  });
  const buildings=region.buildings.map(building=>{
    if(!keys(building,['id','center','size','yaw_deg','kind']) || !position(building.center)
      || !Array.isArray(building.size) || building.size.length!==3
      || !finite(building.size[0],4,80) || !finite(building.size[1],4,80) || !finite(building.size[2],5.5,50)
      || !finite(building.yaw_deg,-180,180) || !['retail','residential','parking'].includes(building.kind))fail();
    const [x,y]=building.center,[width,depth,height]=building.size,angle=building.yaw_deg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    const ring=[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]]
      .map(([dx,dy])=>[x+dx*c-dy*s,y+dx*s+dy*c]);
    if(!ring.every(point=>inBounds(point,1)))fail();
    ring.push([...ring[0]]);
    return {id:takeId(building.id),center:[x,y,altitude(building.center)],ring,size:[width,depth,height],yaw_deg:building.yaw_deg,kind:building.kind};
  });
  const trees=region.trees.map(tree=>{
    if(!keys(tree,['id','position','height_m','crown_radius_m']) || !position(tree.position)
      || !finite(tree.height_m,2,35) || !finite(tree.crown_radius_m,.5,10))fail();
    return {id:takeId(tree.id),position:[...tree.position,altitude(tree.position)],height_m:tree.height_m,
      crown_radius_m:tree.crown_radius_m,species:'creator tree',source:'Creator-authored region'};
  });
  const communityLocations=region.places.map(place=>{
    if(!keys(place,['id','name','position']) || !label(place.name) || !position(place.position))fail();
    return {id:takeId(place.id),name:place.name,position:[...place.position,altitude(place.position)]};
  });
  const hash=createHash('sha256').update(JSON.stringify(region)).digest('hex');
  const world={schema_version:1,scene:'district',title,address:'Creator-authored region',origin:[0,0],crs:'LOCAL:METRES',
    bounds_m:[west,south,east,north],site_ring:[[west,south],[east,south],[east,north],[west,north],[west,south]],
    buildings,roads,trees,parcels:[],stores:[],terrain:surface,walkSurfaceOffset:0,walkSpawn:[...region.spawn,altitude(region.spawn)],
    collisionPolygons:buildings.map(building=>building.ring),communityLocations,
    provenance:{kind:'creator',source:'Creator-authored region package',source_sha256:hash,attribution:'World creator'},
    limitations:['This region and its geography were supplied by its creator.'],
    walkLookAt:[...roads[0].points[1]],street_design:{version:1,minimum_curb_width_m:8.4,clear_lane_width_m:3.5904,gutters_m:.6096,basis:'Creator-authored roads.'}};
  const environment=createWalkingEnvironment(world);
  if(!environment.isFree(region.spawn[0],-region.spawn[1]))fail();
  return world;
}

/** Recover an editable v1 package from a previously compiled creator world. */
export function editableRegionFromWorld(world) {
  if(world?.provenance?.kind!=='creator' || !Array.isArray(world.bounds_m) || !world.terrain)throw new Error('World is not an editable creator region');
  const source={schema_version:1,bounds_m:[...world.bounds_m],
    terrain:{width:world.terrain.width,height:world.terrain.height,heights_m:[...world.terrain.heights_m]},
    spawn:world.walkSpawn.slice(0,2),
    roads:world.roads.map(road=>({id:road.id,name:road.name,kind:road.kind,width_m:road.width_m,points:road.points.map(point=>point.slice(0,2))})),
    buildings:world.buildings.map(building=>({id:building.id,center:building.center.slice(0,2),size:[...building.size],yaw_deg:building.yaw_deg,kind:building.kind})),
    trees:world.trees.map(tree=>({id:tree.id,position:tree.position.slice(0,2),height_m:tree.height_m,crown_radius_m:tree.crown_radius_m})),
    places:world.communityLocations.map(place=>({id:place.id,name:place.name,position:place.position.slice(0,2)}))};
  compileRegionPackage(source,world.title);
  return source;
}
