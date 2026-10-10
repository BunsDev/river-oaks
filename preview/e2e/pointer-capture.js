async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks=[],errors=[];
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.storePeopleTotal&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true';},null,{timeout:90000});
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'community-section');
  if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
  const id='store-osm-node-8172494967-person-9';
  await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});await page.locator('#community-close').click();
  await page.locator('#panel-toggle').click();await page.waitForTimeout(500);
  const person=await page.evaluate(id=>window.__riverPeople().find(p=>p.id===id),id);
  check(person.visible&&person.reachable,'The worker is visible and reachable');
  check(await page.evaluate(([x,y])=>Boolean(document.elementFromPoint(x,y)?.closest('#canvas-host')),person.screen),'Worker hit point is outside UI overlays');
  await page.evaluate(()=>{
    const host=document.querySelector('#canvas-host');window.pendingCapture={events:[]};
    for(const type of ['gotpointercapture','lostpointercapture'])host.addEventListener(type,event=>window.pendingCapture.events.push(event.type));
    // Cancel during the original trusted pointerdown, before the browser has
    // committed pending capture or dispatched gotpointercapture.
    host.addEventListener('pointerdown',event=>{
      const record=window.pendingCapture;record.trusted=event.isTrusted;
      record.before=host.hasPointerCapture(event.pointerId);
      host.releasePointerCapture(event.pointerId);
      record.after=host.hasPointerCapture(event.pointerId);
    },{once:true});
  });
  await page.mouse.move(...person.screen);await page.mouse.down();await page.mouse.up();
  const capture=await page.evaluate(()=>window.pendingCapture);
  check(capture.trusted&&capture.before&&!capture.after,'A trusted down event requested and then released pending capture');
  check(capture.events.length===0,'Pending release generates no got/lost capture event');
  check(!await page.locator('#community-dialogue').isVisible(),'A pending-capture cancellation cannot open a conversation');
  await page.mouse.click(...person.screen);await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
  check(await page.locator('#community-local').inputValue()===id,'A fresh normal tap still selects the exact worker');
  check(!errors.length,`No uncaught errors: ${errors.join('; ')}`);
  return {checks,capture,errors};
}
