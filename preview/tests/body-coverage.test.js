import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bodyCoverageFixture} from './helpers/body-coverage.js';

test('exterior coverage detects a hole in a bent shell and agrees without spatial chunks',()=>{
  const model=new THREE.Group(),pelvis=new THREE.Bone();pelvis.name='pelvis';model.add(pelvis);
  const surface=radius=>new THREE.TorusGeometry(.2,radius,16,64).translate(0,-.5,0);
  const geometry=surface(.06),count=geometry.attributes.position.count;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(count*4).fill(0),4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));
  const body=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());model.add(body);body.bind(new THREE.Skeleton([pelvis]));
  const cloth=new THREE.Mesh(surface(.072),new THREE.MeshBasicMaterial());const garments=new THREE.Group();model.add(garments);garments.add(cloth);
  const probe=bodyCoverageFixture(model,body,[cloth],{bottom:-.43,top:-.40});
  try{
    const intact=probe.sample();assert(intact.tested>10);assert.equal(intact.uncovered,0,JSON.stringify(intact));assert.deepEqual(intact,probe.sample({chunked:false}));
    garments.visible=false;const hidden=probe.sample();assert.equal(hidden.uncovered,hidden.tested,'a hidden ancestor cannot cover the body');garments.visible=true;
    cloth.visible=false;const hiddenMesh=probe.sample();assert.equal(hiddenMesh.uncovered,hiddenMesh.tested,'a hidden garment cannot cover the body');cloth.visible=true;
    const indices=[];for(let n=0;n<cloth.geometry.index.count;n+=3){const ids=[0,1,2].map(c=>cloth.geometry.index.getX(n+c));if(ids.some(i=>cloth.geometry.attributes.position.getY(i)>-.45&&cloth.geometry.attributes.position.getY(i)<-.38))continue;indices.push(...ids);}
    cloth.geometry.setIndex(indices);const hole=probe.sample();assert(hole.uncovered>10,JSON.stringify(hole));assert.deepEqual(hole,probe.sample({chunked:false}));
  }finally{geometry.dispose();cloth.geometry.dispose();body.material.dispose();cloth.material.dispose();}
});
