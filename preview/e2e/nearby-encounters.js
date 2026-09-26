async page => {
  const errors=[],visits=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>{
    const d=document.querySelector('#canvas-host').dataset;
    return d.charactersReady==='24'&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true'&&d.carriageDriverReady==='true';
  },null,{timeout:90000});
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  if(!await page.locator('#community-more').evaluate(element=>element.open))await page.locator('#community-more > summary').click();
  const ids=await page.locator('#community-local option').evaluateAll(options=>options.map(option=>option.value));
  if(ids.length!==194)throw new Error(`Expected 194 encounter locations, got ${ids.length}`);
  if(!ids.includes('carriage-driver'))throw new Error('Missing carriage driver encounter');
  const firstIndoor=ids.findIndex(id=>id.startsWith('store-'));
  ids.unshift(...ids.splice(firstIndoor,1));
  for(const id of ids) {
    await page.locator('#community-local').selectOption(id);
    await page.locator('#community-meet').click();
    await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
    await page.waitForFunction(id=>window.__riverPeople().find(person=>person.id===id)?.reachable,id,{timeout:5000});
    await page.locator('#community-close').click();
    // Wait past the HUD's paint interval: the button must reflect this location.
    await page.waitForTimeout(200);
    const room=await page.locator('#walking-hud').getAttribute('data-inside');
    if(!await page.locator('#walking-meet-nearby').isEnabled())throw new Error(`Nearby disabled beside reachable person ${id}`);
    await page.locator('#walking-meet-nearby').click();
    await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
    const selected=await page.locator('#community-local').inputValue();
    await page.waitForFunction(id=>window.__riverPeople().find(person=>person.id===id)?.reachable,selected,{timeout:5000});
    if(await page.locator('#walking-hud').getAttribute('data-inside')!==room)throw new Error(`Nearby moved rooms at ${id}`);
    visits.push({location:id,selected,room});
    await page.locator('#community-close').click();
  }
  await page.screenshot({path:'output/playwright/nearby-encounters.png'});
  if(errors.length)throw new Error(errors.join('; '));
  return {visits,errors,scope:'Real directory travel followed by the nearby button at every resident location; same-room reachable conversations.'};
}
