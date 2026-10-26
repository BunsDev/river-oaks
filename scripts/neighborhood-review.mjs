#!/usr/bin/env node
// Bounded, reproducible authoring review. Writes only a new local evidence directory.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Box3} from 'three';
import {buildNeighborhood,validateAuthoringArtifact,canonical} from '../shared/neighborhood/preserve.js';
import {createStudioScene,disposeStudioScene} from '../preview/src/studio/scene.js';
import {createWalkingEnvironment,createWalkingState,stepWalking,steerWalkingToward} from '../preview/src/walking.js';
import {createDistrict} from '../preview/src/studio/templates.js';
import {neighborhoodSource} from './neighborhood-source.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.argv[2]&&resolve(process.argv[2]);
if(!output||process.argv.length!==3)throw Error('Usage: node scripts/neighborhood-review.mjs NEW_EVIDENCE_DIRECTORY');
mkdirSync(output); // No overwrite of prior evidence.
const read=path=>JSON.parse(readFileSync(path));
const write=(name,value)=>writeFileSync(join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const hash=value=>createHash('sha256').update(value).digest('hex');
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const point=state=>[state.position[0],-state.position[2]];
const project=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return [a[0]+t*dx,a[1]+t*dy];};
const failures=[];
function walk(env,start,targets,{dt=1/60,negative=false}={}){
  assert.ok(env.isFree(start[0],-start[1]),'Route must start free; spawn recovery is not traversal');
  const state=createWalkingState(env,start);assert.ok(distance(point(state),start)<1e-9);
  let frames=0,blockedQueries=0;const firstBlockedPositions=[];
  const probe={...env,isFree:(x,z)=>{const free=env.isFree(x,z);if(!free){blockedQueries++;if(firstBlockedPositions.length<3)firstBlockedPositions.push([x,-z]);}return free;}};
  for(const target of targets){
    const budget=Math.ceil((distance(point(state),target)/1.65+8)/dt);
    let count=0;
    while(distance(point(state),target)>.12&&count++<budget){stepWalking(state,probe,steerWalkingToward(state,target,dt),dt);frames++;}
    if(distance(point(state),target)>.12)return {passed:negative&&blockedQueries>0,start,end:point(state),target,error_m:distance(point(state),target),blockedQueries,firstBlockedPositions,frames,dt};
  }
  return {passed:!negative,start,end:point(state),target:targets.at(-1),error_m:distance(point(state),targets.at(-1)),blockedQueries,frames,dt};
}
function inspect(id,region,artifact){
  const scene=createStudioScene(region,'light',artifact),env=createWalkingEnvironment(scene.world),routes=[];
  const route=(name,start,targets,options)=>{
    const result={name,...walk(env,start,targets,options)};routes.push(result);
    if(!result.passed)failures.push({candidate:id,...result});
  };
  try{
    const edges=region.roads.flatMap(road=>road.points.slice(1).map((b,i)=>({road:road.id,a:road.points[i],b,width:road.width_m})));
    const nearest=p=>edges.map(e=>({...e,point:project(p,e.a,e.b)})).sort((a,b)=>distance(p,a.point)-distance(p,b.point))[0];
    const graph=new Map();
    for(const e of edges)for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){const key=a.join(',');if(!graph.has(key))graph.set(key,new Set());graph.get(key).add(b.join(','));}
    const visited=new Set(),queue=[graph.keys().next().value];
    while(queue.length){const id=queue.pop();if(visited.has(id))continue;visited.add(id);queue.push(...graph.get(id));}
    assert.equal(visited.size,graph.size,`${id}: disconnected street graph`);
    for(const [i,e] of edges.entries())route(`street-${i}-both-directions`,e.a,[e.b,e.a]);
    // Each arrival/place physically joins the same connected graph. This is stronger
    // than counting connected nodes, but does not certify road design/accessibility.
    for(const [i,p] of [region.spawn,...region.places.map(p=>p.position)].entries()){
      const e=nearest(p);route(`destination-${i}-join-return`,p,[e.point,e.a,e.point,p]);
    }
    const entries=scene.architecture?.sockets.filter(s=>s.role==='entry')??[];
    for(const [i,socket] of entries.entries()){
      const a=socket.rotation*Math.PI/180,forward=[-Math.sin(a),Math.cos(a)],side=[Math.cos(a),Math.sin(a)];
      const at=(depth,offset=0)=>socket.position.slice(0,2).map((v,j)=>v+depth*forward[j]+offset*side[j]);
      const road=nearest(at(-3));
      route(`entry-${i}-road-interior-return`,road.point,[at(-3),at(3),at(-3),road.point]);
      // The door opening is 1.7 m; a 0.35 m body must clear both jambs diagonally.
      for(const offset of [-.3,.3])route(`entry-${i}-diagonal-${offset}`,at(-2,-offset),[at(2,offset),at(-2,-offset)],{dt:i%2?1/30:1/60});
      route(`entry-${i}-rear-wall`,at(3),[at(9)],{negative:true});
      route(`entry-${i}-glazing`,at(-2,1.3),[at(2,1.3)],{negative:true});
    }
    const [w,s,e,n]=region.bounds_m,area=(e-w)*(n-s);
    const frontage=artifact?.placements.map(p=>{
      const b=region.buildings.find(b=>b.id===p.id),road=region.roads.find(r=>r.id===p.frontageRoadId);
      assert.ok(road,`${p.id}: missing frontage road`);
      const q=road.points.slice(1).map((b1,i)=>project(b.center,road.points[i],b1)).sort((a,b1)=>distance(b.center,a)-distance(b.center,b1))[0];
      // Check the actual instantiated Studio geometry independently of the
      // compiler's plan-bounds assertion. These stock layouts have zero yaw.
      assert.equal(b.yaw_deg,0,'rotated candidates need an oriented bound audit');
      const box=new Box3().setFromObject(scene.items.get(b.id)),tolerance=.001;
      assert.ok(box.min.x>=b.center[0]-b.size[0]/2-tolerance&&box.max.x<=b.center[0]+b.size[0]/2+tolerance,`${b.id}: rendered east extent exceeds envelope`);
      assert.ok(box.min.z>=-b.center[1]-b.size[1]/2-tolerance&&box.max.z<=-b.center[1]+b.size[1]/2+tolerance,`${b.id}: rendered north extent exceeds envelope`);
      assert.ok(box.min.y>=-tolerance&&box.max.y<=b.size[2]+tolerance,`${b.id}: rendered height exceeds flat-ground envelope`);
      const a=(p.architecture.facing_deg+b.yaw_deg)*Math.PI/180,outward=[Math.sin(a),-Math.cos(a)];
      const facingDot=(q[0]-b.center[0])*outward[0]+(q[1]-b.center[1])*outward[1];
      assert.ok(facingDot>0,`${b.id}: front faces away from its assigned street`);
      return {id:b.id,road:road.id,distanceToRoadCenter_m:distance(b.center,q),width_m:b.size[0],height_m:b.size[2],frontageFacingDot_m:facingDot,renderedBounds_east_up_south:[box.min.toArray(),box.max.toArray()]};
    })??[];
    return {id,counts:{buildings:region.buildings.length,roads:region.roads.length,trees:region.trees.length,places:region.places.length,entries:entries.length,...scene.architecture?.counts},
      measurements:{siteArea_m2:area,envelopeCoverage:region.buildings.reduce((sum,b)=>sum+b.size[0]*b.size[1],0)/area,heightRange_m:[Math.min(...region.buildings.map(b=>b.size[2])),Math.max(...region.buildings.map(b=>b.size[2]))],arrivalDistanceToRoad_m:distance(region.spawn,nearest(region.spawn).point),frontage},
      connectivity:{nodes:graph.size,visited:visited.size,allRoutesPassed:routes.every(r=>r.passed)},routes};
  }finally{disposeStudioScene(scene.group);}
}
const source=neighborhoodSource();
const report={createdAt:new Date().toISOString(),node:process.version,platform:process.platform,revision:source.head,source,
  scope:'Private Studio scenes, production walking solver at 30/60 Hz, no NPC occupancy. Ground polygons and slab supports; no native/shared authority or performance claim.',candidates:[],preservation:[],manual:[],failures};
try{
  for(const name of ['garden-market','garden-court']){
    const source=read(join(root,`config/neighborhoods/${name}.json`)),geometryHashes=new Set();
    for(const [index,seed] of [source.seed,...Array.from({length:6},(_,i)=>`review-${i}`)].entries()){
      const recipe={...source,seed},filename=`${name}-${index}-recipe.json`;write(filename,recipe);
      const hashes=[];
      for(let repeat=0;repeat<2;repeat++){
        const dir=join(output,`${name}-${index}-${repeat}`);
        const child=spawnSync(process.execPath,['scripts/neighborhood.mjs','build','--recipe',join(output,filename),'--out',dir],{cwd:root,encoding:'utf8',timeout:30000});
        assert.equal(child.status,0,child.stderr);
        hashes.push(Object.fromEntries(readdirSync(dir).sort().map(file=>[file,hash(readFileSync(join(dir,file)))])));
      }
      assert.deepEqual(hashes[0],hashes[1],`${name}/${seed}: fresh process exports changed`);
      const artifact=validateAuthoringArtifact(read(join(output,`${name}-${index}-0/authoring.json`)));
      geometryHashes.add(hash(canonical(artifact.region.buildings)));
      report.candidates.push({...inspect(`${name}/${seed}`,artifact.region,artifact),seed,artifact_sha256:artifact.sha256,allFileHashes:hashes[0],freshProcessCopies:2});
    }
    assert.ok(geometryHashes.size>1,`${name}: seed changes produced no geometry diversity`);
    let previous=buildNeighborhood(source),edited=structuredClone(previous.region);
    const kept=edited.buildings[0],deleted=edited.buildings.at(-1).id;kept.center[0]+=.5;
    edited.buildings=edited.buildings.filter(b=>b.id!==deleted);
    const [w,s]=source.bounds_m;edited.spawn=[w+4,s+4];edited.terrain.heights_m.fill(.1);
    edited.roads[0].name='Authored road name';
    edited.places.push({id:'authored-stop',name:'Authored gathering stop',position:[w+8,s+8]});
    edited.trees.push({id:'authored-tree',position:[w+10,s+10],height_m:8,crown_radius_m:2});
    const binding=previous.placements.find(p=>p.id===kept.id);
    const chain=[];
    for(let i=0;i<6;i++){
      previous=buildNeighborhood({...source,seed:`review-${i}`},{previous,...(i===0?{edited,approve:[kept.id]}:{})});
      previous=validateAuthoringArtifact(JSON.parse(canonical(previous)));
      assert.deepEqual(previous.region.buildings.find(b=>b.id===kept.id),kept);
      assert.deepEqual(previous.placements.find(p=>p.id===kept.id),binding);
      assert.ok(previous.approved.includes(kept.id));assert.ok(!previous.region.buildings.some(b=>b.id===deleted));
      assert.deepEqual(previous.region.spawn,edited.spawn);assert.deepEqual(previous.region.terrain,edited.terrain);
      for(const collection of ['places','trees'])assert.deepEqual(previous.region[collection].find(p=>p.id.startsWith('authored-')),edited[collection].at(-1));
      assert.equal(previous.region.roads.find(r=>r.id===edited.roads[0].id).name,'Authored road name');
      chain.push(previous.sha256);
    }
    report.preservation.push({id:name,distinctBuildingLayouts:geometryHashes.size,sequentialSeeds:6,artifactHashes:chain,kept:kept.id,deleted,checks:['geometry','kit binding','approval','deletion tombstone','tree addition','place addition','road name','spawn','terrain','export/reopen']});
    write(`${name}-preserved.json`,previous);
  }
  for(const name of ['market-street','garden-neighborhood'])report.manual.push(inspect(name,createDistrict(name)));
  report.finalSource=neighborhoodSource();assert.deepEqual(report.finalSource,report.source,'runtime/harness source changed during review');
}catch(error){failures.push({error:error.stack});}
write('report.json',report);
console.log(JSON.stringify({output,candidates:report.candidates.length,manual:report.manual.length,routes:[...report.candidates,...report.manual].reduce((s,c)=>s+c.routes.length,0),failures}));
if(failures.length)process.exitCode=1;
