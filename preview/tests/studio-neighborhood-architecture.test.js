import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNeighborhood} from '../../shared/neighborhood/preserve.js';
import {createStudioScene,disposeStudioScene} from '../src/studio/scene.js';
import {createWalkingEnvironment} from '../src/walking.js';
import {compileNeighborhoodArchitecture} from '../../shared/neighborhood/architecture.js';
const recipe=()=>({...JSON.parse(readFileSync(new URL('../../config/neighborhoods/garden-blocks.json',import.meta.url))),architecture:{schema_version:1,bindings:[
  {templateId:'garden-shop',assembly:'shop-row',palette:'market'}, {templateId:'court-house',assembly:'court-shells',palette:'court'},
]}});

test('Studio kit rendering uses the exported facade openings and walking supports',()=>{
  const artifact=buildNeighborhood(recipe()), plan=compileNeighborhoodArchitecture(artifact), scene=createStudioScene(artifact.region,'light',artifact);
  try{
    assert.equal(scene.architecture.counts.buildings,16);
    const environment=createWalkingEnvironment(scene.world), entries=plan.sockets.filter(s=>s.role==='entry');assert.ok(entries.length);
    for(const socket of entries){
      const a=socket.rotation*Math.PI/180,forward=[-Math.sin(a),Math.cos(a)];
      for(let step=-2;step<=2;step+=.1){const x=socket.position[0]+forward[0]*step,y=socket.position[1]+forward[1]*step;assert.ok(environment.isFree(x,-y),`entry blocked: ${socket.id}`);}
      assert.ok(Math.abs(environment.groundAt(socket.position[0],-socket.position[1])-.06)<1e-6);
    }
    let instanceMeshes=0;scene.group.traverse(o=>{if(o.isInstancedMesh)instanceMeshes++;});assert.ok(instanceMeshes>0);
  }finally{disposeStudioScene(scene.group);}
});

test('architecture resources dispose once and unsupported authored shapes retain solid collision',()=>{
  const artifact=buildNeighborhood(recipe()), region=structuredClone(artifact.region), id=region.buildings[0].id;
  region.buildings[0].size[0]-=1;
  const scene=createStudioScene(region,'light',artifact), env=createWalkingEnvironment(scene.world);
  assert.ok(scene.architecture.fallbackIds.includes(id));assert.equal(env.isFree(region.buildings[0].center[0],-region.buildings[0].center[1]),false);
  const counts=new Map();scene.group.traverse(o=>{for(const r of [o.geometry,...[o.material].flat()].filter(Boolean))if(!counts.has(r)){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));}});
  disposeStudioScene(scene.group);assert.ok([...counts.values()].every(n=>n===1));
});
