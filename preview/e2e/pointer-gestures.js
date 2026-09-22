async page => {
  const checks=[],errors=[];
  const check=(condition,message)=>{if(!condition)throw new Error(message);checks.push(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.charactersReady==='24');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
  await page.locator('#community-local').selectOption('local-00');await page.locator('#community-meet').click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});await page.locator('#community-close').click();
  await page.locator('#panel-toggle').click();await page.waitForTimeout(500);
  const point=()=>page.evaluate(()=>window.__riverPeople().find(p=>p.id==='local-00').screen);
  const start=await page.locator('#walking-hud').getAttribute('data-position');
  for(const button of ['right','middle']) {
    await page.mouse.click(...await point(),{button});
    await page.waitForTimeout(100);
    check(!await page.locator('#community-dialogue').isVisible(),`${button} click does not start a conversation`);
    await page.keyboard.press('Escape');
  }
  const [x,y]=await point();
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+100,y,{steps:5});await page.mouse.move(x,y,{steps:5});await page.mouse.up();
  await page.waitForTimeout(100);
  check(!await page.locator('#community-dialogue').isVisible(),'Camera drag returning to its starting point does not select a person');
  await page.mouse.click(...await point());
  await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
  check(await page.locator('#community-local').inputValue()==='local-00','Primary click still selects the actual mesh');
  check(await page.locator('#walking-hud').getAttribute('data-position')===start,'Pointer gestures do not move the visitor');
  await page.screenshot({path:'output/playwright/pointer-gestures.png'});
  check(!errors.length,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,errors};
}
