async page => {
  const errors=[],visits=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.charactersReady==='24'&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true';});
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
  const ids=await page.locator('#community-local option').evaluateAll(options=>options.map(option=>option.value));
  if(ids.length!==193)throw new Error(`Expected 193 encounters, got ${ids.length}`);
  for(const id of ids) {
    await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();
    await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
    const name=await page.locator('#community-name').textContent();
    await page.waitForFunction(id=>{const person=window.__riverPeople().find(p=>p.id===id);return person?.visible&&person.reachable;},id,{timeout:5000});
    const person=await page.evaluate(id=>window.__riverPeople().find(p=>p.id===id),id);
    visits.push({id,name,role:await page.locator('.community-role').textContent(),task:person.task?.kind??null});
    await page.locator('#community-close').click();
  }
  await page.screenshot({path:'output/playwright/all-people-directory.png'});
  if(errors.length)throw new Error(errors.join('; '));
  return {visits,errors};
}
