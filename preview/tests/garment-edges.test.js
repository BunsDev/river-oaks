import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {garmentEdgeFixture} from './helpers/garment-edges.js';

test('garment edge probe distinguishes crossings, clearance and skipped short edges',()=>{
  const model=new THREE.Group(),pelvis=new THREE.Bone();pelvis.name='pelvis';model.add(pelvis);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-.2,-1,1,-.2,-1,0,-.2,1],3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(12).fill(0),4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));geometry.setIndex([0,1,2]);
  const body=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());model.add(body);body.bind(new THREE.Skeleton([pelvis]));
  const cloth=new THREE.BufferGeometry();cloth.setAttribute('position',new THREE.Float32BufferAttribute([0,-.3,0,0,-.1,0,0,-.1,0],3));cloth.setIndex([0,1,2]);
  const garment=new THREE.Mesh(cloth,new THREE.MeshBasicMaterial());model.add(garment);
  const fixture=garmentEdgeFixture(model,body,[garment]);
  try{
    const crossed=fixture.sample()[0];assert.equal(crossed.crossings,2);assert.equal(crossed.testedEdges,2);assert.equal(crossed.skippedEdges,1);
    garment.position.y=.5;const clear=fixture.sample()[0];assert.equal(clear.crossings,0);assert.equal(clear.testedEdges,2);assert.equal(clear.skippedEdges,1);
  }finally{fixture.dispose();geometry.dispose();cloth.dispose();body.material.dispose();garment.material.dispose();}
});


test('lower-leg probe includes the lower body band and transformed non-indexed boots',()=>{
  const model=new THREE.Group(),pelvis=new THREE.Bone();pelvis.name='pelvis';model.add(pelvis);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-.6,-1,1,-.6,-1,0,-.6,1],3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(12).fill(0),4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));geometry.setIndex([0,1,2]);
  const material=new THREE.MeshBasicMaterial(),body=new THREE.SkinnedMesh(geometry,material);model.add(body);body.bind(new THREE.Skeleton([pelvis]));
  const bootGeometry=new THREE.BufferGeometry();bootGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,-1,1,0,-1,0,0,1],3));
  const boot=new THREE.Mesh(bootGeometry,material);boot.position.set(3,-.7,0);model.add(boot);
  const cloth=new THREE.BufferGeometry();cloth.setAttribute('position',new THREE.Float32BufferAttribute([0,-.8,0,0,-.5,0,0,-.5,0],3));cloth.setIndex([0,1,2]);
  const garment=new THREE.Mesh(cloth,material);model.add(garment);
  const fixture=garmentEdgeFixture(model,body,[garment],{bottom:-.95,top:-.25,attachments:[boot]});
  try{
    assert.equal(fixture.sample()[0].crossings,2,'detect the lower trouser surface');
    garment.position.x=3;assert.equal(fixture.sample()[0].crossings,2,'detect non-indexed boot at its own transform');
    boot.position.x=6;assert.equal(fixture.sample()[0].crossings,0,'moving boot away removes the crossing');
  }finally{fixture.dispose();geometry.dispose();bootGeometry.dispose();cloth.dispose();material.dispose();}
});
