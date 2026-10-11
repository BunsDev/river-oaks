import test from 'node:test';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { blankRegion } from '../src/region-draft.js';
import { buildStudioWorld, createStudioScene, disposeStudioScene, frameStudioObject } from '../src/studio/scene.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';

test('scene maps east/north/metres with terrain and exact editable dimensions',()=>{
  const region=blankRegion();region.terrain.heights_m.fill(3);
  region.buildings.push({id:'house',kind:'retail',center:[20,12],size:[12,8,7],yaw_deg:45});
  const world=buildStudioWorld(region),scene=createStudioScene(region);
  const object=scene.items.get('house');
  assert.deepEqual(object.position.toArray(),[20,3,-12]);
  assert.deepEqual(object.scale.toArray(),[12,7,8]);
  assert.equal(object.rotation.y,Math.PI/4);
  assert.equal(world.terrain.grid_origin_m[0],-96);
  assert.equal(world.walkSpawn[2],3);
  disposeStudioScene(scene.group);
});

test('private playtest uses gameplay collision and cannot enter building footprints',()=>{
  const region=blankRegion();region.buildings.push({id:'house',kind:'retail',center:[0,0],size:[12,8,7],yaw_deg:0});
  const environment=createWalkingEnvironment(buildStudioWorld(region));
  const state=createWalkingState(environment);
  const start=state.position[2];
  for(let i=0;i<900;i++)stepWalking(state,environment,{forward:1},1/60);
  assert.ok(state.position[2]<start-1);
  assert.ok(state.position[2]>=4.35);
  assert.equal(environment.isFree(0,0),false);
  assert.equal(region.spawn[1],-20);
});

test('scene disposal releases each distinct geometry and material once',()=>{
  const region=blankRegion();region.trees.push({id:'tree',position:[20,12],height_m:6,crown_radius_m:2});
  const {group}=createStudioScene(region),resources=new Set();
  group.traverse(object=>{if(object.geometry)resources.add(object.geometry);for(const material of [object.material].flat().filter(Boolean))resources.add(material);});
  let disposed=0;for(const resource of resources)resource.addEventListener('dispose',()=>disposed++);
  disposeStudioScene(group);assert.equal(disposed,resources.size);
});

test('walkthrough ground matches the triangles actually rendered on uneven terrain',()=>{
  const region=blankRegion();region.terrain.heights_m[0]=0;region.terrain.heights_m[1]=10;region.terrain.heights_m[9]=10;region.terrain.heights_m[10]=0;
  const {group,world}=createStudioScene(region),ground=group.children[0],geometry=ground.geometry;
  // Sample the centroid of every terrain triangle; at least one saddle differs
  // from bilinear interpolation, which must not float the walking camera.
  const env=createWalkingEnvironment(world),p=geometry.attributes.position,index=geometry.index;
  for(let i=0;i<index.count;i+=3){
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)],avg=axis=>ids.reduce((sum,id)=>sum+p[['getX','getY','getZ'][axis]](id),0)/3;
    const x=avg(0),z=avg(2);if(Math.abs(x)<3)continue; // The path adds a small surface offset.
    assert.ok(Math.abs(env.groundAt(x,z)-avg(1))<.001,`ground at ${x},${z}`);
  }
  disposeStudioScene(group);
});


test('region framing includes elevated terrain and fits wide and narrow viewports',()=>{
  const region=blankRegion();region.terrain.heights_m.fill(500);region.bounds_m=[-256,-256,256,256];
  const {group}=createStudioScene(region);
  for(const aspect of [2,.45]){
    const camera=new THREE.PerspectiveCamera(45,aspect,.1,2000);
    const target=frameStudioObject(camera,group);
    assert.ok(target.y>=500);assert.ok(camera.position.y>500);
    const bounds=new THREE.Box3().setFromObject(group);
    camera.position.sub(target).multiplyScalar(2).add(target);camera.updateMatrixWorld(true);
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      const projected=new THREE.Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&Math.abs(projected.z)<1,`corner outside ${aspect}: ${projected.toArray()}`);
    }
  }
  disposeStudioScene(group);
});
