import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRenderPipeline } from '../src/render-pipeline.js';

function fixture(options) {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),color=new THREE.Color('#123456');
  const leaf=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());leaf.userData.aoExclude=true;scene.add(leaf);
  const renderer={capabilities:{maxSamples:4},getPixelRatio:()=>1,shadowMap:{autoUpdate:true,needsUpdate:true},autoClear:true,
    getClearColor:target=>target.copy(color),getClearAlpha:()=>1,setClearAlpha:()=>{},setClearColor:()=>{},setRenderTarget:()=>{},clear:()=>{},render:()=>{}};
  const pipeline=createRenderPipeline(renderer,scene,camera,options);
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

test('complete GTAO renders preserve exclusions and initially hidden objects across frames and failure recovery',()=>{
  const {scene,leaf,renderer,pipeline}=fixture();
  const hiddenLeaf=leaf.clone();hiddenLeaf.visible=false;scene.add(hiddenLeaf);
  const points=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial());scene.add(points);
  const hiddenPoints=points.clone();hiddenPoints.visible=false;scene.add(hiddenPoints);
  let failGeometry=false,geometryPasses=0;
  renderer.render=subject=>{
    if(subject===scene){
      geometryPasses++;
      assert.equal(leaf.visible,false);
      assert.equal(points.visible,false,'Three excludes points from the normal buffer');
      if(failGeometry)throw new Error('geometry failure');
    } else {
      assert.equal(leaf.visible,true,'Full-screen AO and denoise passes leave foliage restored');
      assert.equal(points.visible,true);
    }
    assert.equal(hiddenLeaf.visible,false);
    assert.equal(hiddenPoints.visible,false);
  };
  try {
    for(const fail of [false,false,true,false]){
      failGeometry=fail;
      const render=()=>pipeline.occlusion.render(renderer,{texture:{}},{texture:{}});
      if(fail)assert.throws(render,/geometry failure/);else render();
      assert.equal(leaf.visible,true);
      assert.equal(points.visible,true);
      assert.equal(hiddenLeaf.visible,false);
      assert.equal(hiddenPoints.visible,false);
    }
    assert.equal(geometryPasses,4);
  } finally {pipeline.dispose();leaf.geometry.dispose();leaf.material.dispose();points.geometry.dispose();points.material.dispose();}
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

test('AO skips already hidden room subtrees and restores visible geometry after each pass',()=>{
  const {scene,leaf,renderer,pipeline}=fixture();
  const room=new THREE.Group();room.visible=false;scene.add(room);
  const dormant=new THREE.Object3D();room.add(dormant);
  let inspections=0;Object.defineProperty(dormant,'userData',{get(){inspections++;return {aoExclude:true};}});
  const line=new THREE.Line(),points=new THREE.Points(),excluded=new THREE.Group(),child=new THREE.Object3D();
  excluded.userData.aoExclude=true;excluded.add(child);scene.add(line,points,excluded);
  child.userData.aoExclude=true;
  renderer.render=subject=>{
    if(subject!==scene)return;
    assert.equal(inspections,0,'Inactive room contents do not participate in AO visibility work');
    assert.equal(dormant.visible,true,'A hidden parent already excludes its descendants');
    assert.equal(child.visible,true,'Excluding a group leaves its children untouched');
    for(const object of [leaf,line,points,excluded])assert.equal(object.visible,false);
  };
  try {
    pipeline.occlusion.render(renderer,{texture:{}},{texture:{}});
    for(const object of [leaf,line,points,excluded,child,dormant])assert.equal(object.visible,true);
    assert.equal(room.visible,false);
    // No cached exclusion list: newly added props are handled on the next frame.
    const prop=new THREE.Object3D();prop.userData.aoExclude=true;scene.add(prop);
    renderer.render=subject=>{if(subject===scene)assert.equal(prop.visible,false);};
    pipeline.occlusion.render(renderer,{texture:{}},{texture:{}});
    assert.equal(prop.visible,true);
  } finally {pipeline.dispose();leaf.geometry.dispose();leaf.material.dispose();line.geometry.dispose();line.material.dispose();points.geometry.dispose();points.material.dispose();}
});

test('graphics quality scales the scene buffers while the canvas keeps native size',()=>{
  const {renderer,pipeline}=fixture();
  try {
    pipeline.resize(3840,2160,1);
    assert.equal(pipeline.stats.renderScale,1);
    assert.equal(pipeline.stats.aoScale,0.5);
    pipeline.setRenderScale(0.6);
    assert.equal(pipeline.stats.renderScale,0.6);
    assert.equal(pipeline.stats.aoScale,1,'a 2304x1296 scene no longer needs half-resolution AO');
    assert.equal(renderer.transmissionResolutionScale,1);
    pipeline.resize(1920,1080,1);
    assert.equal(pipeline.stats.renderScale,0.6,'a resize keeps the chosen quality');
    pipeline.setRenderScale(Number.NaN);
    assert.equal(pipeline.stats.renderScale,1,'invalid scales fall back to native');
  } finally {pipeline.dispose();}
});

test('initial rendering waits for viewport dimensions before using bloom mip buffers',()=>{
 const {renderer,pipeline}=fixture();let rendered=0;renderer.render=()=>rendered++;
 try {pipeline.setRenderScale(.6);pipeline.render(1/60);assert.equal(rendered,0);pipeline.resize(0,0,1);pipeline.render(1/60);assert.equal(rendered,0);}finally{pipeline.dispose();}
});


test('software acceptance can disable MSAA without changing normal rendering',()=>{
  const normal=fixture(),software=fixture({samples:0});
  try {
    assert.equal(normal.pipeline.stats.samples,4);
    assert.equal(software.pipeline.stats.samples,0);
  } finally {
    for(const {pipeline,leaf} of [normal,software]){pipeline.dispose();leaf.geometry.dispose();leaf.material.dispose();}
  }
});

test('CPU acceptance can render without bloom, and bloom stays on by default',()=>{
  // Under the normal-colour override, bloom's blur spread one figure's invalid
  // values across the whole Mesa frame; CPU acceptance turns it off.
  const plain=fixture(),software=fixture({samples:0,bloom:false});
  try {
    assert.equal(plain.pipeline.stats.bloom,true);
    assert.equal(software.pipeline.stats.bloom,false);
  } finally {for(const {pipeline,leaf} of [plain,software]){pipeline.dispose();leaf.geometry.dispose();leaf.material.dispose();}}
});
