async page => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);},errors=[],samples=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:3840,height:2160});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host')?.dataset;return d?.playerReady==='true'&&d.charactersReady==='24'&&d.storePeopleReady==='194'&&d.matureTrees==='230'&&d.plantedBeds==='38';});
  // Measure the full-quality budget: Sharpest pins native resolution and AO,
  // where Auto would trade resolution for frame rate on a busy GPU.
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=settings-section]').click();await page.locator('[data-quality=sharp]').click();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#canvas-host').dataset.quality||'{}').mode==='sharp');
  await page.locator('#panel-toggle').click();
  const measure=async label=>{
    await page.waitForTimeout(1500);
    const result=await page.evaluate(()=>new Promise(resolve=>{
      const timings=[];let previous=performance.now();
      const frame=now=>{timings.push(now-previous);previous=now;if(timings.length<120){requestAnimationFrame(frame);return;}
        timings.sort((a,b)=>a-b);const host=document.querySelector('#canvas-host'),canvas=host.querySelector('canvas');
        resolve({medianMs:timings[60],p95Ms:timings[114],canvas:[canvas.width,canvas.height],pipeline:JSON.parse(host.dataset.pipeline),render:JSON.parse(host.dataset.renderStats)});
      };requestAnimationFrame(frame);
    }));
    check(result.canvas[0]===3840&&result.canvas[1]===2160,`${label}: output must remain native UHD`);
    check(result.pipeline.renderScale===1&&result.pipeline.ao&&result.pipeline.aoScale===0.5&&result.pipeline.transmissionScale===0.5,`${label}: bounded auxiliary buffers`);
    await page.screenshot({path:`output/playwright/render-budget-${label}.png`});samples.push({label,...result});
  };
  for(const form of ['jevica','witch','alien']) {
    await page.locator('#player-form').selectOption(form);
    await page.waitForFunction(form=>{const d=document.querySelector('#canvas-host')?.dataset;return d?.playerReady==='true'&&d.playerForm===form;},form);
    await measure(form);
  }
  await page.locator('#player-form').selectOption('jevica');await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerForm==='jevica'&&document.querySelector('#canvas-host').dataset.playerReady==='true');
  await page.locator('#player-flight').click();await page.waitForFunction(()=>Number(document.querySelector('#walking-hud')?.dataset.altitude)>=3.4);
  await measure('jevica-bubble');
  await page.locator('#player-flight').click();await page.waitForFunction(()=>Number(document.querySelector('#walking-hud')?.dataset.altitude)===0);
  await page.setViewportSize({width:1920,height:1080});
  await page.waitForFunction(()=>{const pipeline=document.querySelector('#canvas-host')?.dataset.pipeline;return pipeline&&JSON.parse(pipeline).transmissionScale===1;});
  check(!errors.length,errors.join('; '));
  return {samples,fullResolutionRefractionAt1080p:true,errors,scope:'Local Chrome frame timing; moving residents and the full district remain enabled. No target-GPU performance claim.'};
}
