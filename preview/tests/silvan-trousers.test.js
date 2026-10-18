import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar} from '../src/avatars.js';
import {createReferenceStyle} from '../src/reference-archetypes.js';
import {sharedAppearance} from '../src/shared-appearances.js';
import {garmentEdgeFixture} from './helpers/garment-edges.js';
import {SILVAN_DRAPES} from '../src/silvan-drape-geometry.js';
import {bodyCoverageFixture} from './helpers/body-coverage.js';

for(const id of ['forest-aristocrat-feminine'])test(`${id}: linen covers the knee through bends`,async t=>{
  const source=await loadCharacterRig('jevica'),avatar=instantiateAvatar(source,{targetHeight:1.685,id:'knee-test'}),model=avatar.model;
  const root=new THREE.Group();root.add(model);
  const body=model.getObjectByName('Jevica'),sourcePositions=body.geometry.attributes.position.array.slice(),sourceWeights=body.geometry.attributes.skinWeight.array.slice();
  const look=createReferenceStyle(avatar,sharedAppearance(id));
  const trousers=model.getObjectsByProperty('isMesh',true).filter(mesh=>mesh.material.color?.getHexString()==='e7dcc4');
  assert.equal(trousers.length,1);assert(trousers[0].isSkinnedMesh);
  const layers=garmentEdgeFixture(model,trousers[0],SILVAN_DRAPES.map(recipe=>model.getObjectByName(recipe.name)));
  const coverage=bodyCoverageFixture(model,model.getObjectByName('Jevica'),trousers,{bottom:-.43,top:-.31}),failures=[];
  const positions=trousers[0].geometry.attributes.position.array.slice();
  try{
    root.position.set(3,2,-5);root.rotation.set(.1,.7,-.15);root.scale.setScalar(1.2);
    for(const [left,right]of [[0,0],[45,45],[90,90],[45,90],[90,45]]){
      for(const [side,degrees]of [['l',left],['r',right]])for(const [name,sign]of [['thigh',-1],['calf',1]]){const bone=model.getObjectByName(`${name}_${side}`);bone.quaternion.copy(avatar.rest.get(bone)).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(bone).x,sign*degrees*Math.PI/180));}
      look.update();const result=coverage.sample();t.diagnostic(JSON.stringify({left,right,...result}));assert(result.tested>6000);assert(result.views.every(view=>view.tested>0));const edges=layers.sample();assert(edges.every(row=>row.testedEdges>0&&row.crossings===0),JSON.stringify(edges));if(result.uncovered)failures.push({left,right,...result});
    }
    assert.deepEqual(failures,[],'linen leaves the knee exposed');
    assert.deepEqual(trousers[0].geometry.attributes.position.array,positions,'posing preserves the owned rest surface');
    assert.deepEqual(body.geometry.attributes.position.array,sourcePositions,'fitting preserves the source body');
    assert.deepEqual(body.geometry.attributes.skinWeight.array,sourceWeights,'fitting preserves source weights');
  }finally{layers.dispose();look.dispose();avatar.dispose();}
});


test('actual Silvan coverage rejects a removed knee patch',async()=>{
  const avatar=instantiateAvatar(await loadCharacterRig('jevica'),{targetHeight:1.685,id:'hole-test'}),model=avatar.model,look=createReferenceStyle(avatar,sharedAppearance('forest-aristocrat-feminine'));
  const pants=model.getObjectByName('Forest aristocrat linen trousers'),coverage=bodyCoverageFixture(model,model.getObjectByName('Jevica'),[pants,...['l','r'].map(side=>model.getObjectByName(`Forest aristocrat boot shaft ${side}`))],{bottom:-.43,top:-.31});
  model.updateMatrixWorld(true);
  const frame=new THREE.Matrix4().compose(model.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3()),model.getWorldQuaternion(new THREE.Quaternion()),model.getWorldScale(new THREE.Vector3())).invert();
  const rest=Array.from({length:pants.geometry.attributes.position.count},(_,i)=>pants.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(pants.matrixWorld).applyMatrix4(frame));
  const indices=[];for(let n=0;n<pants.geometry.index.count;n+=3){const ids=[0,1,2].map(c=>pants.geometry.index.getX(n+c));if(ids.some(i=>rest[i].x>0&&rest[i].y>-.43&&rest[i].y<-.31))continue;indices.push(...ids);}
  try{pants.geometry.setIndex(indices);const result=coverage.sample();assert(result.tested>6000);assert(result.uncovered>100,'visible knee hole must fail coverage');}
  finally{look.dispose();avatar.dispose();}
});
