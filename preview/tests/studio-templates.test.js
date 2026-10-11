import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { districtTemplates, createDistrict } from '../src/studio/templates.js';
import { createStudioDocument, parseRegion } from '../src/studio/document.js';
import { compileRegionPackage } from '../../server/region-package.js';

const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};

test('five distinct portable districts roundtrip through editor and authoritative compiler',async()=>{
  assert.equal(districtTemplates.length,5);
  assert.equal(new Set(districtTemplates.map(t=>t.id)).size,5);
  const layouts=new Set();
  for(const template of districtTemplates){
    const region=createDistrict(template.id);
    const file=await readFile(new URL(`../public/data/starter-districts/${template.id}.json`,import.meta.url),'utf8');
    assert.deepEqual(region,parseRegion(file));
    assert.ok(Buffer.byteLength(file)<128*1024);
    compileRegionPackage(region,template.name);
    const doc=createStudioDocument(region);doc.update('@arrival',{east:region.spawn[0]+1});doc.undo();
    assert.deepEqual(parseRegion(doc.serialize()),region);
    assert.ok(template.description&&template.firstEdit);
    layouts.add(JSON.stringify(region.buildings));
    const copy=createDistrict(template.id);copy.buildings[0].center[0]=999;
    assert.notEqual(createDistrict(template.id).buildings[0].center[0],999);
  }
  assert.equal(layouts.size,5);assert.throws(()=>createDistrict('missing'));
});

test('district paths connect arrival to every named destination with unobstructed width',()=>{
  for(const template of districtTemplates){
    const r=createDistrict(template.id),segments=r.roads.flatMap(road=>road.points.slice(1).map((b,i)=>({a:road.points[i],b,width:road.width_m})));
    // Sample the full path corridor every metre, with an extra metre of clearance.
    for(const {a,b,width} of segments){
      const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));
      for(let i=0;i<=count;i++){
        const p=[a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count];
        for(const building of r.buildings){assert.equal(building.yaw_deg,0);const dx=Math.max(0,Math.abs(p[0]-building.center[0])-building.size[0]/2),dy=Math.max(0,Math.abs(p[1]-building.center[1])-building.size[1]/2);assert.ok(Math.hypot(dx,dy)>=width/2+1,`${template.id}: ${building.id} blocks path`);}
        for(const tree of r.trees)assert.ok(Math.hypot(p[0]-tree.position[0],p[1]-tree.position[1])>=width/2+tree.crown_radius_m,`${template.id}: tree canopy intersects path`);
      }
    }
    // All intersections are explicit vertices; traverse the route graph.
    const graph=new Map();for(const {a,b} of segments){for(const [x,y] of [[a,b],[b,a]]){const key=x.join(',');if(!graph.has(key))graph.set(key,new Set());graph.get(key).add(y.join(','));}}
    const visited=new Set(),queue=[segments[0].a.join(',')];while(queue.length){const key=queue.pop();if(visited.has(key))continue;visited.add(key);queue.push(...graph.get(key));}assert.equal(visited.size,graph.size,`${template.id}: disconnected route`);
    for(const p of [r.spawn,...r.places.map(p=>p.position)])assert.ok(segments.some(s=>distance(p,s.a,s.b)<=s.width/2),`${template.id}: destination off route`);
    for(let i=0;i<r.buildings.length;i++)for(const b of r.buildings.slice(i+1)){const a=r.buildings[i];assert.ok(Math.abs(a.center[0]-b.center[0])>=(a.size[0]+b.size[0])/2+2||Math.abs(a.center[1]-b.center[1])>=(a.size[1]+b.size[1])/2+2,`${template.id}: buildings overlap`);}
  }
});
