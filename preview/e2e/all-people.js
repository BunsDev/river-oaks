async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const errors=[],visits=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  const origin=page.url().startsWith('http')?await page.evaluate(()=>location.origin):'http://127.0.0.1:5181';
  await page.goto(`${origin}/?motion-debug=1`);
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return (document.querySelector('#canvas-host')?.dataset.multiplayer==='joined')&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true'&&d.carriageDriverReady==='true';});
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'community-section');
  if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
  const ids=await page.locator('#community-local option').evaluateAll(options=>options.map(option=>option.value));
  const expected=await page.evaluate(()=>Number(document.querySelector('#canvas-host').dataset.storePeopleTotal)+1);
  if(ids.length!==expected)throw new Error(`Expected ${expected} indoor and companion encounters, got ${ids.length}`);
  if(!ids.includes('carriage-driver'))throw new Error('Missing carriage driver encounter');
  // Start indoors so the next outdoor visit also verifies leaving the room.
  // Outdoor-first ordering can pass every identity while missing that transition.
  const firstIndoor=ids.findIndex(id=>id.startsWith('store-'));
  if(firstIndoor<0)throw new Error('No indoor resident available for the directory transition');
  ids.unshift(...ids.splice(firstIndoor,1));
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
