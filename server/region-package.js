import { createHash } from 'node:crypto';
import { terrainHeight } from '../preview/src/geometry.js';
import { createWalkingEnvironment } from '../preview/src/walking.js';
import { storefrontSpot } from '../preview/src/arrival.js';

export const MAX_REGION_REQUEST_BYTES = 128 * 1024;
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const keys=(value,allowed)=>record(value) && Object.keys(value).every(key=>allowed.includes(key));
const finite=(value,min,max)=>Number.isFinite(value) && value>=min && value<=max;
const slug=value=>typeof value==='string' && value.length<=48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const label=value=>typeof value==='string' && value===value.trim() && [...value].length>0 && [...value].length<=64
  && !/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(value);
const pair=value=>Array.isArray(value) && value.length===2 && value.every(Number.isFinite);
const fail=()=>{throw new Error('Invalid creator region package');};
const VENUE_CATEGORIES=['clothes','art','restaurant','wellness'];
const ENTRANCE_EDGES={south:0,east:1,north:2,west:3};

/** Compile a bounded, creator-authored local-metre map into the shared district contract. */
export function compileRegionPackage(region,title) {
  if(!label(title) || !keys(region,['schema_version','bounds_m','terrain','spawn','roads','buildings','trees','places','parcels'])
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
  if(region.parcels!==undefined && (!Array.isArray(region.parcels) || region.parcels.length>32))fail();
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
    if(!keys(building,['id','center','size','yaw_deg','kind','interior']) || !position(building.center)
      || !Array.isArray(building.size) || building.size.length!==3
      || !finite(building.size[0],4,80) || !finite(building.size[1],4,80) || !finite(building.size[2],5.5,50)
      || !finite(building.yaw_deg,-180,180) || !['retail','residential','parking'].includes(building.kind))fail();
    if(building.interior!==undefined && (building.size[0]<6 || building.size[1]<6
      || !keys(building.interior,['name','category','entrance','access']) || !label(building.interior.name)
      || !(building.kind==='retail' && VENUE_CATEGORIES.includes(building.interior.category)
        || building.kind==='residential' && building.interior.category==='home')
      || (building.interior.access!==undefined && (building.interior.category!=='home' || !['public','owner'].includes(building.interior.access)))
      || !Object.hasOwn(ENTRANCE_EDGES,building.interior.entrance)))fail();
    const [x,y]=building.center,[width,depth,height]=building.size,angle=building.yaw_deg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    const ring=[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]]
      .map(([dx,dy])=>[x+dx*c-dy*s,y+dx*s+dy*c]);
    if(!ring.every(point=>inBounds(point,1)))fail();
    ring.push([...ring[0]]);
    return {id:takeId(building.id),center:[x,y,altitude(building.center)],ring,size:[width,depth,height],yaw_deg:building.yaw_deg,kind:building.kind,
      ...(building.interior?{interior:{...building.interior}}:{})};
  });
  if(buildings.filter(building=>building.interior).length>8)fail();
  const stores=buildings.flatMap(building=>{
    if(!building.interior)return [];
    const edge=ENTRANCE_EDGES[building.interior.entrance],a=building.ring[edge],b=building.ring[edge+1];
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),outward=[(b[1]-a[1])/length,-(b[0]-a[0])/length];
    const door=[(a[0]+b[0])/2,(a[1]+b[1])/2],outside=[door[0]+outward[0]*1.2,door[1]+outward[1]*1.2];
    if(!inBounds(outside,0.5))fail();
    const facade=[...door,altitude(door)],visit=[...outside,altitude(outside)];
    return [{id:`venue-${building.id}`,name:building.interior.name,category:building.interior.category,
      position:[...building.center],facade,outward,visit,building_id:building.id,
      ...(building.interior.access==='owner'?{access:'owner'}:{})}];
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
  const parcels=[];
  for(const parcel of region.parcels??[]){
    if(!keys(parcel,['id','name','bounds_m','owner_id']) || !label(parcel.name)
      || !Array.isArray(parcel.bounds_m) || parcel.bounds_m.length!==4 || !parcel.bounds_m.every(Number.isFinite)
      || parcel.owner_id!==undefined && (typeof parcel.owner_id!=='string' || parcel.owner_id.length>160 || !/^[\w.-]+$/.test(parcel.owner_id)))fail();
    const [left,bottom,right,top]=parcel.bounds_m;
    if(right-left<6 || top-bottom<6 || !inBounds([left,bottom],1) || !inBounds([right,top],1)
      || parcels.some(other=>right>other.bounds_m[0] && left<other.bounds_m[2]
        && top>other.bounds_m[1] && bottom<other.bounds_m[3]))fail();
    parcels.push({id:takeId(parcel.id),name:parcel.name,bounds_m:[left,bottom,right,top],
      ring:[[left,bottom],[right,bottom],[right,top],[left,top],[left,bottom]],
      ...(parcel.owner_id?{ownerId:parcel.owner_id}:{})});
  }
  const hash=createHash('sha256').update(JSON.stringify(region)).digest('hex');
  const world={schema_version:1,scene:'district',title,address:'Creator-authored region',origin:[0,0],crs:'LOCAL:METRES',
    bounds_m:[west,south,east,north],site_ring:[[west,south],[east,south],[east,north],[west,north],[west,south]],
    buildings,roads,trees,parcels,stores,terrain:surface,walkSurfaceOffset:0,walkSpawn:[...region.spawn,altitude(region.spawn)],
    collisionPolygons:buildings.map(building=>building.ring),communityLocations,
    provenance:{kind:'creator',source:'Creator-authored region package',source_sha256:hash,attribution:'World creator'},
    limitations:['This region and its geography were supplied by its creator.'],
    walkLookAt:[...roads[0].points[1]],street_design:{version:1,minimum_curb_width_m:8.4,clear_lane_width_m:3.5904,gutters_m:.6096,basis:'Creator-authored roads.'}};
  const environment=createWalkingEnvironment(world);
  if(!environment.isFree(region.spawn[0],-region.spawn[1]))fail();
  if(environment.rooms.length!==stores.length)fail();
  for(const store of stores) {
    const room=environment.rooms.find(value=>value.storeId===store.id);
    const inside=room?.toWorld(0,2.4),outside=storefrontSpot(world,store,'arrive',{
      isFree:(x,z)=>environment.isFree(x,z) && !environment.roomAt(x,z)});
    if(!room || !inside || !environment.isFree(inside[0],-inside[1])
      || environment.roomAt(inside[0],-inside[1])?.storeId!==store.id
      || !inBounds(outside,0.5) || !environment.isFree(outside[0],-outside[1])
      || environment.roomAt(outside[0],-outside[1]))fail();
    store.visit=[outside[0],outside[1],altitude(outside)];
  }
  return world;
}

/** Recover an editable v1 package from a previously compiled creator world. */
export function editableRegionFromWorld(world) {
  if(world?.provenance?.kind!=='creator' || !Array.isArray(world.bounds_m) || !world.terrain)throw new Error('World is not an editable creator region');
  const source={schema_version:1,bounds_m:[...world.bounds_m],
    terrain:{width:world.terrain.width,height:world.terrain.height,heights_m:[...world.terrain.heights_m]},
    spawn:world.walkSpawn.slice(0,2),
    roads:world.roads.map(road=>({id:road.id,name:road.name,kind:road.kind,width_m:road.width_m,points:road.points.map(point=>point.slice(0,2))})),
    buildings:world.buildings.map(building=>({id:building.id,center:building.center.slice(0,2),size:[...building.size],yaw_deg:building.yaw_deg,kind:building.kind,
      ...(building.interior?{interior:{...building.interior}}:{})})),
    trees:world.trees.map(tree=>({id:tree.id,position:tree.position.slice(0,2),height_m:tree.height_m,crown_radius_m:tree.crown_radius_m})),
    places:world.communityLocations.map(place=>({id:place.id,name:place.name,position:place.position.slice(0,2)})),
    parcels:(world.parcels??[]).map(parcel=>({id:parcel.id,name:parcel.name,bounds_m:[...parcel.bounds_m],
      ...(parcel.ownerId?{owner_id:parcel.ownerId}:{})}))};
  compileRegionPackage(source,world.title);
  return source;
}
