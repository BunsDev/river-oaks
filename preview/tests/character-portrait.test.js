import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, SRGBColorSpace, ACESFilmicToneMapping } from 'three';
import { portraitPixels, flipPortraitRows } from '../src/character-portrait.js';

test('native portrait uses a dedicated 4K target and restores the preview after capture',()=>{
  const previous={name:'preview'},calls=[];let current=previous;
  const renderer={outputColorSpace:SRGBColorSpace,toneMapping:ACESFilmicToneMapping,toneMappingExposure:1.1,capabilities:{maxTextureSize:8192},shadowMap:{enabled:false,type:1,autoUpdate:false,needsUpdate:false},getContext:()=>({MAX_RENDERBUFFER_SIZE:1,FRAMEBUFFER:2,FRAMEBUFFER_COMPLETE:3,checkFramebufferStatus:()=>3,getParameter:()=>8192,isContextLost:()=>false}),
    getRenderTarget:()=>current,setRenderTarget:target=>{current=target;},render:()=>calls.push([current.width,current.height,current.samples]),
    readRenderTargetPixels:(target,x,y,w,h,pixels)=>{assert.equal(pixels.length,3840*2160*4);pixels[0]=23;}};
  const camera={aspect:.8,updateProjectionMatrix(){calls.push(this.aspect);}};
  const result=portraitPixels({renderer,scene:new Scene(),camera});
  assert.equal(result.width,3840);assert.equal(result.height,2160);assert.equal(result.pixels[0],23);
  assert.deepEqual(calls,[16/9,[3840,2160,4],[3840,2160,0],.8]);assert.equal(current,previous);assert.equal(camera.aspect,.8);assert.deepEqual(renderer.shadowMap,{enabled:false,type:1,autoUpdate:false,needsUpdate:false});
  // A diagnostic capture can turn MSAA off; the resolve pass is unchanged.
  calls.length=0;portraitPixels({renderer,scene:new Scene(),camera,samples:0});
  assert.deepEqual(calls,[16/9,[3840,2160,0],[3840,2160,0],.8]);
});
test('failed capture restores target and camera, and weak contexts reject before allocation',()=>{
  const old={},camera={aspect:1,updateProjectionMatrix(){}};let current=old;
  const renderer={outputColorSpace:SRGBColorSpace,toneMapping:ACESFilmicToneMapping,toneMappingExposure:1.1,capabilities:{maxTextureSize:8192},shadowMap:{enabled:false,type:1,autoUpdate:false,needsUpdate:false},getContext:()=>({MAX_RENDERBUFFER_SIZE:1,FRAMEBUFFER:2,FRAMEBUFFER_COMPLETE:3,checkFramebufferStatus:()=>3,getParameter:()=>8192,isContextLost:()=>false}),
    getRenderTarget:()=>current,setRenderTarget:target=>{current=target;},render(){throw new Error('lost');}};
  assert.throws(()=>portraitPixels({renderer,scene:new Scene(),camera}),/lost/);assert.equal(current,old);assert.equal(camera.aspect,1);
  renderer.capabilities.maxTextureSize=2048;assert.throws(()=>portraitPixels({renderer,scene:new Scene(),camera}),/4K/);
});
test('readback flips row order without resampling any pixels',()=>{
  const pixels=new Uint8Array([1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255]);
  assert.deepEqual([...flipPortraitRows(pixels,2,2)],[7,8,9,255,10,11,12,255,1,2,3,255,4,5,6,255]);
  assert.deepEqual([...pixels],[1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255]);
});

test('an incomplete framebuffer fails closed instead of exporting a black PNG',()=>{
  const old={},camera={aspect:1,updateProjectionMatrix(){}};let current=old;
  const renderer={capabilities:{maxTextureSize:8192},shadowMap:{enabled:false,type:1,autoUpdate:false,needsUpdate:false},getContext:()=>({MAX_RENDERBUFFER_SIZE:1,FRAMEBUFFER:2,FRAMEBUFFER_COMPLETE:3,checkFramebufferStatus:()=>4,getParameter:()=>8192,isContextLost:()=>false}),getRenderTarget:()=>current,setRenderTarget:target=>current=target,render(){}};
  assert.throws(()=>portraitPixels({renderer,scene:new Scene(),camera}),/framebuffer/);assert.equal(current,old);assert.equal(camera.aspect,1);assert.equal(renderer.shadowMap.enabled,false);
});

test('portrait releases the transmission target even when readback fails', async () => {
  const THREE = await import('three');
  const scene = new THREE.Scene(), material = new THREE.MeshPhysicalMaterial({transmission: .35});
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const transmission = new THREE.WebGLRenderTarget(4, 4); let released = 0, current = null;
  transmission.addEventListener('dispose', () => released++);
  const renderer = {outputColorSpace: SRGBColorSpace, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.1,
    capabilities: {maxTextureSize: 8192}, shadowMap: {},
    properties: {get: () => ({uniforms: {transmissionSamplerMap: {value: transmission.texture}}})},
    getContext: () => ({MAX_RENDERBUFFER_SIZE: 1, FRAMEBUFFER: 2, FRAMEBUFFER_COMPLETE: 3, checkFramebufferStatus: () => 3, getParameter: () => 8192, isContextLost: () => false}),
    getRenderTarget: () => current, setRenderTarget: target => {current = target;}, render() {},
    readRenderTargetPixels() {throw new Error('readback failed');}};
  assert.throws(() => portraitPixels({renderer, scene, camera: new THREE.PerspectiveCamera()}), /readback failed/);
  assert.equal(released, 1);
  assert.equal(material.transmission, .35);
});
