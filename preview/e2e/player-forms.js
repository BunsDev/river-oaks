async page => {
  const checks=[], errors=[];
  const check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'reduce'});
  const current=await page.evaluate(()=>location.origin);
  await page.goto(current.startsWith('http')?current:'http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  check(await page.locator('#canvas-host').getAttribute('data-player-form')==='jevica','Jevica is the playable character');
  check(await page.locator('#player-form').count()===0,'Retired appearance selector is absent');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  for(const form of ['jevica']) {
    await page.waitForFunction(form=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&d.playerForm===form;},form);
    await page.locator('.player-portrait img').evaluate(img=>img.decode());
    check(await page.locator('.player-portrait img').evaluate(img=>img.complete&&img.naturalWidth>0),`${form}: real model portrait loads`);
    check(await page.locator('#player-description').textContent(),`${form}: description updates`);
    check(await page.locator('#player-camera').getAttribute('aria-pressed')==='true',`${form}: third-person camera`);
    await page.locator('#player-flight').click();
    await page.waitForFunction(()=>document.querySelector('#player-flight').getAttribute('aria-pressed')==='true');
    check(await page.locator('#canvas-host').getAttribute('data-flight-vehicle')===form,`${form}: matching flight vehicle`);
    await page.waitForFunction(()=>Number(document.querySelector('#walking-hud').dataset.altitude)>=3.4,{},{timeout:15000});
    await page.screenshot({path:`output/playwright/${form}-flight.png`});
    check(true,`${form}: completes ascent to cruising altitude`);
    await page.waitForFunction(()=>Number(document.querySelector('#walking-hud').dataset.altitude)>2);
    await page.locator('#canvas-host').focus();
    const before=Number(await page.locator('#walking-hud').getAttribute('data-altitude'));
    await page.keyboard.down('Space');
    try {
      await page.waitForFunction(before=>Number(document.querySelector('#walking-hud').dataset.altitude)>before+0.4,before,{timeout:5000});
    } finally {await page.keyboard.up('Space');}
    check(true,`${form}: ascent changes real altitude`);
    check(await page.locator('.walking-title strong').textContent()==='In flight',`${form}: HUD reflects flight`);
    await page.screenshot({path:`output/playwright/${form}-flight.png`});
    await page.keyboard.press('KeyB');
    await page.waitForFunction(()=>document.querySelector('#player-flight').getAttribute('aria-pressed')==='false'&&Number(document.querySelector('#walking-hud').dataset.altitude)===0);
    check(Number(await page.locator('#walking-hud').getAttribute('data-altitude'))===0,`${form}: landed at ground level`);
    await page.screenshot({path:`output/playwright/${form}-district.png`});
  }
  if(!await page.locator('.player-settings').evaluate(e=>e.open))await page.locator('.player-settings > summary').click();
  await page.locator('#player-camera').click();
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.cameraMode==='first');
  check(true,'First-person toggle');
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyV');
  check(await page.locator('#player-camera').getAttribute('aria-pressed')==='true','V restores third person');
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:'output/playwright/jevica-ui-dark.png'});
  await page.setViewportSize({width:390,height:844});
  await page.reload();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  check(!await page.locator('.player-settings').evaluate(el=>el.open),'Mobile character controls start collapsed');
  check(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'No mobile horizontal overflow');
  await page.screenshot({path:'output/playwright/jevica-ui-mobile.png'});
  await page.locator('.visit-tools-toggle').focus();await page.keyboard.press('Enter');
  check(await page.locator('#player-flight').isVisible(),'Keyboard expands character controls');
  check(await page.locator('#player-flight').evaluate(el=>el.getBoundingClientRect().height>=44),'44px flight target');
  await page.locator('.player-portrait img').evaluate(img=>img.decode());
  check(await page.locator('.player-portrait img').evaluate(img=>new URL(img.src).pathname)==='/assets/characters/jevica-portrait.png','Mobile portrait matches the current form');
  await page.screenshot({path:'output/playwright/jevica-ui-mobile-expanded.png'});
  check(errors.length===0,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,errors};
}
