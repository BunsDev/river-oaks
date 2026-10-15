import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRoofGrasses } from '../src/roof-grasses.js';
test('short grass reuses opaque leaf geometry deterministically within its reserved reach',()=>{
 const tufts=[{origin:[10,20,30],seed:123}],a=buildRoofGrasses(tufts),b=buildRoofGrasses(tufts);
 assert.equal(a.length,1);assert.equal(a[0].count,12);assert.equal(a[0].material.transparent,false);
 assert.deepEqual(Array.from(a[0].instanceMatrix.array),Array.from(b[0].instanceMatrix.array));
 const matrix=new THREE.Matrix4(),box=new THREE.Box3(),origin=new THREE.Vector3(10,20,30);
 for(let i=0;i<a[0].count;i++) {
  a[0].getMatrixAt(i,matrix);box.copy(a[0].geometry.boundingBox).applyMatrix4(matrix);
  assert.ok(box.min.y>=origin.y-.001);assert.ok(box.max.y<=origin.y+.7);
  assert.ok(Math.max(Math.abs(box.min.x-origin.x),Math.abs(box.max.x-origin.x),Math.abs(box.min.z-origin.z),Math.abs(box.max.z-origin.z))<.45);
 }
 assert.deepEqual(buildRoofGrasses([]),[]);
});
