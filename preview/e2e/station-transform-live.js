async page=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&(document.querySelector('#canvas-host')?.dataset.multiplayer==='joined')&&d.storePeopleTotal===d.storePeopleReady;},null,{timeout:90000});
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  const runs=await page.evaluate(async()=>{
    const {SuspendedStationGroup}=await import('/src/suspended-station-group.js');
    const prototype=SuspendedStationGroup.prototype,optimized=prototype.updateMatrixWorld;
    const baseline=Object.getPrototypeOf(prototype).updateMatrixWorld,runs=[];
    const sample=(frames,onFrame)=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{cancelAnimationFrame(handle);reject(new Error('Frame sampling timed out'));},30000);
      let count=0,handle;
      const tick=now=>{try{onFrame?.(now);if(++count>=frames){clearTimeout(timer);resolve();}else handle=requestAnimationFrame(tick);}catch(error){clearTimeout(timer);reject(error);}};
      handle=requestAnimationFrame(tick);
    });
    try {
      for(const mode of ['baseline','optimized','optimized','baseline']) {
        let totalMs=0,calls=0,previous=null;const times=[];
        const update=mode==='baseline'?baseline:optimized;
        prototype.updateMatrixWorld=function(force){const start=performance.now();try{return update.call(this,force);}finally{totalMs+=performance.now()-start;calls++;}};
        await sample(30);totalMs=0;calls=0;
        await sample(121,now=>{if(previous!==null)times.push(now-previous);previous=now;});
        times.sort((a,b)=>a-b);
        runs.push({mode,stationUpdateMsPerFrame:totalMs/121,callsPerFrame:calls/121,medianFrameMs:times[60],p95FrameMs:times[114],render:JSON.parse(document.querySelector('#canvas-host').dataset.renderStats)});
      }
    }finally{prototype.updateMatrixWorld=optimized;}
    return runs;
  });
  if(errors.length)throw new Error(errors.join('; '));
  return {runs,errors,scope:'Same live street/camera in ABBA order, all residents and rendering enabled; local RAF timings and instrumented station CPU time, not target hardware acceptance.'};
}
