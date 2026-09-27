async page=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('http://127.0.0.1:5181/?motion-debug=1');
 await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&d.charactersReady==='24'&&d.storePeopleTotal===d.storePeopleReady;},null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  const gl=document.querySelector('#canvas-host canvas').getContext('webgl2');
  const debug=gl.getExtension('WEBGL_debug_renderer_info'),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const backend={vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,gpuTimer:Boolean(timer)};
  const source=await (await fetch('/src/render-pipeline.js')).text();
  const imports=[...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match=>match[1]);
  const patches=[],records=[],queries=[];let frame=0,recording=false;
  const raf=()=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{cancelAnimationFrame(handle);reject(new Error('Frame sampling timed out'));},30000);
   const handle=requestAnimationFrame(now=>{clearTimeout(timeout);resolve(now);});
  });
  try{
   for(const name of ['RenderPass','GTAOPass','UnrealBloomPass','OutputPass']){
    const url=imports.find(url=>url.includes(`${name}__js`)||url.includes(`/${name}.js`));
    if(!url)throw new Error(`Missing Vite import for ${name}`);
    const Type=(await import(url))[name],original=Type.prototype.render;
    const record={name,frames:0,cpuMs:0,calls:0,triangles:0,gpuMs:[]};records.push(record);patches.push([Type.prototype,original]);
    Type.prototype.render=function(renderer,...args){
     if(!recording)return original.call(this,renderer,...args);
     const before={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},start=performance.now();
     const query=timer&&frame%4===0?gl.createQuery():null;
     if(query)gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
     try{return original.call(this,renderer,...args);}finally{
      if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push({query,record});}
      record.frames++;record.cpuMs+=performance.now()-start;record.calls+=renderer.info.render.calls-before.calls;record.triangles+=renderer.info.render.triangles-before.triangles;
     }
    };
   }
   for(let i=0;i<30;i++)await raf();
   const times=[];let previous=null;recording=true;
   while(frame<120){const now=await raf();if(previous!==null)times.push(now-previous);previous=now;frame++;}
   recording=false;
   times.sort((a,b)=>a-b);
   for(const [prototype,original] of patches)prototype.render=original;patches.length=0;
   for(let i=0;i<30&&queries.some(({query})=>!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE));i++)await raf();
   const disjoint=timer&&gl.getParameter(timer.GPU_DISJOINT_EXT);
   for(const {query,record} of queries)if(!disjoint&&gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))record.gpuMs.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
   return {backend,disjoint,medianFrameMs:times[Math.floor(times.length/2)],p95FrameMs:times[Math.floor(times.length*.95)],passes:records.map(r=>({name:r.name,frames:r.frames,cpuMs:r.cpuMs/r.frames,calls:r.calls/r.frames,triangles:r.triangles/r.frames,gpuSamples:r.gpuMs.length,gpuMs:r.gpuMs.length?r.gpuMs.reduce((a,b)=>a+b)/r.gpuMs.length:null}))};
  }finally{for(const [prototype,original] of patches)prototype.render=original;for(const {query} of queries)gl.deleteQuery(query);}
 });
 if(errors.length)throw new Error(errors.join('; '));return {...result,errors,scope:'Local live street with all people, shadows and effects enabled. Pass CPU time includes driver submission; GPU timings are reported only when available and non-disjoint.'};
}
