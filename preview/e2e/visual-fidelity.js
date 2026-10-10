async(page)=>{
  const { openHudSpace } = await import('./hud-navigation.js');
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const errors=[],consoleErrors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text()+' '+message.location().url);});
  const ready=async()=>{
    await page.locator('#loading').waitFor({state:'hidden'});
    await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.multiplayer==='joined'&&d.playerReady==='true'&&d.storePeopleTotal&&d.storePeopleReady===d.storePeopleTotal;},null,{timeout:60000});
    await page.waitForTimeout(1400);
  };
  const stats=()=>page.locator('#canvas-host').evaluate(element=>JSON.parse(element.dataset.renderStats));
  const openControls=async()=>{if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();};
  // The rail sidebar shows one section at a time; select the tab a control lives in first.
  const rail = section => openHudSpace(page, section);
  const voices = async () => { await rail('settings-section'); await page.locator('details.rail-disclosure', { hasText: 'Voices' }).evaluate(details => { details.open = true; }); };
  // Visual coverage does not require optional decision/voice provider credentials.
  for(const provider of ['jev','elevenlabs'])await page.route(`**/v1/settings/${provider}`,route=>route.fulfill({json:{source:'none',configured:false}}));
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('http://127.0.0.1:5173/');await ready();
  const canopy=await page.locator('#canopy-state').textContent();
  check(canopy.includes('2018 LiDAR'),'Observed district canopy must load');
  check((await page.locator('#canopy-source').textContent()).includes('does not pass'),'Failed historical comparison must remain visible');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await rail('explore-section');await page.locator('#destination').selectOption({label:'Cartier'});await page.locator('#visit-destination').click();
  await page.waitForTimeout(500);
  await page.screenshot({path:'output/playwright/storefront-recesses.png'});
  await rail('community-section');await page.locator('#community-more').evaluate(el=>{el.open=true;});await page.locator('#community-local').selectOption('store-osm-node-8172494969-person-2');await page.waitForTimeout(1100);await page.locator('#community-meet').click();await page.locator('#community-dialogue').waitFor({state:'visible'});
  await page.locator('#community-about').click();
  await page.waitForFunction(()=>!document.querySelector('#community-attribution').textContent.includes('checking'));
  await page.setViewportSize({width:3840,height:2160});
  await page.locator('#panel-toggle').click();await page.waitForTimeout(1400);
  const buffer=await page.locator('#canvas-host canvas').evaluate(canvas=>[canvas.width,canvas.height]);
  check(buffer[0]===3840 && buffer[1]===2160,'Visual sample must use a native UHD drawing buffer');
  await page.screenshot({path:'output/playwright/resident-fidelity-4k.png'});
  const full=await stats();
  const frames=await page.evaluate(()=>new Promise(resolve=>{
    const samples=[];let previous;
    function sample(now){if(previous!==undefined)samples.push(now-previous);previous=now;if(samples.length<120)requestAnimationFrame(sample);else{samples.sort((a,b)=>a-b);resolve({samples:120,median_ms:samples[60],p95_ms:samples[114]});}}
    requestAnimationFrame(sample);
  }));
  check(await page.locator('#canvas-host canvas').evaluate(canvas=>canvas.getContext('webgl2').getError())===0,'WebGL must have no pending errors');
  await page.locator('#community-close').click();await page.locator('#panel-toggle').click();
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('http://127.0.0.1:5173/');await ready();
  await openControls();
  // Warm district materials before measuring repeated rebuilds.
  await rail('settings-section');await page.locator('#reload').click();await ready();
  const baseline=await stats();
  for(let round=0;round<2;round++) {
    await openControls();
    await rail('settings-section');await page.locator('#reload').click();await ready();
  }
  const after=await stats();
  check(after.geometries<=baseline.geometries+2,`Reloading scenes must not accumulate geometry: ${JSON.stringify({baseline,after})}`);
  check(after.textures<=baseline.textures,`Reloading scenes must not accumulate textures: ${JSON.stringify({baseline,after})}`);
  check(errors.length===0 && consoleErrors.length===0,`Browser errors: ${[...errors,...consoleErrors].join('; ')}`);
  return {canopy,buffer,uhd:full,frame_sample:frames,frame_sample_scope:'Chrome animation-frame timing on this Mac; not a target-GPU or UE benchmark',baseline,afterReloads:after,errors,consoleErrors};
}
