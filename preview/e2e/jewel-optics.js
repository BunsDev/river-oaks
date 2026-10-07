async page=>{
 const checks=[],images=[],performanceRuns=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1000,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('http://127.0.0.1:5181/e2e/fixtures/jevica.html');await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});
 for(const view of ['full','portrait']){
  const result=await page.evaluate(view=>{
   const f=window.jevicaFixture;f.render(view,1000);let crystal;
   f.avatar.object.traverse(o=>{if(o.material?.name==='Jevica crown crystals')crystal=o.material;});
   const gl=f.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
   const capture=()=>{f.renderer.render(f.scene,f.camera);const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {pixels,calls:f.renderer.info.render.calls,triangles:f.renderer.info.render.triangles};};
   crystal.transmission=.35;const baseline=capture();f.outfit.updateOptics(f.camera,innerHeight);const adaptive=capture();
   let changed=0,maxDifference=0,sum=0;
   for(let i=0;i<baseline.pixels.length;i+=4){let pixelChanged=false;for(let c=0;c<3;c++){const d=Math.abs(baseline.pixels[i+c]-adaptive.pixels[i+c]);maxDifference=Math.max(maxDifference,d);sum+=d;if(d)pixelChanged=true;}if(pixelChanged)changed++;}
   return {view,transmission:crystal.transmission,changedPixels:changed,pixels:width*height,maxDifference,meanChannelDifference:sum/(width*height*3),baseline:{calls:baseline.calls,triangles:baseline.triangles},adaptive:{calls:adaptive.calls,triangles:adaptive.triangles}};
  },view);
  check(result.changedPixels/result.pixels<.001,`${view}: more than 99.9% of the fixed render is unchanged`);
  if(view==='portrait'){check(result.transmission===.35,'Portrait retains full crystal transmission');check(result.changedPixels===0,'Portrait remains pixel-identical');}
  await page.screenshot({path:`output/playwright/jewel-optics-${view}.png`});images.push(result);
 }
 await page.goto('about:blank');
 for(const deviceScaleFactor of [1,2]){
  const context=await page.context().browser().newContext({viewport:{width:1440,height:1000},deviceScaleFactor,reducedMotion:'no-preference'}),live=await context.newPage();live.on('pageerror',e=>errors.push(e.message));
  await context.addCookies(await page.context().cookies());
  try{
   await live.goto('http://127.0.0.1:5181/?motion-debug=1');await live.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&(document.querySelector('#canvas-host')?.dataset.multiplayer==='joined')&&d.storePeopleReady===d.storePeopleTotal;},null,{timeout:90000});
   const result=await live.evaluate(async()=>{
    const source=await(await fetch('/src/render-pipeline.js')).text(),imports=[...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>m[1]);
    const {RenderPass}=await import(imports.find(u=>u.includes('RenderPass__js'))),original=RenderPass.prototype.render;
    const runs=[];let mode='baseline',sampling=false,cost=0,calls=0,triangles=0,frames=0,transmission=0,crystal;
    RenderPass.prototype.render=function(renderer,...args){
     if(!crystal)this.scene.traverse(o=>{if(o.material?.name==='Jevica crown crystals')crystal=o.material;});
     if(mode==='baseline')crystal.transmission=.35;
     transmission=crystal.transmission;
     const start=performance.now(),before={...renderer.info.render};
     try{return original.call(this,renderer,...args);}finally{if(sampling){frames++;cost+=performance.now()-start;calls+=renderer.info.render.calls-before.calls;triangles+=renderer.info.render.triangles-before.triangles;}}
    };
    const raf=()=>new Promise(r=>requestAnimationFrame(r));
    try{
     for(const value of ['baseline','adaptive','adaptive','baseline']){
      mode=value;sampling=false;for(let i=0;i<30;i++)await raf();cost=calls=triangles=frames=0;sampling=true;
      const times=[];let previous=await raf();for(let i=0;i<120;i++){const now=await raf();times.push(now-previous);previous=now;}sampling=false;times.sort((a,b)=>a-b);
      runs.push({mode,transmission,medianMs:times[60],p95Ms:times[114],mainCpuMs:cost/frames,calls:calls/frames,triangles:triangles/frames});
     }
     return {runs};
    }finally{RenderPass.prototype.render=original;}
   });
   const baseline=result.runs.filter(r=>r.mode==='baseline'),adaptive=result.runs.filter(r=>r.mode==='adaptive');
   check(adaptive.every(r=>r.transmission===0),`${deviceScaleFactor}x: street-distance jewels omit the refraction pass`);
   check(Math.max(...adaptive.map(r=>r.triangles))<Math.min(...baseline.map(r=>r.triangles))*.8,`${deviceScaleFactor}x: at least 20% fewer scene triangle submissions`);
   check(Math.max(...adaptive.map(r=>r.calls))<Math.min(...baseline.map(r=>r.calls)),`${deviceScaleFactor}x: fewer scene draw calls`);
   performanceRuns.push({deviceScaleFactor,...result});
  }finally{await context.close();}
 }
 check(!errors.length,'No uncaught optics or profiling errors');return {checks,images,performanceRuns,errors,scope:'Fixed studio render comparison and same-scene ABBA timings in local Chromium, at normal and Retina density. Timings are observational, not a target-device FPS guarantee.'};
}
