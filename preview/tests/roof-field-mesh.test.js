import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { roofFieldGeometry } from '../src/roof-field-mesh.js';
const fields=[];for(let n=0;n<5;n++)for(let x=0;x<5;x++)if(x!==2||n!==2)fields.push({at:[x,n],size:1});
test('continuous roof field keeps the service hole and never grows beyond validated cells',()=>{
 const geometry=roofFieldGeometry(fields),points=geometry.attributes.position;
 for(let i=0;i<points.count;i++) {
   const x=points.getX(i),n=-points.getZ(i),y=points.getY(i);
   assert.ok(fields.some(f=>Math.abs(x-f.at[0])<=.50001&&Math.abs(n-f.at[1])<=.50001));
   assert.ok(!(x>1.50001&&x<2.49999&&n>1.50001&&n<2.49999),'service hole stays clear');
   assert.ok(y>=-.00001&&y<=.14001,'soil depth is supported');
 }
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(2,1,-2),new THREE.Vector3(0,-1,0));
 assert.equal(ray.intersectObject(mesh).length,0,'triangulation does not bridge the service hole');
 ray.ray.origin.set(0,1,0);assert.ok(ray.intersectObject(mesh).length>0,'planted surface is rendered');
 for(let i=0;i<points.count;i+=3) {
   const x=(points.getX(i)+points.getX(i+1)+points.getX(i+2))/3,n=-(points.getZ(i)+points.getZ(i+1)+points.getZ(i+2))/3;
   assert.ok(fields.some(f=>Math.abs(x-f.at[0])<=.50001&&Math.abs(n-f.at[1])<=.50001),'triangle stays inside the cell union');
 }
 assert.ok(geometry.boundingBox);geometry.dispose();mesh.material.dispose();
});
