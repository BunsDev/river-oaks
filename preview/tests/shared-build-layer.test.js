import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSharedBuildLayer } from '../src/shared-build-layer.js';
import { BUILD_KINDS, BUILD_FINISHES } from '../src/shared-build.js';
import { newAssembly } from '../src/creator-object.js';
import { createWalkingEnvironment } from '../src/walking.js';

test('every build catalog choice creates a bounded, grounded 3D object',()=>{
  const scene=new THREE.Scene(),layer=createSharedBuildLayer(scene);
  const items=BUILD_KINDS.flatMap((kind,index)=>BUILD_FINISHES.map((finish,variant)=>({
    id:`build-${1+index*4+variant}`,ownerId:'alice',ownerName:'Alice',kind:kind.id,finish:finish.id,
    position:[index*4,variant*4],ground:1.25,yaw:0,createdAt:index*4+variant,...(kind.id==='object'?{assembly:newAssembly()}:{})
  })));
  layer.sync(items);
  assert.equal(layer.stats().count,items.length);
  for(const entry of layer.object.children){
    const bounds=new THREE.Box3().setFromObject(entry);
    assert.ok(bounds.max.y-bounds.min.y>.3);
    assert.ok(Number.isFinite(bounds.min.x)&&Number.isFinite(bounds.max.z));
    assert.equal(entry.userData.build.ownerId,'alice');
  }
  const first=layer.object.children[0],before=first.children[0].geometry;
  layer.sync([{...items[0],position:[8,7],yaw:Math.PI/2},items[1]]);
  assert.equal(layer.stats().count,2);
  assert.equal(layer.object.children[0],first,'edits reuse the rendered model');
  assert.equal(first.children[0].geometry,before,'snapshot changes reuse catalog geometry');
  assert.deepEqual(first.position.toArray(),[8,1.25,-7]);
  layer.update(new THREE.Vector3(999,0,999));assert.equal(layer.stats().visible,0);
  layer.sync([]);assert.equal(layer.stats().count,0);
  layer.dispose();assert.equal(scene.children.length,0);
});

test('custom geometry and physical materials update from confirmed state and release replaced resources',()=>{
  const scene=new THREE.Scene(),layer=createSharedBuildLayer(scene),assembly=newAssembly();
  assembly.parts[0].rotation=[.15,.3,-.12];assembly.parts[0].position[1]=.8;
  assembly.parts.push({shape:'sphere',size:[.7,.7,.7],position:[0,1.8,0],rotation:[0,0,0],color:'#edc6bc',material:'glass'});
  const item={id:'build-1',kind:'object',finish:'rose',assembly,position:[4,7],ground:2,yaw:.5,ownerId:'a',ownerName:'Alice'};
  layer.sync([item]);scene.updateMatrixWorld(true);
  const group=layer.object.children[0];assert.equal(group.children.length,2);
  assert.equal(group.children[0].material.color.getHexString(),'b97986');
  assert.equal(group.children[1].material.isMeshPhysicalMaterial,true);
  assert.ok(group.children[1].material.transmission>.5);
  const before=new THREE.Box3().setFromObject(group),resources=layer.stats().materials;
  let disposed=0;group.children[0].material.addEventListener('dispose',()=>disposed++);
  for(let i=0;i<40;i++){
    const changed=structuredClone(item);changed.assembly.parts[0].size[0]=1+(i%3)*.2;
    changed.assembly.parts[0].color=i%2?'#336699':'#663399';layer.sync([changed]);
    assert.equal(layer.stats().materials,resources,'edits do not retain abandoned materials');
  }
  assert.equal(disposed,1,'the first replaced surface was disposed');
  scene.updateMatrixWorld(true);assert.ok(new THREE.Box3().setFromObject(layer.object).max.y>=before.max.y-1e-6);
  layer.setGhost({...item,valid:true});assert.ok(layer.ghost.children[0].children.length===2);
  layer.setGhost(null);layer.sync([]);assert.equal(layer.stats().materials,resources-2);
  layer.dispose();assert.equal(scene.children.length,0);
});

test('assembly collision respects the space between parts and updates with their confirmed transform',()=>{
  const layer=createSharedBuildLayer(new THREE.Scene()),assembly={name:'Arch',parts:[
    {shape:'box',size:[.2,2,.2],position:[-1,1,0],rotation:[0,0,0],color:'#b97986',material:'matte'},
    {shape:'box',size:[.2,2,.2],position:[1,1,0],rotation:[0,0,0],color:'#b97986',material:'matte'},
    {shape:'box',size:[2.2,.2,.2],position:[0,2.1,0],rotation:[0,0,0],color:'#b97986',material:'matte'},
  ]};
  const item={id:'build-1',kind:'object',finish:'rose',assembly,position:[4,7],ground:0,yaw:0,ownerId:'a',ownerName:'Alice'};
  layer.sync([item]);
  const environment=createWalkingEnvironment({bounds_m:[-20,-20,20,20],stores:[],buildings:[],collisionPolygons:[]},layer.colliders);
  assert.equal(environment.isFree(4,-7),true,'the opening remains walkable');
  assert.equal(environment.isFree(5,-7),false,'a solid post blocks walking');
  assert.equal(environment.canFly(4,2.1,-7),false,'the crossbeam blocks the flight volume');
  layer.sync([{...item,position:[12,7]}]);
  assert.equal(environment.isFree(5,-7),true,'the old collider was removed');
  assert.equal(environment.isFree(13,-7),false,'the moved post now blocks movement');
  layer.dispose();
});

test('assigned furniture slots lie on the rendered cushion tops at every snapped rotation',async()=>{
  const {resolveSeat,seatSlots}=await import('../src/shared-seating.js');
  const scene=new THREE.Scene(),layer=createSharedBuildLayer(scene);
  try{
    for(const kind of ['seat','armchair'])for(let step=0;step<16;step++) {
      const build={id:kind==='seat'?'build-1':'build-2',ownerId:'jevica',ownerName:'Jevica',kind,finish:'rose',position:[7,11],ground:2.3,yaw:step*Math.PI/8,createdAt:1};
      layer.sync([build]);scene.updateMatrixWorld(true);
      for(const slot of seatSlots(kind)) {
        const seat=resolveSeat(build,slot),ray=new THREE.Raycaster(new THREE.Vector3(seat.position[0],5,-seat.position[1]),new THREE.Vector3(0,-1,0));
        const hit=ray.intersectObject(layer.object,true)[0];assert.ok(hit);
        assert.ok(Math.abs(hit.point.y-build.ground-seat.height)<1e-6,`${kind}/${step}/${slot}: cushion contact ${hit.point.y}`);
      }
    }
  }finally{layer.dispose();}
});
