import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as surfaces from '../src/world-surface.js';
import { createWalkingEnvironment } from '../src/walking.js';

test('walking and foot queries follow rendered triangles, transforms and the highest overlapping surface',()=>{
  assert.equal(typeof surfaces.registerGroundSurfaces,'function');
  const world={bounds_m:[-20,-20,20,20],buildings:[],walkSurfaceOffset:.2};
  const environment=createWalkingEnvironment(world);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-5,0,-5,5,1,-5,-5,2,5,5,1,-5,5,4,5,-5,2,5],3));
  const floor=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  floor.position.y=.24;floor.rotation.y=.23;
  const curb=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.16,3),floor.material,1);
  curb.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,4,0));
  surfaces.registerGroundSurfaces(world,[floor,curb]);
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  for(let x=-3;x<=3;x+=.317)for(let z=-3;z<=3;z+=.293){
    ray.set(new THREE.Vector3(x,10,z),down);
    const height=ray.intersectObjects([floor,curb],false)[0].point.y;
    assert.ok(Math.abs(environment.groundAt(x,z)-height)<1e-6,`${x},${z}`);
  }
  surfaces.registerGroundSurfaces(world,[floor]);
  assert.ok(environment.groundAt(0,0)<4,'rebuilding removes stale surfaces');
  assert.equal(environment.groundAt(15,15),.2,'unrendered worlds retain their source offset');
});

test('coherent ground probes remain isolated across worlds, bucket boundaries and surface rebuilds',()=>{
  const a={walkSurfaceOffset:.15},b={walkSurfaceOffset:.3};
  const geometry=new THREE.PlaneGeometry(20,20);geometry.rotateX(-Math.PI/2);
  const first=new THREE.Mesh(geometry),second=new THREE.Mesh(geometry);
  first.position.set(64,2,-48);second.position.set(64,7,-48);
  surfaces.registerGroundSurfaces(a,[first]);surfaces.registerGroundSurfaces(b,[second]);
  for(const edge of [56,60,64,68,72])for(const jitter of [-1e-8,0,1e-8])for(let repeat=0;repeat<10;repeat++) {
    const x=edge+jitter;
    assert.equal(surfaces.groundSurfaceHeight(a,x,-48),2);
    assert.equal(surfaces.groundSurfaceHeight(b,x,-48),7);
    assert.equal(surfaces.groundSurfaceHeight(a,x,-48),2);
  }
  first.position.y=3;surfaces.registerGroundSurfaces(a,[first]);
  assert.equal(surfaces.groundSurfaceHeight(a,72,-48),3,'Rebuild invalidates a recently sampled bucket');
  surfaces.registerGroundSurfaces(a,[]);
  assert.equal(surfaces.groundSurfaceHeight(a,72,-48),.15,'Removed surfaces do not survive in a cached bucket');
  assert.equal(surfaces.groundSurfaceHeight(b,72,-48),7,'Another world retains its own index');
  assert.equal(surfaces.groundSurfaceHeight(b,100,-48),.3,'Empty cells use the fallback surface');
  geometry.dispose();first.material.dispose();second.material.dispose();
});

test('a group registers every mesh inside it as ground, as the roads layer does',()=>{
  const world={walkSurfaceOffset:.1};
  const plane=y=>{const geometry=new THREE.PlaneGeometry(4,4);geometry.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(geometry);mesh.position.y=y;return mesh;};
  const lanes=plane(.24),walk=plane(.26);walk.position.x=10;
  const roads=new THREE.Group();roads.add(lanes,walk);
  surfaces.registerGroundSurfaces(world,[roads]);
  assert.equal(surfaces.groundSurfaceHeight(world,0,0),.24);
  assert.equal(surfaces.groundSurfaceHeight(world,10,0),.26);
});

test('the debug view reads back each registered triangle once, in scene space',()=>{
  const world={};
  const geometry=new THREE.PlaneGeometry(4,4,2,2);geometry.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geometry);mesh.position.set(10,1.5,-6);
  surfaces.registerGroundSurfaces(world,[mesh]);
  const triangles=surfaces.groundSurfaceTriangles(world,10,-6,3);
  assert.equal(triangles.length,8,'a 2×2 plane is eight triangles, even where it spans several buckets');
  for(const corners of triangles)for(const [x,y,z] of corners){
    assert.ok(Math.abs(y-1.5)<1e-9);assert.ok(x>=8-1e-9&&x<=12+1e-9);assert.ok(z>=-8-1e-9&&z<=-4+1e-9);
  }
  assert.deepEqual(surfaces.groundSurfaceTriangles(world,200,200,2),[]);
  assert.deepEqual(surfaces.groundSurfaceTriangles({},0,0,5),[],'unregistered worlds have no triangles');
});
