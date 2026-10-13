import test from 'node:test';
import assert from 'node:assert/strict';
import { spaceTemplates, createSpace } from '../src/studio/space-templates.js';
import { createStudioDocument, parseRegion } from '../src/studio/document.js';
import { buildSpaceWorld } from '../src/studio/space-scene.js';
import { createWalkingEnvironment } from '../src/walking.js';

test('four distinct furnished building templates roundtrip without losing edited furniture',()=>{
  assert.deepEqual(spaceTemplates.map(t=>t.id),['house','office','boutique','cafe']);
  for(const template of spaceTemplates){
    const space=createSpace(template.id),copy=createSpace(template.id),doc=createStudioDocument(space);
    assert.ok(space.objects.length>=25&&space.objects.length<=160);
    assert.ok(space.objects.some(o=>o.kind==='floor'));
    const furniture=space.objects.find(o=>o.kind==='chair');doc.update(furniture.id,{finish:'sage'});
    assert.deepEqual(parseRegion(doc.serialize()),doc.value);doc.undo();assert.deepEqual(doc.value,space);
    space.objects[0].label='Changed';assert.notEqual(copy.objects[0].label,'Changed');
  }
});

test('arrival reaches every named room through continuous player-width clearances',()=>{
  for(const template of spaceTemplates){
    const space=createSpace(template.id),environment=createWalkingEnvironment(buildSpaceWorld(space)),step=.25,[w,s,e,n]=space.bounds_m;
    const key=(x,y)=>`${x},${y}`,visited=new Set(),queue=[space.spawn];
    for(let index=0;index<queue.length;index++){
      const [x,y]=queue[index],k=key(x,y);if(visited.has(k))continue;visited.add(k);
      for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]){
        const next=[x+dx,y+dy];if(next[0]<=w||next[0]>=e||next[1]<=s||next[1]>=n||visited.has(key(...next)))continue;
        if(environment.isFree(next[0],-next[1]))queue.push(next);
      }
    }
    for(const target of template.walkTargets)assert.ok(visited.has(key(...target.position)),`${template.id}: ${target.label} unreachable`);
  }
});

test('template sink bowls are not filled by intersecting cabinet runs', async()=>{
  const THREE=await import('three');
  const {createSpaceScene}=await import('../src/studio/space-scene.js');
  const {disposeStudioScene}=await import('../src/studio/scene.js');
  for(const template of spaceTemplates){
    const space=createSpace(template.id),scene=createSpaceScene(space);
    for(const sink of space.objects.filter(o=>o.kind==='sink')){
      const ray=new THREE.Raycaster(new THREE.Vector3(sink.east,1.6,-sink.north),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(scene.group,true)[0];assert.ok(hit,`${template.id}: sink rendered`);
      let object=hit.object;while(object&&!object.userData.studioId)object=object.parent;
      assert.equal(object?.userData.studioId,sink.id,`${template.id}: basin covered by another object`);
    }
    disposeStudioScene(scene.group);
  }
});

test('office partitions show glazing through their broad faces',async()=>{
  const THREE=await import('three');
  const {createSpaceScene}=await import('../src/studio/space-scene.js');
  const {disposeStudioScene}=await import('../src/studio/scene.js');
  const scene=createSpaceScene(createSpace('office'));
  try{
    for(const [id,north] of [['meeting-divider-north',3.9],['meeting-divider-south',-.7]]){
      const ray=new THREE.Raycaster(new THREE.Vector3(0,1.6,-north),new THREE.Vector3(1,0,0));
      const hit=ray.intersectObject(scene.items.get(id),true)[0];
      assert.ok(hit?.object.material.transparent,`${id}: frame obscures the glass`);
    }
  }finally{disposeStudioScene(scene.group);}
});
