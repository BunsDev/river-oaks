async page => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1&render-audit=1',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  await page.locator('#office-lobby').evaluate(b=>b.click());
  await page.waitForFunction(()=>document.querySelector('#office-enter')?.disabled===false);
  await page.evaluate(()=>{
    window.officePerformance=[];let phase='street',ride=0;
    const audit=window.__riverRenderAudit;
    window.officePerformanceCollect=next=>{
      const sample=audit.stop();if(sample.overflow)throw new Error('Office render audit overflow');
      const percentile=(values,p)=>values.sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]??null;
      const stats=key=>{const values=sample.frames.map(f=>f[key]);return {median:percentile([...values],.5),p95:percentile([...values],.95),maximum:values.length?Math.max(...values):null};};
      window.officePerformance.push({ride,phase,frames:sample.frames.length,intervalMs:stats('intervalMs'),cpuMs:stats('cpuMs'),graphics:audit.graphics()});
      phase=next;audit.start();
    };
    window.officePerformanceRide=value=>{ride=value;};
    new MutationObserver(()=>{const next=document.querySelector('#office-visit').dataset.phase;if(next&&next!==phase)window.officePerformanceCollect(next);}).observe(document.querySelector('#office-visit'),{attributes:true,attributeFilter:['data-phase']});
    audit.start();
  });
  await page.waitForTimeout(5000);
  for(const ride of [1,2]){
    await page.evaluate(ride=>window.officePerformanceRide(ride),ride);
    await page.locator('#canvas-host').focus();await page.keyboard.press('KeyF');
    await page.waitForFunction(()=>document.querySelector('#office-visit')?.open&&document.querySelector('#office-visit').dataset.phase==='office',null,{timeout:90000});
    await page.waitForTimeout(5000);
    await page.evaluate(()=>window.officePerformanceCollect('return'));
    await page.locator('#office-exit').click();
    await page.waitForFunction(()=>!document.querySelector('#office-visit').open);
    await page.waitForTimeout(5000);
    await page.evaluate(()=>window.officePerformanceCollect('street'));
  }
  const samples=await page.evaluate(()=>{window.__riverRenderAudit.stop();return window.officePerformance;});
  if(errors.length)throw new Error(errors.join('; '));
  for(const ride of [1,2])if(!samples.some(s=>s.ride===ride&&s.phase==='ascending'&&s.frames>10)||!samples.some(s=>s.ride===ride&&s.phase==='office'&&s.frames>60))throw new Error(`Insufficient real-world performance samples for ride ${ride}`);
  return {samples,errors,scope:'Two real shared-world visits on the local fixture authority, 1440x1000 desktop Chromium. CPU and rAF timing, not isolated GPU timing. Renderer.info describes the last render pass, not aggregate composer draw calls. Matched raw-fixture draw comparisons are in office-arrival-final-journeys.json.'};
}
