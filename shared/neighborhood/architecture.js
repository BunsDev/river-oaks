import {compileStreetscape} from '../streetscape-kit.js';
import snapshot from '../../config/neighborhoods/kit-snapshot.json' with {type:'json'};
import {hash,order} from './format.js';
import {footprint,polygonsOverlap} from './polygon.js';

const KIT = snapshot.files.find(item=>item.path==='shared/streetscape-kit.js').sha256;
const supported = size => Array.isArray(size)&&size.length===3&&size[0]>=8&&size[0]<=32&&size[0]%4===0&&size[1]>=12&&size[1]<=20&&size[2]>=7.65&&size[2]<=15;
export function normalizeArchitecture(value,templates) {
  const fail=reason=>{throw Error(`Invalid neighborhood architecture: ${reason}`);};
  if(!value||value.schema_version!==1||Object.keys(value).some(k=>!['schema_version','bindings'].includes(k))||!Array.isArray(value.bindings)||value.bindings.length!==templates.length)fail('bind every template exactly once');
  const ids=new Set();
  for(const binding of value.bindings){
    const template=templates.find(t=>t.id===binding?.templateId);
    if(!template||ids.has(binding.templateId)||Object.keys(binding).some(k=>!['templateId','assembly','palette'].includes(k))
      ||!['shop-row','court-shells'].includes(binding.assembly)||!['market','court'].includes(binding.palette))fail('template, assembly or palette');
    if(!supported(template.size))fail(`template ${template.id} dimensions require 4 m bays, width 8–32 m, depth 12–20 m and height 7.65–15 m`);
    ids.add(binding.templateId);
  }
  return {schema_version:1,bindings:structuredClone(value.bindings).sort((a,b)=>a.templateId<b.templateId?-1:1)};
}
export function architectureFor(recipe,templateId,facing=0) {
  const binding=recipe.architecture?.bindings.find(item=>item.templateId===templateId);
  return binding?{architecture:{...structuredClone(binding),kit_sha256:KIT,facing_deg:facing,size:[...recipe.templates.find(t=>t.id===templateId).size]}}:{};
}
export function architectureFacing(building,road){
  const front=nearestPoint(road,building.center),a=building.yaw_deg*Math.PI/180;
  return front&&-(front[0]-building.center[0])*Math.sin(a)+(front[1]-building.center[1])*Math.cos(a)>0?180:0;
}
function nearestPoint(road,center){
  let best=null,distance=Infinity;
  for(let i=1;i<(road?.points.length??0);i++){
    const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((center[0]-a[0])*dx+(center[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
    const point=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(point[0]-center[0],point[1]-center[1]);
    if(d<distance){distance=d;best=point;}
  }return best;
}
function terrainRange(terrain,ring){
  const [ox,oy]=terrain.grid_origin_m,[dx,dy]=terrain.spacing_m;
  const xs=ring.map(p=>(p[0]-ox)/dx),ys=ring.map(p=>(p[1]-oy)/dy);
  const column=x=>Math.max(0,Math.min(terrain.width-2,Math.floor(x)));
  const row=y=>Math.max(0,Math.min(terrain.height-2,Math.floor(y)));
  let low=Infinity,high=-Infinity;
  // Every intersecting cell is bounded by its four vertices for both bilinear
  // walking heights and rendered triangles. This intentionally errs toward a
  // foundation fallback where a steep cell only partly intersects the envelope.
  for(let y=row(Math.min(...ys));y<=row(Math.max(...ys));y++)for(let x=column(Math.min(...xs));x<=column(Math.max(...xs));x++){
    const cell=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]].map(([cx,cy])=>[ox+cx*dx,oy+cy*dy]);
    if(!polygonsOverlap({ring},cell))continue;
    for(const index of [y*terrain.width+x,y*terrain.width+x+1,(y+1)*terrain.width+x,(y+1)*terrain.width+x+1]){
      low=Math.min(low,terrain.heights_m[index]);high=Math.max(high,terrain.heights_m[index]);
    }
  }
  return [low,high];
}
export function compileNeighborhoodArchitecture(artifact,{region=artifact.region}={}) {
  const instances=[],diagnostics=[],fallbackIds=[],collisionPolygons=[],supportSurfaces=[],sockets=[];
  const [w,s,e,n]=region.bounds_m,terrain={...region.terrain,grid_origin_m:[w,s],spacing_m:[(e-w)/(region.terrain.width-1),(n-s)/(region.terrain.height-1)]};
  let modules=0,parts=0;
  const fallback=(building,message)=>{fallbackIds.push(building.id);collisionPolygons.push(footprint(building));diagnostics.push({severity:'warning',code:'architecture-fallback',id:building.id,message:`${message} Authored geometry is retained as its original Studio blockout.`});};
  for(const building of [...region.buildings].sort(order)){
    const placement=artifact.placements.find(p=>p.id===building.id),binding=placement?.architecture;
    if(!binding){fallback(building,'No architectural assignment.');continue;}
    if(binding.kit_sha256!==KIT){fallback(building,'This approved kit revision is unavailable; restore its recorded source.');continue;}
    if(!supported(building.size)||building.interior||JSON.stringify(building.size)!==JSON.stringify(binding.size)
      ||!['shop-row','court-shells'].includes(binding.assembly)||!['market','court'].includes(binding.palette)||![0,180].includes(binding.facing_deg)){
      fallback(building,'Fixed modules do not support this authored size, assignment or custom interior.');continue;
    }
    const a=building.yaw_deg*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
    const transform=([x,y])=>[building.center[0]+x*c-y*sn,building.center[1]+x*sn+y*c];
    const [lowTerrain,highTerrain]=terrainRange(terrain,footprint(building));
    if(highTerrain-lowTerrain>.15){fallback(building,'Terrain cells intersecting the envelope vary by more than 0.15 m; author a foundation before using this kit.');continue;}
    const altitude=highTerrain,facing=binding.facing_deg,count=building.size[0]/4;
    const placements=Array.from({length:count},(_,i)=>({id:`bay-${i}`,module:binding.assembly==='court-shells'||i===0?'shell':'storefront',
      position:[(i-(count-1)/2)*4,0,0],rotation:facing,palette:binding.palette}));
    if(modules+placements.length>256)throw Error('Neighborhood architecture exceeds 256 fixed modules. Reduce the candidate.');
    const plan=compileStreetscape({id:`building-${hash(building.id).slice(0,16)}`,placements});
    const [left,bottom,low,right,top,high]=plan.bounds;
    if(left < -building.size[0]/2-1e-6||right>building.size[0]/2+1e-6||bottom < -building.size[1]/2-1e-6||top>building.size[1]/2+1e-6||low<0||high>building.size[2]+1e-6)throw Error(`Architecture exceeds building envelope: ${building.id}`);
    modules+=placements.length;parts+=plan.parts.length;
    instances.push({id:building.id,templateId:placement.templateId,assembly:binding.assembly,palette:binding.palette,position:[...building.center,altitude],yaw_deg:building.yaw_deg,plan});
    collisionPolygons.push(...plan.collisionRings.map(ring=>ring.map(transform)));
    supportSurfaces.push(...plan.supportSurfaces.map(surface=>({...surface,ring:surface.ring.map(transform),height:altitude+surface.height})));
    sockets.push(...plan.sockets.map(socket=>({...socket,buildingId:building.id,position:[...transform(socket.position),altitude+socket.position[2]],rotation:socket.rotation+building.yaw_deg})));
  }
  return {schema_version:1,artifact_sha256:artifact.sha256,kit:snapshot,instances,fallbackIds,collisionPolygons,supportSurfaces,sockets,diagnostics,
    counts:{buildings:instances.length,modules,parts,fallbacks:fallbackIds.length}};
}
