async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
  const check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  const ready=()=>page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return document.querySelector('#canvas-host').dataset.multiplayer==='joined'&&d.storePeopleTotal&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true';},null,{timeout:60000});
  await ready();
  const panel=async section=>{
    if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
    await openHudSpace(page, section);
  };
  const directory=async id=>{
    await panel('community-section');
    if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
    await page.locator('#community-local').selectOption(id);await page.waitForTimeout(1100);await page.locator('#community-meet').click();
    await page.locator('#community-dialogue').waitFor({state:'visible'});await page.locator('#community-close').click();
    await page.locator('#panel-toggle').click();await page.waitForTimeout(500);
  };
  const clickPerson=async id=>{
    await page.waitForTimeout(1100);
    // Aim at a body landmark; swinging limbs can put the bounding-box centre
    // beside the visible torso. Animation remains enabled during real clicks.
    const person=await page.evaluate(id=>window.__riverPeople('spine_03').find(person=>person.id===id),id);
    check(person.visible&&person.reachable,`${id}: visible and within reach`);
    await page.mouse.click(...person.screen);
    try {await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});}
    catch(error){throw new Error(`${id}: pointer conversation failed after ${checks.join('; ')}; point ${JSON.stringify(person.screen)}; ${error.message}`);}
    check(await page.locator('#community-local').inputValue()===id,`${id}: pointer selects the actual person`);
    await page.locator('#community-close').click();
  };
  const staff='store-osm-node-8172494969-person-2';
  await directory(staff);await clickPerson(staff);
  await panel('settings-section');await page.getByText('Visible layers',{exact:true}).click();await page.locator('[data-layer=interiors]').uncheck();
  await page.locator('#panel-toggle').click();await page.waitForTimeout(500);
  const hidden=await page.evaluate(id=>window.__riverPeople().find(p=>p.id===id),staff);
  check(!hidden.visible,'Interior layer hides the staff mesh');
  await page.mouse.click(...hidden.screen);await page.waitForTimeout(250);
  check(!await page.locator('#community-dialogue').isVisible(),'Hidden staff cannot be clicked');
  await panel('settings-section');await page.locator('[data-layer=interiors]').check();
  await page.locator('#panel-toggle').click();await page.waitForTimeout(500);await clickPerson(staff);
  await panel('community-section');check(await page.locator('#community-reset').count()===0,'Solo reset control is absent');
  await page.locator('#panel-toggle').click();await page.waitForTimeout(500);await clickPerson(staff);
  await panel('settings-section');await page.locator('#reload').click();await ready();
  await directory('store-osm-node-8172494969-person-2');await clickPerson('store-osm-node-8172494969-person-2');
  await page.screenshot({path:'output/playwright/interaction-lifecycle.png'});
  check(errors.length===0,`No uncaught errors: ${errors.join('; ')}`);
  return {checks,errors};
}
