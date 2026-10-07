async page=>{
 // Start Playwright CLI from the repository root; fixture paths are cwd-relative.
 const root='.',profiles=['woman-casual','man-casual','woman-tailored','man-tailored','woman-daywear','man-workwear','jevica'],runs=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
 const load=async()=>{await page.goto('http://127.0.0.1:5181/?motion-debug=1');await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&(document.querySelector('#canvas-host')?.dataset.multiplayer==='joined')&&d.storePeopleTotal===d.storePeopleReady;},null,{timeout:90000});};
 const measure=async modes=>page.evaluate(async modes=>{
  const src=await(await fetch('/src/render-pipeline.js')).text(),imports=[...src.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>m[1]),{RenderPass}=await import(imports.find(u=>u.includes('RenderPass__js'))),original=RenderPass.prototype.render;
  let stats,sampling=false,mouths;const reset=()=>stats={frames:0,cpu:0,calls:0,triangles:0};reset();
  RenderPass.prototype.render=function(renderer,...args){if(!mouths){mouths=[];this.scene.traverse(m=>{if(['teeth','tongue01'].includes(m.material?.name))mouths.push(m);});}const start=performance.now(),before={...renderer.info.render};try{return original.call(this,renderer,...args);}finally{if(sampling){stats.frames++;stats.cpu+=performance.now()-start;stats.calls+=renderer.info.render.calls-before.calls;stats.triangles+=renderer.info.render.triangles-before.triangles;}}};
  const raf=()=>new Promise(r=>requestAnimationFrame(r)),runs=[];
  try{await raf();for(const mode of modes){for(const mesh of mouths)mesh.visible=mode!=='candidate-hidden';sampling=false;for(let i=0;i<60;i++)await raf();reset();sampling=true;let previous=await raf();const times=[];for(let i=0;i<120;i++){const now=await raf();times.push(now-previous);previous=now;}sampling=false;times.sort((a,b)=>a-b);runs.push({mode,mouthMeshes:mouths.length,medianMs:times[60],p95Ms:times[114],mainCpuMs:stats.cpu/stats.frames,calls:stats.calls/stats.frames,triangles:stats.triangles/stats.frames});}return runs;}finally{sampling=false;RenderPass.prototype.render=original;}
 },modes);
 try{await load();runs.push(...await measure(['baseline']));for(const profile of profiles)await page.route(`**/assets/characters/${profile}.glb`,route=>route.fulfill({contentType:'model/gltf-binary',path:`${root}/data/raw/characters/speech-merged/${profile}.glb`}));await load();runs.push(...await measure(['candidate-hidden','candidate-visible','candidate-hidden']));return {runs,errors};}finally{await page.unrouteAll({behavior:'wait'});await page.goto('about:blank');}
}
