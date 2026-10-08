async page => {
  const checks=[], errors=[];
  const check=(ok,label)=>{if(!ok) throw new Error(label); checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  // In the shared town the server confirms each conversation's travel and focus,
  // refuses a second travel within one second, and a closed dialogue fades out.
  const dialogue=()=>page.locator('#community-dialogue');
  const opened=()=>dialogue().waitFor({state:'visible',timeout:15000}).then(()=>true,()=>false);
  const close=async()=>{await page.locator('#community-close').click();await dialogue().waitFor({state:'hidden',timeout:10000});};
  let lastTravel=0;
  const travel=async action=>{await page.waitForTimeout(Math.max(0,1100-(Date.now()-lastTravel)));await action();lastTravel=Date.now();};
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({state:'hidden'});
  // The loading overlay can be hidden before loading starts; wait for the player.
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:120000});
  check(await page.locator('#walking-hud').isVisible(),'Starts on foot');
  check(await page.locator('#overview,#street,#ride,#walk,#flight-hud,#scene-select,#economy-hud').count()===0,'No alternate view or scene controls');
  check(await page.locator('#walking-hud').getAttribute('data-eye-height')==='1.68','Camera remains at human eye height');
  const before=JSON.parse(await page.locator('#walking-hud').getAttribute('data-position'));
  await page.locator('#canvas-host').focus();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1000); await page.keyboard.up('KeyW');
  const after=JSON.parse(await page.locator('#walking-hud').getAttribute('data-position'));
  check(Math.hypot(after[0]-before[0],after[2]-before[2])>0.5,'Walking advances along the street');
  await page.mouse.wheel(0,-700);
  check(await page.locator('#walking-hud').getAttribute('data-eye-height')==='1.68','Scrolling cannot zoom into an aerial view');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false') await page.locator('#panel-toggle').click();
  check(await page.locator('.panel-scroll > section').first().getAttribute('id')==='community-section','People precede shop navigation');
  // Residents stay indoors in the shared town: meet one so people are nearby.
  await travel(()=>page.locator('#community-meet').click());
  check(await opened(),'Meeting a local opens the conversation');
  await close();
  const first=page.locator('.nearby-person').first();
  await first.focus();
  const focused=await first.getAttribute('id');
  await page.waitForTimeout(650);
  check(await page.evaluate(id=>document.activeElement.id===id,focused),'Nearby card retains keyboard focus across refreshes');
  await travel(()=>page.keyboard.press('Enter'));
  check(await opened(),'Keyboard opens nearby conversation');
  await page.locator('#community-about').click();
  await page.waitForFunction(()=>!document.querySelector('#community-attribution').textContent.includes('checking'));
  check((await page.locator('#community-speech').textContent()).length>40,'Conversation answers a topic');
  await close();
  check(await page.locator('#canvas-host').evaluate(el=>el===document.activeElement),'Closing returns focus to walking');
  await travel(()=>page.keyboard.press('KeyE'));
  check(await opened(),'E reopens the nearby encounter');
  await close();
  // Open More actions only when it is shown and closed: the HUD moves actions between
  // the primary slot and More as context changes, and a second summary click closes it.
  if(!await page.locator('.walking-more').evaluate(more=>more.open||more.hidden))await page.locator('.walking-more summary').click();
  await travel(()=>page.locator('#walking-meet-nearby').click());
  check(await opened(),'Primary Meet someone nearby action opens conversation');
  await close();
  await page.keyboard.press('Escape');
  check(await page.locator('#walking-hud').isVisible(),'Escape never enters an aerial mode');
  await page.locator('[data-section=explore-section]').click();
  await page.locator('#destination').selectOption({label:'Cartier'});
  await travel(()=>page.locator('#visit-destination').click());
  const atCartier=()=>page.waitForFunction(()=>document.querySelector('.walking-title strong')?.textContent==='Cartier'&&!document.querySelector('#walking-hud').dataset.inside,null,{timeout:15000}).then(()=>true,()=>false);
  check(await atCartier()&&await page.locator('#walking-hud').isVisible(),'Shop arrival stays on foot at the Cartier pavement');
  await page.locator('#reload').click();
  await page.locator('#loading').waitFor({state:'hidden'});
  check(await page.locator('#walking-hud').isVisible(),'Reload stays on foot');
  await page.locator('#panel-toggle').click();
  await page.screenshot({path:'output/playwright/street-level-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  check(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Mobile has no horizontal overflow');
  // Arrival leaves the visitor on the pavement and residents stay indoors, so step
  // inside Cartier before checking the mobile meet action.
  check(await atCartier(),'Reload returns to the Cartier pavement');
  await page.locator('#canvas-host').focus();
  await travel(()=>page.keyboard.press('KeyF'));
  check(await page.waitForFunction(()=>document.querySelector('#walking-hud').dataset.inside,null,{timeout:15000}).then(()=>true,()=>false),'F steps inside the arrival shop');
  if(!await page.locator('.walking-more').evaluate(more=>more.open||more.hidden))await page.locator('.walking-more summary').click();
  await travel(()=>page.locator('#walking-meet-nearby').click());
  check(await opened(),'Mobile primary action opens conversation');
  await page.screenshot({path:'output/playwright/street-level-mobile.png'});
  await close();
  check(errors.length===0,`No page errors: ${errors.join('; ')}`);
  return {passed:checks.length,checks,errors};
}
