import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { stabilizeShoeSoles } from '../src/shoe-skinning.js';
import { measureSoleSupport } from '../src/sole-support.js';

function shoe() {
  const model=new THREE.Group(),calf=new THREE.Bone(),foot=new THREE.Bone(),ball=new THREE.Bone();
  calf.name='calf_l';foot.name='foot_l';ball.name='ball_l';
  calf.position.y=.9;foot.position.y=-.7;ball.position.z=.2;
  calf.add(foot);foot.add(ball);model.add(calf);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.05,0,-.04,.05,0,.3,.05,.4,0],3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,1,2,0,0,1,2,0,0,1,2,0],4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([.2,.1,.7,0,.2,.1,.7,0,1,0,0,0],4));
  const material=new THREE.MeshBasicMaterial();material.name='shoes04';
  const mesh=new THREE.SkinnedMesh(geometry,material);model.add(mesh);model.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([calf,foot,ball]));
  return {model,mesh,calf,foot,geometry};
}

test('shoe soles retain their shape through calf bends while the cuff follows the leg',()=>{
  const {model,mesh,calf,foot}=shoe();
  stabilizeShoeSoles(model);
  const local=index=>foot.worldToLocal(mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  const before=[0,1,2].map(local);
  calf.rotation.x=.6;foot.rotation.x=-.6;model.updateMatrixWorld(true);
  for(const index of [0,1])assert.ok(local(index).distanceTo(before[index])<1e-6,'The sole must not compress as the knee bends');
  assert.ok(local(2).distanceTo(before[2])>.05,'The upper cuff retains its calf influence');
  const weights=mesh.geometry.attributes.skinWeight;
  for(let i=0;i<weights.count;i++)assert.ok(Math.abs([0,1,2,3].reduce((sum,j)=>sum+weights.getComponent(i,j),0)-1)<1e-6);
});

test('footwear fitting owns its geometry and preserves the cached asset and other clones',()=>{
  const {model,mesh,geometry}=shoe();
  const sibling=mesh.clone(),beforeIndices=geometry.attributes.skinIndex.array.slice(),beforeWeights=geometry.attributes.skinWeight.array.slice();
  const owned=stabilizeShoeSoles(model);
  assert.notEqual(mesh.geometry,geometry);assert.equal(sibling.geometry,geometry);
  assert.deepEqual(geometry.attributes.skinIndex.array,beforeIndices);
  assert.deepEqual(geometry.attributes.skinWeight.array,beforeWeights);
  assert.deepEqual(mesh.geometry.attributes.position.array,geometry.attributes.position.array);
  let released=0,sourceReleased=0;
  mesh.geometry.addEventListener('dispose',()=>released++);geometry.addEventListener('dispose',()=>sourceReleased++);
  for(const item of owned)item.dispose();
  assert.equal(released,1);assert.equal(sourceReleased,0);
});


test('cached sole support comes from the actual shoe and survives parent translation, rotation and scale',()=>{
  const {model,mesh,foot}=shoe();stabilizeShoeSoles(model);model.updateMatrixWorld(true);
  const weights=mesh.geometry.attributes.skinWeight.array.slice(),positions=mesh.geometry.attributes.position.array.slice();
  const points=measureSoleSupport(model,foot,'l');
  assert.equal(points.length,2,'The two sole vertices are retained; the cuff is excluded');
  for(const point of points)assert.ok(Math.abs(point.y+.2)<1e-6);
  model.position.set(20,4,-10);model.rotation.y=.9;model.scale.setScalar(1.3);model.updateMatrixWorld(true);
  const transformed=measureSoleSupport(model,foot,'l');
  assert.equal(transformed.length,points.length);
  for(const point of points)assert.ok(transformed.some(other=>other.distanceTo(point)<1e-6),'Support coordinates remain attached to the same foot');
  assert.deepEqual(mesh.geometry.attributes.skinWeight.array,weights);
  assert.deepEqual(mesh.geometry.attributes.position.array,positions);
});
