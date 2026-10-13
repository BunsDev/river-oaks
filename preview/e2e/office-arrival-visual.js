async page => {
  // Presentation stations supplement, rather than replace, the office-visit
  // normal-control journey. Keep this capture workload identical before/after.
  const stage=process.env.RIVER_OAKS_ARRIVAL_STAGE??'refined',captures=[],metrics=[],errors=[];
  if(!/^[a-z-]+$/.test(stage))throw new Error('Invalid capture stage');
  page.on('pageerror',e=>errors.push(e.stack??e.message));
  await page.addInitScript(()=>addEventListener('error',e=>{window.fixtureError=e.error?.stack??e.message;}));
  const shot=async name=>{const path=`output/playwright/office-arrival-${stage}-${name}.png`;await page.screenshot({path});captures.push(path);};
  const measure=async(kind,name)=>page.evaluate(async({kind,name})=>{
    const f=kind==='facade'?window.facadeFixture:window.officeFixture,r=f.renderer;
    const draw=()=>kind==='facade'?r.render(f.scene,f.camera):f.draw(f.time);
    const render=[],interval=[];let last=null;
    for(let i=0;i<90;i++)await new Promise(resolve=>requestAnimationFrame(now=>{const start=performance.now();draw();const end=performance.now();if(i>=30){render.push(end-start);if(last!==null)interval.push(now-last);}last=now;resolve();}));
    const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];
    const gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {name,viewport:[innerWidth,innerHeight],pixelRatio:r.getPixelRatio(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),draws:r.info.render.calls,triangles:r.info.render.triangles,memory:{...r.info.memory},heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,renderSubmissionMs:{median:percentile(render,.5),p95:percentile(render,.95)},frameIntervalMs:{median:percentile(interval,.5),p95:percentile(interval,.95)},sampleFrames:60,resourceBytes:performance.getEntriesByType('resource').reduce((n,e)=>n+e.decodedBodySize,0),scope:'Local Chromium fixture, CPU render submission and rAF intervals; not isolated GPU timing or physical-device acceptance'};
  },{kind,name});
  await page.goto('http://127.0.0.1:5173/e2e/fixtures/facades.html?view=sv-equinox');
  await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});
  const stations=await page.evaluate(async()=>{
    const {officesFor}=await import('/src/office-contract.js'),f=window.facadeFixture,o=officesFor(f.world)[0],n=o.outward,u=[-n[1],n[0]],a=o.facade;
    const p=(along,out,height)=>[a[0]+u[0]*along+n[0]*out,a[1]+u[1]*along+n[1]*out,height];
    // The opposite block occupies the tempting 30 m frontal camera position.
    // Use the existing registered street station for the wider building view.
    const views={approach:{camera:p(8,12,1.68),target:p(0,0,2.5)},facade:{...f.views['sv-equinox']},entrance:{camera:p(0,6,1.68),target:p(0,-1.3,2.1)}};
    for(const[name,v]of Object.entries(views))f.views[`office-${name}`]={label:`OFFICES · ${name.toUpperCase()}`,fov:62,...v};
    return {units:'east/north/up metres; heights above frontage',verticalFov:62,views};
  });
  for(const name of ['approach','facade','entrance']){
    await page.evaluate(name=>{const f=window.facadeFixture;f.renderer.setSize(innerWidth,innerHeight);f.camera.aspect=innerWidth/innerHeight;f.camera.updateProjectionMatrix();f.view(`office-${name}`,{hour:15,fantasyVisible:true});},name);
    await shot(name);metrics.push(await measure('facade',name));
  }
  await page.goto('http://127.0.0.1:5173/e2e/fixtures/office-elevator.html');
  await page.waitForFunction(()=>window.fixtureError||window.officeFixture?.frames.at(-1)?.ready,null,{timeout:90000});
  const failure=await page.evaluate(()=>window.fixtureError);if(failure)throw new Error(failure);
  for(const[name,time]of [['lobby',0],['boarding',2.4],['cabin',6.4],['reveal',9.4],['office',10.6]]){
    await page.evaluate(time=>{const f=window.officeFixture;for(let t=f.time;t<time;t+=1/60)f.draw(t);f.draw(time);},time);await shot(name);
    if(name==='cabin'||name==='office')metrics.push(await measure('office',name));
  }
  if(errors.length)throw new Error(errors.join('\n'));
  return {stage,stations,captures,metrics,errors,limits:'Presentation views. Normal input, auth, departure and responsive HUD are verified by separate journeys.'};
}
