// Local furnished-space authoring; deliberately distinct from publishable regions.
import { SPACE_KINDS, SPACE_FINISHES, SPACE_LIGHTING } from '../../../shared/studio-space-catalog.js';
export { SPACE_KINDS, SPACE_FINISHES, SPACE_LIGHTING };
const objectKeys = ['id','kind','label','east','north','width','depth','height','yaw','elevation','finish'];
const mutableKeys = objectKeys.filter(key => key !== 'id');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key));
const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const label = value => typeof value === 'string' && value.trim() === value && value.length > 0 && [...value].length <= 64 && !/[\p{Cc}\p{Cf}]/u.test(value);
export const isSpaceDocument = value => value?.document_type === 'studio-space';
export const spaceObjectBlocks = item => !['floor','rug','art','pendant'].includes(item.kind) && item.elevation < 1.8 && item.elevation + item.height > .25;
export function spaceFootprint(item) {
  const a=item.yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[item.east+x*item.width/2*c-y*item.depth/2*s,item.north+x*item.width/2*s+y*item.depth/2*c]);
}
export function spacePointClear(space, [east,north], radius=.35) {
  const [w,s,e,n]=space.bounds_m;
  return east>=w+radius && east<=e-radius && north>=s+radius && north<=n-radius && space.objects.every(item=>{
    if(!spaceObjectBlocks(item))return true;
    const angle=item.yaw*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dx=east-item.east,dy=north-item.north;
    const x=Math.max(0,Math.abs(dx*c+dy*s)-item.width/2),y=Math.max(0,Math.abs(-dx*s+dy*c)-item.depth/2);
    return Math.hypot(x,y)>=radius;
  });
}
export function validateSpace(space) {
  if(!keys(space,['schema_version','document_type','name','lighting','bounds_m','spawn','objects']) || !isSpaceDocument(space) || space.schema_version!==1
    || !label(space.name) || !SPACE_LIGHTING.includes(space.lighting)
    || !Array.isArray(space.bounds_m) || space.bounds_m.length!==4 || !space.bounds_m.every(v=>number(v,-1000,1000))
    || !number(space.bounds_m[2]-space.bounds_m[0],8,64) || !number(space.bounds_m[3]-space.bounds_m[1],8,64)
    || !Array.isArray(space.spawn) || space.spawn.length!==2 || !space.spawn.every(Number.isFinite)
    || !Array.isArray(space.objects) || space.objects.length>160)throw Error('Use a valid furnished space with up to 160 objects and bounds of 8–64 metres.');
  const ids=new Set(),[w,s,e,n]=space.bounds_m;
  for(const item of space.objects){
    if(!keys(item,objectKeys) || typeof item.id!=='string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || item.id.length>48 || ids.has(item.id)
      || !SPACE_KINDS.includes(item.kind) || !SPACE_FINISHES.includes(item.finish) || !label(item.label)
      || !Number.isFinite(item.east) || !Number.isFinite(item.north) || !number(item.width,.01,30) || !number(item.depth,.01,30)
      || !number(item.height,.01,4) || !number(item.yaw,-180,180) || !number(item.elevation,0,4) || item.height+item.elevation>6
      || !spaceFootprint(item).every(([x,y])=>x>=w+.1&&x<=e-.1&&y>=s+.1&&y<=n-.1))throw Error('Keep furnishings inside the space with valid dimensions, finishes and unique IDs.');
    ids.add(item.id);
  }
  if(!spacePointClear(space,space.spawn))throw Error('Keep the arrival clear of walls and furniture.');
  return space;
}
export function spaceItems(space) {
  return [
    {id:'@arrival',type:'arrival',label:'Arrival',east:space.spawn[0],north:space.spawn[1]},
    {id:'@environment',type:'environment',label:'Lighting',lighting:space.lighting},
    ...space.objects.map(item=>({...item,type:'furnishing'})),
  ];
}
export function mutateSpace(space, op, id, patch = {}, { validateResult = true } = {}) {
  const next=structuredClone(space);
  if(!plain(patch))throw Error('Use object properties.');
  if(op==='update' && id==='@arrival'){
    if(!keys(patch,['east','north']))throw Error('That arrival property cannot be edited.');
    next.spawn=[Object.hasOwn(patch,'east')?patch.east:next.spawn[0],Object.hasOwn(patch,'north')?patch.north:next.spawn[1]];
  }else if(op==='update' && id==='@environment'){
    if(!keys(patch,['lighting']))throw Error('Choose a lighting preset.');
    next.lighting=Object.hasOwn(patch,'lighting')?patch.lighting:next.lighting;
  }else if(op==='add'){
    if(id!=='furnishing' || !keys(patch,mutableKeys))throw Error('Add a furnishing to a space.');
    let index=1;while(next.objects.some(item=>item.id===`furnishing-${index}`))index++;
    id=`furnishing-${index}`;
    next.objects.push({id,kind:'chair',label:'New furnishing',east:0,north:0,width:.7,depth:.7,height:.9,yaw:0,elevation:0,finish:'oak',...patch});
  }else{
    const item=next.objects.find(item=>item.id===id);
    if(!item)throw Error('Select an existing furnishing. Arrival and lighting must stay.');
    if(op==='update'){
      if(!keys(patch,mutableKeys))throw Error('That property cannot be edited.');
      Object.assign(item,patch);
    }else if(op==='remove')next.objects=next.objects.filter(item=>item.id!==id);
    else throw Error('Unsupported space edit.');
  }
  return {value:validateResult ? validateSpace(next) : next,id};
}

// Match Three's positive Y rotation, after converting scene Z back to north.
export function buildSpaceWorld(space) {
  const [west,south,east,north] = space.bounds_m;
  const collisionPolygons = space.objects.filter(spaceObjectBlocks).map(spaceFootprint);
  return {
    bounds_m: [...space.bounds_m], terrain: { width: 2, height: 2, grid_origin_m: [west,south], spacing_m: [east-west,north-south], heights_m: [0,0,0,0] },
    walkSurfaceOffset: 0, walkSpawn: [...space.spawn,0], collisionPolygons, buildings: [], stores: [],
  };
}
