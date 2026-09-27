async page=>{
 const checks=[],portraits=[],performanceRuns=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 const profiles=['woman-casual','man-casual','woman-tailored','man-tailored','woman-daywear','man-workwear','jevica'];
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:420,height:600});
 const load=async index=>{await page.goto(`http://127.0.0.1:5181/e2e/fixtures/jevica.html${index===6?'':`?resident=skeleton-check-${index}&rig=${index}`}`);await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});};
 const capture=()=>{
  const f=window.jevicaFixture;f.render('portrait',1000);const gl=f.renderer.getContext(),pixels=new Uint8Array(420*600*4);gl.readPixels(0,0,420,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let binary='';for(let i=0;i<pixels.length;i+=4096)binary+=String.fromCharCode(...pixels.subarray(i,i+4096));return {pixels:btoa(binary),bodySkeletons:f.avatar.rig.skeletons.size};
 };
 try{
  for(const [index,profile]of profiles.entries()){
   await page.route('**/src/avatar-skeletons.js*',route=>route.fulfill({contentType:'application/javascript',body:'export function shareAvatarSkeletons(model){const set=new Set();model.traverse(m=>{if(m.isSkinnedMesh)set.add(m.skeleton)});return set;}'}));
   await load(index);const baseline=await page.evaluate(capture);await page.unroute('**/src/avatar-skeletons.js*');await load(index);const shared=await page.evaluate(capture);
   const image=await page.evaluate(({a,b})=>{a=atob(a);b=atob(b);let changed=0,maxDifference=0;for(let i=0;i<a.length;i+=4){let d=0;for(let j=0;j<3;j++)d=Math.max(d,Math.abs(a.charCodeAt(i+j)-b.charCodeAt(i+j)));if(d)changed++;maxDifference=Math.max(maxDifference,d);}return {changedPixels:changed,pixels:252000,maxDifference};},{a:baseline.pixels,b:shared.pixels});
   check(image.changedPixels===0,`${profile}: shared skeletons render pixel-identically`);check(shared.bodySkeletons===1&&baseline.bodySkeletons>=5,`${profile}: one body skeleton replaces per-mesh duplicates`);
   portraits.push({profile,...image,baselineSkeletons:baseline.bodySkeletons,sharedSkeletons:shared.bodySkeletons});
  }
  await page.goto('about:blank');
  for(const deviceScaleFactor of [1,2]){
   const context=await page.context().browser().newContext({viewport:{width:1440,height:1000},deviceScaleFactor,reducedMotion:'no-preference'}),live=await context.newPage();live.on('pageerror',e=>errors.push(e.message));
   try{
    await live.goto('http://127.0.0.1:5181/?motion-debug=1');await live.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&d.charactersReady==='24'&&d.storePeopleReady===d.storePeopleTotal;},null,{timeout:90000});
    const result=await live.evaluate(async()=>{
     const avatars=await(await fetch('/src/avatars.js')).text(),T=await import(avatars.match(/from\s+["']([^"']*deps\/three\.js[^"']*)["']/)[1]);
     const source=await(await fetch('/src/render-pipeline.js')).text(),imports=[...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>m[1]),{RenderPass}=await import(imports.find(u=>u.includes('RenderPass__js')));
     const originalRender=RenderPass.prototype.render,originalSkeleton=T.Skeleton.prototype.update;
     let pairs,gl,originalUpload,mode='shared',sampling=false,inside=false;const runs=[];let counters;
     const reset=()=>counters={frames:0,cpu:0,updates:0,matrices:0,boneCpu:0,uploads:0,calls:0,triangles:0};reset();
     T.Skeleton.prototype.update=function(){const start=performance.now();try{return originalSkeleton.call(this);}finally{if(sampling&&inside){counters.updates++;counters.matrices+=this.bones.length;counters.boneCpu+=performance.now()-start;}}};
     RenderPass.prototype.render=function(renderer,...args){
      if(!pairs){pairs=[];this.scene.traverse(mesh=>{if(mesh.isSkinnedMesh)pairs.push({mesh,shared:mesh.skeleton,duplicate:mesh.skeleton.clone()});});gl=renderer.getContext();originalUpload=gl.texSubImage2D;gl.texSubImage2D=function(...args){if(sampling&&inside)counters.uploads++;return originalUpload.apply(this,args);};}
      for(const pair of pairs)pair.mesh.skeleton=mode==='duplicate'?pair.duplicate:pair.shared;
      const start=performance.now(),before={...renderer.info.render};inside=true;
      try{return originalRender.call(this,renderer,...args);}finally{inside=false;if(sampling){counters.frames++;counters.cpu+=performance.now()-start;counters.calls+=renderer.info.render.calls-before.calls;counters.triangles+=renderer.info.render.triangles-before.triangles;}}
     };
     const raf=()=>new Promise(r=>requestAnimationFrame(r));
     try{
      for(const value of ['duplicate','shared','shared','duplicate']){
       mode=value;sampling=false;for(let i=0;i<45;i++)await raf();reset();sampling=true;
       const times=[];let previous=await raf();for(let i=0;i<120;i++){const now=await raf();times.push(now-previous);previous=now;}sampling=false;times.sort((a,b)=>a-b);
       runs.push({mode,medianMs:times[60],p95Ms:times[114],mainCpuMs:counters.cpu/counters.frames,skeletonUpdates:counters.updates/counters.frames,boneMatrices:counters.matrices/counters.frames,skeletonCpuMs:counters.boneCpu/counters.frames,textureUploads:counters.uploads/counters.frames,calls:counters.calls/counters.frames,triangles:counters.triangles/counters.frames});
      }
      return {runs,skinnedMeshes:pairs.length,sharedSkeletons:new Set(pairs.map(p=>p.shared)).size};
     }finally{sampling=false;RenderPass.prototype.render=originalRender;T.Skeleton.prototype.update=originalSkeleton;if(gl)gl.texSubImage2D=originalUpload;for(const p of pairs??[]){p.mesh.skeleton=p.shared;p.duplicate.dispose();}}
    });
    const baseline=result.runs.filter(r=>r.mode==='duplicate'),shared=result.runs.filter(r=>r.mode==='shared');
    check(Math.max(...shared.map(r=>r.skeletonUpdates))<Math.min(...baseline.map(r=>r.skeletonUpdates))*.6,`${deviceScaleFactor}x: at least 40% fewer skeleton updates in the main pass`);
    check(Math.max(...shared.map(r=>r.boneMatrices))<Math.min(...baseline.map(r=>r.boneMatrices))*.5,`${deviceScaleFactor}x: at least 50% fewer bone matrix updates`);
    check(Math.max(...shared.map(r=>r.textureUploads))<Math.min(...baseline.map(r=>r.textureUploads)),`${deviceScaleFactor}x: fewer GPU texture uploads`);
    performanceRuns.push({deviceScaleFactor,...result});
   }finally{await context.close();}
  }
  check(!errors.length,'No uncaught skeleton sharing errors');return {checks,portraits,performanceRuns,errors,scope:'All seven fixed portraits, then paired duplicate/shared/shared/duplicate main-pass instrumentation in local Chromium at normal and Retina density. CPU and RAF timings are observational.'};
 }finally{await page.unroute('**/src/avatar-skeletons.js*');await page.goto('about:blank');}
}
