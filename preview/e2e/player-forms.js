async page => {
  const checks=[], errors=[];
  const check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  for(const form of ['jevica','witch','dorothy','scarecrow','tinman','lion','jevica']) {
    await page.locator('#player-form').selectOption(form);
    await page.waitForFunction(form=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&d.playerForm===form;},form);
    check(await page.locator('.player-portrait img').evaluate(img=>img.complete&&img.naturalWidth>0),`${form}: real model portrait loads`);
    check(await page.locator('#player-description').textContent(),`${form}: description updates`);
    check(await page.locator('#player-camera').getAttribute('aria-pressed')==='true',`${form}: third-person camera`);
    await page.locator('#player-flight').click();
    await page.waitForFunction(()=>document.querySelector('#player-flight').getAttribute('aria-pressed')==='true');
    check(await page.locator('#canvas-host').getAttribute('data-flight-vehicle')===form,`${form}: matching flight vehicle`);
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyB');
    await page.waitForFunction(()=>document.querySelector('#player-flight').getAttribute('aria-pressed')==='false');
    await page.screenshot({path:`output/playwright/${form}-district.png`});
  }
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
  await page.locator('.player-settings summary').focus();await page.keyboard.press('Enter');
  check(await page.locator('#player-form').isVisible(),'Keyboard expands character controls');
  check(await page.locator('#player-flight').evaluate(el=>el.getBoundingClientRect().height>=44),'44px flight target');
  await page.locator('#player-form').selectOption('lion');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerForm==='lion');
  await page.screenshot({path:'output/playwright/lion-ui-mobile-expanded.png'});
  check(errors.length===0,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,errors};
}
