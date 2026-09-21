async page => {
  const check = (value,message) => {if(!value)throw new Error(message);};
  const errors=[],decisions=[];
  page.on('pageerror',error=>errors.push(error.message));
  const record = async response => {
    if(response.url().endsWith('/v1/auto') && response.request().method()==='POST') {
      try { decisions.push(await response.json()); } catch { /* cancelled request */ }
    }
  };
  page.on('response',record);
  // Resident micro-actions are a separate subsystem. Only visitor decisions are
  // evaluated here; every /v1/auto request goes through the authenticated bridge.
  await page.route('**/v1/decisions',async route=>{
    const p=route.request().postDataJSON();await route.fulfill({json:{schema_version:1,tick:p.tick,latency_ms:0,
      decisions:p.agents.map(a=>({id:a.id,action:'continue',source:'local_rules'}))}});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5186/');await page.locator('#loading').waitFor({state:'hidden'});
  const toggle=page.locator('#panel-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await page.locator('#community-more').evaluate(el=>{el.open=true;});
  await page.locator('#community-run').click();
  await page.locator('#community-local').selectOption('local-00');
  await page.locator('#community-meet').click();await page.locator('#community-close').click();
  await page.locator('#auto-toggle').click();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('.auto-controls').dataset.state).interactions>=2,null,{timeout:35000});
  const support=await page.locator('.auto-controls').evaluate(el=>JSON.parse(el.dataset.state));
  const resources=await page.locator('#community-resources').textContent();
  check(!resources.includes('4 volunteer visits left') || !resources.includes('12 kits'),'Live Jev must commit real support');
  await page.waitForFunction(()=>Number(document.querySelector('#walking-hud').dataset.distance)>3,null,{timeout:20000});
  const distance=Number(await page.locator('#walking-hud').getAttribute('data-distance'));
  await page.screenshot({path:'output/playwright/auto-live.png'});
  await page.locator('#canvas-host').focus();await page.keyboard.press('Escape');
  check(await page.locator('#auto-toggle').getAttribute('aria-pressed')==='false','Manual escape must stop live auto');
  check(decisions.filter(d=>d.source==='jev').length>=3,'Expected actual remote visitor decisions');
  check(!errors.length,errors.join('; '));
  page.off('response',record);await page.unroute('**/v1/decisions');
  return {mode:'live_jev_auto',support,resources,distance_m:distance,manualTakeover:true,decisions,browserErrors:errors};
}
