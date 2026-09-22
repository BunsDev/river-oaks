import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRenderPipeline } from '../src/render-pipeline.js';

function fixture() {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),color=new THREE.Color('#123456');
  const leaf=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());leaf.userData.aoExclude=true;scene.add(leaf);
  const renderer={capabilities:{maxSamples:4},getPixelRatio:()=>1,shadowMap:{autoUpdate:true,needsUpdate:true},autoClear:true,
    getClearColor:target=>target.copy(color),getClearAlpha:()=>1,setClearAlpha:()=>{},setClearColor:()=>{},setRenderTarget:()=>{},clear:()=>{},render:()=>{}};
  const pipeline=createRenderPipeline(renderer,scene,camera);
  return {scene,leaf,renderer,pipeline};
}

test('the AO geometry pass reuses current scene transforms and shadow maps',()=>{
  const {scene,leaf,renderer,pipeline}=fixture();let geometryPasses=0;
  renderer.render=subject=>{
    if(subject!==scene)return;
    geometryPasses++;
    assert.equal(leaf.visible,false,'Leaves stay out of the normal buffer');
    assert.equal(renderer.shadowMap.autoUpdate,false,'Normals must not redraw sun shadows');
    assert.equal(renderer.shadowMap.needsUpdate,false,'A pending shadow update belongs to the beauty pass');
    assert.equal(scene.matrixWorldAutoUpdate,false,'The beauty pass already updated transforms');
  };
  try {
    pipeline.occlusion.render(renderer,{texture:{}},{texture:{}});
    assert.equal(geometryPasses,1);
    assert.equal(leaf.visible,true);
    assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(renderer.shadowMap.needsUpdate,true);
    assert.equal(scene.matrixWorldAutoUpdate,true);
  } finally {pipeline.dispose();leaf.geometry.dispose();leaf.material.dispose();}
});

test('a failed AO geometry render restores hidden foliage and renderer state',()=>{
  const {scene,leaf,renderer,pipeline}=fixture();
  renderer.render=subject=>{if(subject===scene)throw new Error('geometry failure');};
  try {
    assert.throws(()=>pipeline.occlusion.render(renderer,{texture:{}},{texture:{}}),/geometry failure/);
    assert.equal(leaf.visible,true);
    assert.equal(scene.overrideMaterial,null);assert.equal(scene.matrixWorldAutoUpdate,true);
    assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(renderer.shadowMap.needsUpdate,true);
    assert.equal(renderer.autoClear,true);
  } finally {pipeline.dispose();leaf.geometry.dispose();leaf.material.dispose();}
});

test('UHD refraction uses a bounded offscreen buffer while the output keeps native resolution',()=>{
  const {renderer,pipeline}=fixture();
  try {
    pipeline.resize(3840,2160,1);
    assert.equal(renderer.transmissionResolutionScale,0.5);
    assert.equal(pipeline.stats.transmissionScale,0.5);
    pipeline.resize(1920,1080,1);
    assert.equal(renderer.transmissionResolutionScale,1);
    pipeline.resize(1920,1080,2);
    assert.equal(renderer.transmissionResolutionScale,0.5,'Retina and native UHD have the same pixel budget');
  } finally {pipeline.dispose();}
});
