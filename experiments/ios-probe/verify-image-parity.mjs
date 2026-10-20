// Local shipped-image decoder comparison. Canvas2D and raw GPU upload evidence
// is not full material/shader, animation, physical-device or visual acceptance.
import { webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from '../../preview/e2e/fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const release = await holdBrowserLock('iOS image decoder parity');
let fixture, browser;
const report = { scope:'Local macOS WebKit Canvas2D and WebGL2 RGBA8 uploads, shipped standard-rig embedded PNGs; no resize or asset modification', status:'running', images:[] };
try {
  fixture = await startBrowserFixture();
  browser = await webkit.launch();
  const context = await browser.newContext();
  await context.addCookies([{name:'fixture_session',value:'bob',url:fixture.origin}]);
  const page = await context.newPage();
  // Only this isolated diagnostic document is supplied by the harness. Assets
  // retain the existing fixture's authenticated routes and original bytes.
  await page.route(fixture.origin + '/ios-image-parity', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Image decoder comparison</title>'}));
  await page.goto(fixture.origin + '/ios-image-parity');
  for (const profile of ['woman-casual','woman-tailored','woman-daywear','man-casual','man-tailored','man-workwear']) {
    let deadline;
    try {
    const images = await Promise.race([page.evaluate(async profile => {
      const response = await fetch('/assets/characters/' + profile + '.glb');
      if (!response.ok) throw new Error('Fixture asset unavailable: ' + response.status);
      const bytes = await response.arrayBuffer(), view = new DataView(bytes);
      const length = view.getUint32(12,true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,length)));
      const binaryOffset = 28 + length, results = [];
      const gpuCanvas=document.createElement('canvas'), gl=gpuCanvas.getContext('webgl2');
      if (!gl) throw new Error('WebGL2 unavailable');
      const texture=gl.createTexture(), framebuffer=gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
      const pixels = (source,width,height) => {
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,source);
        gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete texture framebuffer');
        const data=new Uint8Array(width*height*4);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);
        if(gl.getError()!==gl.NO_ERROR) throw new Error('GPU upload/readback failed');
        return data;
      };
      const compare = (first,second) => {
        let differingChannels=0,maxDelta=0,sumDelta=0,alphaDifferences=0,opaqueRGBDifferences=0,transparentRGBDifferences=0,partialRGBDifferences=0;
        for(let i=0;i<first.length;i++) {
          const delta=Math.abs(first[i]-second[i]);sumDelta+=delta;maxDelta=Math.max(maxDelta,delta);
          if(!delta)continue;differingChannels++;
          if(i%4===3)alphaDifferences++;
          else {const alpha=first[i-i%4+3];if(alpha===255)opaqueRGBDifferences++;else if(alpha===0)transparentRGBDifferences++;else partialRGBDifferences++;}
        }
        return {differingChannels,maxDelta,meanDelta:sumDelta/first.length,alphaDifferences,opaqueRGBDifferences,transparentRGBDifferences,partialRGBDifferences};
      };
      try {
      for (const [index,image] of json.images.entries()) {
        const part = json.bufferViews[image.bufferView];
        const blob = new Blob([new Uint8Array(bytes,binaryOffset+(part.byteOffset??0),part.byteLength)],{type:image.mimeType});
        const url=URL.createObjectURL(blob), html=new Image(), canvas=document.createElement('canvas');
        let bitmap;
        try {
          html.src=url; await html.decode();
          bitmap=await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'});
          if (html.naturalWidth!==bitmap.width||html.naturalHeight!==bitmap.height) throw new Error('Decoder dimensions differ');
          canvas.width=bitmap.width;canvas.height=bitmap.height;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          ctx.drawImage(bitmap,0,0);const first=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(html,0,0);
          const second=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          const canvasComparison=compare(first,second);
          const gpuComparison=compare(pixels(bitmap,bitmap.width,bitmap.height),pixels(html,bitmap.width,bitmap.height));
          const usages=[];
          for(const [materialIndex,material] of (json.materials??[]).entries()) {
            for(const [slot,info] of Object.entries({...material.pbrMetallicRoughness,...material})) {
              if(info && Number.isInteger(info.index) && json.textures?.[info.index]?.source===index) usages.push({materialIndex,slot,alphaMode:material.alphaMode??'OPAQUE'});
            }
          }
          results.push({profile,index,width:canvas.width,height:canvas.height,canvas:canvasComparison,gpu:gpuComparison,usages});
        } finally { bitmap?.close();html.src='';URL.revokeObjectURL(url);canvas.width=canvas.height=0; }
      }
      } finally { gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);gl.getExtension('WEBGL_lose_context')?.loseContext();gpuCanvas.width=gpuCanvas.height=0; }
      return results;
    },profile), new Promise((_, reject) => { deadline=setTimeout(() => reject(new Error('Image comparison exceeded 60-second profile deadline')), 60000); })]);
    report.images.push(...images);
    } finally { clearTimeout(deadline); }
  }
  report.exact = report.images.every(image=>image.gpu.differingChannels===0);
  report.canvasExact = report.images.every(image=>image.canvas.differingChannels===0);
  report.status = report.exact ? 'gpu-exact-pixels' : 'gpu-differences-observed';
} catch(error) { report.status='failed';report.error=error.message;process.exitCode=1; }
finally {
  await browser?.close();await fixture?.close();release();
  await mkdir('.runtime/ios-probe',{recursive:true});
  await writeFile('.runtime/ios-probe/image-parity.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,images:report.images.length,gpuExact:report.exact,canvasExact:report.canvasExact,error:report.error}));
}
