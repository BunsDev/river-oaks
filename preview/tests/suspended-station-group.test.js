import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Object3D, Vector3 } from 'three';
import { SuspendedStationGroup } from '../src/suspended-station-group.js';

test('hidden stations skip descendant transforms and catch up before rendering again',()=>{
  const scene=new Group(),parent=new Group(),station=new SuspendedStationGroup(),bone=new Object3D();
  scene.add(parent);parent.add(station);station.add(bone);
  station.position.set(2,1,0);bone.position.set(0,3,1);scene.updateMatrixWorld(true);
  let visits=0;const update=bone.updateMatrixWorld;
  bone.updateMatrixWorld=function(force){visits++;return update.call(this,force);};
  const before=bone.matrixWorld.clone();
  station.visible=false;parent.position.set(7,2,3);parent.rotation.y=.6;
  scene.updateMatrixWorld(true);scene.updateMatrixWorld();
  assert.equal(visits,0,'the forced scene update must not visit a suspended skeleton');
  assert.deepEqual(bone.matrixWorld.elements,before.elements);
  station.visible=true;scene.updateMatrixWorld();
  assert.equal(visits,1);
  const expected=new Vector3(2,4,1).applyMatrix4(parent.matrixWorld);
  assert.ok(new Vector3().setFromMatrixPosition(bone.matrixWorld).distanceTo(expected)<1e-12);
  parent.visible=false;visits=0;scene.updateMatrixWorld(true);
  assert.equal(visits,0,'a hidden ancestor also suspends the station');
  parent.visible=true;scene.updateMatrixWorld(true);assert.equal(visits,1);
});

test('explicit world queries still update hidden stations and newly loaded children',()=>{
  const scene=new Group(),station=new SuspendedStationGroup(),bone=new Object3D();
  scene.add(station);station.add(bone);scene.updateMatrixWorld(true);
  station.visible=false;scene.position.x=10;station.position.y=3;bone.position.z=2;
  scene.updateMatrixWorld(true);
  assert.deepEqual(bone.getWorldPosition(new Vector3()).toArray(),[10,3,2]);
  const loaded=new Object3D();loaded.position.set(1,2,3);station.add(loaded);
  station.updateWorldMatrix(true,true);
  assert.deepEqual(new Vector3().setFromMatrixPosition(loaded.matrixWorld).toArray(),[11,5,3]);
  scene.position.x=20;scene.updateMatrixWorld(true);
  station.visible=true;scene.updateMatrixWorld();
  assert.deepEqual(new Vector3().setFromMatrixPosition(loaded.matrixWorld).toArray(),[21,5,3]);
});

test('re-entry refreshes cached local matrices even when automatic updates are disabled',()=>{
  const scene=new Group(),station=new SuspendedStationGroup(),bone=new Object3D();
  scene.add(station);station.add(bone);
  scene.traverse(node=>{node.updateMatrix();node.matrixAutoUpdate=false;});
  scene.updateMatrixWorld(true);
  station.visible=false;scene.position.x=4;scene.updateMatrix();scene.updateMatrixWorld();
  assert.equal(bone.matrixWorld.elements[12],0);
  station.visible=true;scene.updateMatrixWorld();
  assert.equal(bone.matrixWorld.elements[12],4,'dirty station propagates the new parent transform without a forced scene update');
});
