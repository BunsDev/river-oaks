import {releaseTransmissionTargets} from './transmission-targets.js';
import { WebGLRenderTarget, HalfFloatType, PCFSoftShadowMap } from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const CHARACTER_PORTRAIT_SIZE=Object.freeze({width:3840,height:2160});
// Render directly at the export resolution, independently of the preview's
// CSS size, pixel ratio or adaptive quality. Never upscale a viewport capture.
export function portraitPixels({renderer,scene,camera}){
  const {width,height}=CHARACTER_PORTRAIT_SIZE,gl=renderer.getContext();
  if(gl.isContextLost()||Math.min(renderer.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))<width)
    throw new Error('Native 4K capture is unavailable on this graphics device.');
  const previous=renderer.getRenderTarget(),aspect=camera.aspect;
  const shadows={enabled:renderer.shadowMap.enabled,type:renderer.shadowMap.type,autoUpdate:renderer.shadowMap.autoUpdate,needsUpdate:renderer.shadowMap.needsUpdate};
  const complete=()=>{if(gl.isContextLost()||gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Native 4K framebuffer is unavailable on this graphics device.');};
  const linear=new WebGLRenderTarget(width,height,{samples:4,type:HalfFloatType});
  const target=new WebGLRenderTarget(width,height,{depthBuffer:false}),output=new OutputPass();
  try{
    Object.assign(renderer.shadowMap,{enabled:true,type:PCFSoftShadowMap,autoUpdate:true,needsUpdate:true});
    camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setRenderTarget(linear);complete();renderer.render(scene,camera);
    // Three renders offscreen scenes in linear HDR. Apply the same ACES and
    // sRGB output transform as the live preview exactly once before readback.
    output.render(renderer,target,linear);complete();
    const pixels=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    if(gl.isContextLost())throw new Error('Graphics context was lost during capture.');
    return {width,height,pixels};
  }finally{
    renderer.setRenderTarget(previous);Object.assign(renderer.shadowMap,shadows);camera.aspect=aspect;camera.updateProjectionMatrix();linear.dispose();target.dispose();output.dispose();releaseTransmissionTargets(renderer,scene);
  }
}
export function flipPortraitRows(pixels,width,height){
  const result=new Uint8ClampedArray(pixels.length),stride=width*4;
  for(let y=0;y<height;y++)result.set(pixels.subarray(y*stride,(y+1)*stride),(height-y-1)*stride);
  return result;
}
export async function characterPortraitPNG(options){
  const {pixels,width,height}=portraitPixels(options),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');if(!context)throw new Error('Portrait encoding is unavailable.');
  context.putImageData(new ImageData(flipPortraitRows(pixels,width,height),width,height),0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Portrait encoding failed.');
  return {blob,width,height};
}
