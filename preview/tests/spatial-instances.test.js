import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Color, Frustum, InstancedMesh, Matrix4, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { spatialInstanceBatches } from '../src/spatial-instances.js';

test('spatial batches cull offscreen plants while retaining their transforms, colors and material',()=>{
  const source=new InstancedMesh(new BoxGeometry(),new MeshStandardMaterial(),3),matrix=new Matrix4(),color=new Color();
  for(const [i,x] of [0,2,120].entries()){
    source.setMatrixAt(i,matrix.makeTranslation(x,0,-5));source.setColorAt(i,color.setRGB(.2+i*.2,.5,.3));
  }
  source.castShadow=source.receiveShadow=true;source.userData.aoExclude=true;
  source.position.y=2;source.updateMatrixWorld(true);source.computeBoundingSphere();
  const camera=new PerspectiveCamera(50,1,.1,200);camera.position.y=2;camera.updateMatrixWorld(true);
  const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  assert.equal(frustum.intersectsObject(source),true,'a global bound submits all three instances');
  const batches=spatialInstanceBatches(source,12);
  let submitted=0;const actual=[],expected=[];
  for(let i=0;i<source.count;i++){source.getMatrixAt(i,matrix);source.getColorAt(i,color);expected.push([...matrix.elements,...color.toArray()]);}
  for(const batch of batches){
    batch.updateMatrixWorld(true);if(frustum.intersectsObject(batch))submitted+=batch.count;
    assert.equal(batch.geometry,source.geometry);assert.equal(batch.material,source.material);
    assert.equal(batch.castShadow,true);assert.equal(batch.receiveShadow,true);assert.equal(batch.userData.aoExclude,true);
    assert.deepEqual(batch.matrixWorld.elements,source.matrixWorld.elements);
    for(let i=0;i<batch.count;i++){batch.getMatrixAt(i,matrix);batch.getColorAt(i,color);actual.push([...matrix.elements,...color.toArray()]);}
  }
  assert.equal(submitted,2,'offscreen vegetation is culled without dropping visible plants');
  assert.deepEqual(actual,expected,'all instance data survives, including the culled plant');
});
