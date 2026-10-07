async page=>{
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('http://127.0.0.1:5181/?motion-debug=1');
 // Tree counts follow the vegetation data the page loads, not a fixed number.
 const trees=(await (await page.request.get(new URL('/data/district-vegetation.json',page.url()).href)).json()).branch_supports.length;
 await page.waitForFunction(trees=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&(document.querySelector('#canvas-host')?.dataset.multiplayer==='joined')&&d.storePeopleTotal===d.storePeopleReady&&Number(d.plantedBeds)>0&&d.matureTrees===String(trees);},trees,{timeout:90000});
 return await page.evaluate(async()=>{
  const source=await (await fetch('/src/render-pipeline.js')).text(),imports=[...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>m[1]);
  const T=await import(imports.find(u=>/\/three\.js/.test(u)));
  const {RenderPass}=await import(imports.find(u=>u.includes('RenderPass__js'))),prototype=RenderPass.prototype,original=prototype.render;
  let scene,record=null;const runs=[],reference=new T.Group(),matrix=new T.Matrix4();let meshes=[];
  const raf=()=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{cancelAnimationFrame(handle);reject(new Error('Frame timed out'));},30000);
   const handle=requestAnimationFrame(now=>{clearTimeout(timeout);resolve(now);});
  });
  prototype.render=function(renderer,...args){
   scene=this.scene;const before=renderer.info.render,start=performance.now(),calls=before.calls,triangles=before.triangles;
   try{return original.call(this,renderer,...args);}finally{if(record){record.frames++;record.cpuMs+=performance.now()-start;record.calls+=before.calls-calls;record.triangles+=before.triangles-triangles;}}
  };
  try{
   await raf();const plants=scene.getObjectByName('Clipped boxwood and fountain grasses');
   meshes=plants.children.filter(m=>m.material&&['shrub_02','grass_medium_02'].includes(m.material.name));
   for(const name of ['shrub_02','grass_medium_02']){
    const parts=meshes.filter(m=>m.material.name===name),first=parts[0];
    const merged=new T.InstancedMesh(first.geometry,first.material,parts.reduce((n,m)=>n+m.count,0));let slot=0;
    merged.castShadow=first.castShadow;merged.receiveShadow=first.receiveShadow;merged.userData={...first.userData};
    for(const part of parts)for(let i=0;i<part.count;i++){part.getMatrixAt(i,matrix);merged.setMatrixAt(slot++,matrix);}
    merged.computeBoundingSphere();reference.add(merged);
   }
   plants.add(reference);
   for(const mode of ['baseline','optimized','optimized','baseline']){
    for(const mesh of meshes)mesh.visible=mode==='optimized';reference.visible=mode==='baseline';
    for(let i=0;i<45;i++)await raf();
    record={mode,frames:0,cpuMs:0,calls:0,triangles:0};const times=[];let previous=null;
    for(let i=0;i<121;i++){const now=await raf();if(previous!==null)times.push(now-previous);previous=now;}
    times.sort((a,b)=>a-b);
    runs.push({mode,medianMs:times[60],p95Ms:times[114],mainPassCpuMs:record.cpuMs/record.frames,calls:record.calls/record.frames,triangles:record.triangles/record.frames});record=null;
   }
  }finally{prototype.render=original;for(const mesh of meshes)mesh.visible=true;reference.removeFromParent();for(const mesh of reference.children)mesh.dispose();}
  return {runs,scope:'Same live scene and camera in ABBA order, original district-wide batches versus spatial batches; all people active, no GPU timer queries.'};
 });
}
