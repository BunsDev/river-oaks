import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNeighborhood,validateAuthoringArtifact,canonical} from '../../shared/neighborhood/preserve.js';
import {compileNeighborhoodArchitecture} from '../../shared/neighborhood/architecture.js';

const recipe=()=>({...JSON.parse(readFileSync(new URL('../../config/neighborhoods/garden-blocks.json',import.meta.url))),architecture:{schema_version:1,bindings:[
  {templateId:'garden-shop',assembly:'shop-row',palette:'market'},
  {templateId:'court-house',assembly:'court-shells',palette:'court'},
]}});

test('Market preset gives every block edge a multi-building frontage without manual infill',()=>{
  const input=JSON.parse(readFileSync(new URL('../../config/neighborhoods/garden-market.json',import.meta.url)));
  for(const seed of [input.seed,'review-0','review-1','review-2','review-3','review-4','review-5']){
    const artifact=buildNeighborhood({...input,seed}),plan=compileNeighborhoodArchitecture(artifact),[w,s,e,n]=artifact.region.bounds_m;
    const coverage=artifact.region.buildings.reduce((sum,b)=>sum+b.size[0]*b.size[1],0)/((e-w)*(n-s));
    assert.ok(coverage>=.06,`${seed}: ${coverage} coverage leaves isolated shop rows requiring infill`);
    for(const block of artifact.blocks){
      const frontages=new Map();
      for(const placement of artifact.placements.filter(p=>p.blockId===block.id))frontages.set(placement.frontageRoadId,(frontages.get(placement.frontageRoadId)??0)+1);
      assert.ok([...frontages.values()].every(count=>count>=2),`${block.id}: isolated building on a market frontage`);
    }
    assert.equal(plan.counts.fallbacks,0);
    assert.ok(plan.counts.modules<=256);
  }
});

test('earlier sparse Market artifacts retain their embedded layout and approvals when the preset changes',()=>{
  const current=JSON.parse(readFileSync(new URL('../../config/neighborhoods/garden-market.json',import.meta.url)));
  const oldRecipe={...current,constraints:{...current.constraints,frontage_m:48}};
  delete oldRecipe.spawn;
  const original=buildNeighborhood(oldRecipe),id=original.region.buildings[0].id;
  const approved=buildNeighborhood(oldRecipe,{previous:original,approve:[id]}),before=canonical(approved);
  assert.equal(approved.region.buildings.length,8);
  assert.equal(canonical(validateAuthoringArtifact(approved)),before);
  const rerolled=buildNeighborhood({...approved.recipe,seed:'legacy-reroll'},{previous:approved});
  assert.equal(rerolled.region.buildings.length,8);
  assert.deepEqual(rerolled.region.buildings.find(b=>b.id===id),approved.region.buildings.find(b=>b.id===id));
  assert.throws(()=>buildNeighborhood(current,{previous:approved}),error=>error.diagnostics?.some(d=>d.id===id&&d.code==='parcel-setback'));
  assert.equal(canonical(approved),before,'a rejected density migration must not mutate saved work');
});

test('fixed kit assemblies fit generated envelopes, face frontage and compile deterministically',()=>{
  const artifact=buildNeighborhood(recipe()), result=compileNeighborhoodArchitecture(artifact);
  assert.equal(result.instances.length,16);assert.equal(result.fallbackIds.length,0);
  assert.ok(result.counts.modules<=256);assert.ok(result.counts.parts>100);
  assert.deepEqual(result,compileNeighborhoodArchitecture(structuredClone(artifact)));
  for(const instance of result.instances){
    const b=artifact.region.buildings.find(b=>b.id===instance.id),[w,s,z,e,n,h]=instance.plan.bounds;
    assert.ok(w>=-b.size[0]/2&&e<=b.size[0]/2&&s>=-b.size[1]/2&&n<=b.size[1]/2&&z>=0&&h<=b.size[2]);
    assert.ok(instance.plan.parts.every(p=>p.size.every(Number.isFinite)));
  }
  assert.ok(result.collisionPolygons.length);assert.ok(result.supportSurfaces.length);
});

test('approved architecture keeps its assembly and palette when eligible template bindings change',()=>{
  const input=recipe(), first=buildNeighborhood(input), id=first.region.buildings.find(b=>b.kind==='retail').id;
  const approved=buildNeighborhood(input,{previous:first,approve:[id]});
  input.architecture.bindings[0].palette='court';
  const next=buildNeighborhood(input,{previous:approved});
  assert.equal(compileNeighborhoodArchitecture(next).instances.find(i=>i.id===id).palette,'market');
  assert.ok(compileNeighborhoodArchitecture(next).instances.some(i=>i.id!==id&&i.palette==='court'));
});

test('authored unsupported dimensions and custom interiors stay intact with explicit fallback diagnostics',()=>{
  const artifact=buildNeighborhood(recipe()), edited=structuredClone(artifact.region), id=edited.buildings[0].id;
  edited.buildings[0].size[0]-=1;
  const next=buildNeighborhood(artifact.recipe,{previous:artifact,edited}), result=compileNeighborhoodArchitecture(next);
  assert.deepEqual(next.region.buildings.find(b=>b.id===id),edited.buildings[0]);
  assert.ok(result.fallbackIds.includes(id));assert.ok(result.diagnostics.some(d=>d.id===id&&d.code==='architecture-fallback'));
  const unsupported=recipe();unsupported.templates[0].size[0]=15;
  assert.throws(()=>buildNeighborhood(unsupported),/architecture.*dimension/i);
});

test('imported kit files match the recorded immutable integration snapshot',()=>{
  const snapshot=JSON.parse(readFileSync(new URL('../../config/neighborhoods/kit-snapshot.json',import.meta.url)));
  for(const item of snapshot.files)assert.equal(createHash('sha256').update(readFileSync(new URL(`../../${item.path}`,import.meta.url))).digest('hex'),item.sha256);
});

test('interior terrain peaks and dips retain authored terrain and fall back to blockouts',()=>{
  const input=JSON.parse(readFileSync(new URL('../../config/neighborhoods/garden-market.json',import.meta.url)));
  const first=buildNeighborhood(input),id='h-middle-cross-0-0';
  for(const height of [5,-5]){
    const edited=structuredClone(first.region);
    edited.terrain={width:65,height:65,heights_m:Array(65*65).fill(0)};
    const building=edited.buildings.find(b=>b.id===id),[w,s,e,n]=edited.bounds_m;
    const column=Math.round((building.center[0]+building.size[0]/3-w)/(e-w)*64);
    const row=Math.round((building.center[1]-building.size[1]/4-s)/(n-s)*64);
    // Follow the actual parcel position: an interior grid vertex away from the
    // envelope centre/corners must remain covered when preset density changes.
    const peak=[w+column*(e-w)/64,s+row*(n-s)/64];
    assert.ok(peak.every((v,i)=>Math.abs(v-building.center[i])<building.size[i]/2));
    assert.ok(Math.hypot(peak[0]-building.center[0],peak[1]-building.center[1])>3);
    edited.terrain.heights_m[row*65+column]=height;
    const next=buildNeighborhood(input,{previous:first,edited}),result=compileNeighborhoodArchitecture(next);
    assert.deepEqual(next.region.terrain,edited.terrain);
    assert.ok(result.fallbackIds.includes(id));
    assert.ok(result.diagnostics.some(d=>d.id===id&&/foundation/.test(d.message)));
  }
});
