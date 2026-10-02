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
  // Residents walk their routes, and one standing somewhere Jevica cannot reach is
  // rightly declined; meet whichever resident is reachable now.
  let met=null;
  for(const id of await page.locator('#community-local option[value^=local-]').evaluateAll(options=>options.map(option=>option.value))){
    await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();
    if(await page.locator('#community-dialogue').waitFor({state:'visible',timeout:2500}).then(()=>true,()=>false)){met=id;break;}
  }
  check(Boolean(met),`a reachable resident opens a conversation (${met})`);
  await page.locator('#community-close').click();
  await page.locator('#panel-toggle').click();await page.waitForTimeout(500);
  const point=()=>page.evaluate(id=>window.__riverPeople().find(p=>p.id===id).screen,met);
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
  check(await page.locator('#walking-hud').getAttribute('data-position')===start,'Secondary clicks and the drag do not move the visitor');
  // The resident has walked on since the conversation closed; as a player would,
  // turn and step toward them until they are in talking reach and on screen.
  const ready=()=>page.evaluate(id=>{const p=window.__riverPeople('spine_03').find(p=>p.id===id);const [x,y]=p?.screen??[-1,-1];return {inReach:Boolean(p?.visible&&p.reachable),onScreen:Boolean(p)&&p.depth>-1&&p.depth<1&&x>200&&x<1240&&y>100&&y<900,x};},met);
  const tap=async(key,ms)=>{await page.locator('#canvas-host').focus();await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
  for(const started=Date.now();;){const r=await ready();if(r.inReach&&r.onScreen)break;if(Date.now()-started>20000)throw new Error(`${met} never came within reach on screen (${JSON.stringify(r)})`);if(!r.onScreen)await tap(r.x>720?'ArrowRight':'ArrowLeft',120);else await tap('KeyW',250);}
  await page.waitForTimeout(400);
  const before=await page.locator('#walking-hud').getAttribute('data-position');
  await page.mouse.click(...await point());
  await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
  check(await page.locator('#community-local').inputValue()===met,'Primary click still selects the actual mesh');
  check(await page.locator('#walking-hud').getAttribute('data-position')===before,'Pointer gestures do not move the visitor');
  await page.screenshot({path:'output/playwright/pointer-gestures.png'});
  check(!errors.length,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,errors};
}
