async page => {
  const checks=[],errors=[],clicks=[],releaseDistances=[];
  const check=(condition,message)=>{if(!condition)throw new Error(message);checks.push(message);};
  const read=async id=>page.evaluate(id=>({
    person:window.__riverPeople('spine_03').find(person=>person.id===id),
    motion:JSON.parse(document.querySelector('#community-life-status').dataset.residents).find(person=>person.id===id),
    visitor:JSON.parse(document.querySelector('#walking-hud').dataset.position),
  }),id);
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>{
    const d=document.querySelector('#canvas-host').dataset;
    return d.charactersReady==='24'&&d.storePeopleTotal&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true';
  });
  // After each conversation Jevica stays put. Pedestrians resume their routes
  // and remain clickable; mere proximity cannot reserve the sidewalk.
  for(const id of ['local-00','local-01','local-02','local-03','local-04','local-05']) {
    if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
    await page.locator('[data-section=community-section]').click();
    if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
    await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();
    await page.locator('#community-dialogue').waitFor({state:'visible'});
    // Opening the dialogue is synchronous; route/HUD diagnostics publish on
    // the next scene tick. Wait for that tick before capturing the arrival.
    await page.waitForFunction(id=>JSON.parse(document.querySelector('#community-life-status').dataset.residents).find(person=>person.id===id)?.status==='chatting',id);
    const released=await read(id);
    releaseDistances.push(Math.hypot(released.visitor[0]-released.motion.position[0],released.visitor[2]+released.motion.position[1]));
    await page.locator('#community-close').click();
    await page.locator('#panel-toggle').click();await page.waitForTimeout(500);
    await page.waitForFunction(id=>{
      const p=JSON.parse(document.querySelector('#community-life-status').dataset.residents).find(p=>p.id===id);
      return p.speed>0.2&&p.status==='walking';
    },id,{timeout:20000});
    const before=await read(id);
    check(Math.hypot(...before.visitor.map((value,index)=>value-released.visitor[index]))<.02,`${id}: pedestrian resumes while Jevica stays still`);
    check(before.person.visible&&before.person.reachable,`${id}: walking mesh is visible and in reach`);
    check(before.person.depth>-1&&before.person.depth<1&&before.person.screen[0]>0&&before.person.screen[0]<1440&&before.person.screen[1]>0&&before.person.screen[1]<1000,`${id}: walking mesh projects inside the viewport`);
    await page.mouse.click(...before.person.screen);
    await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
    check(await page.locator('#community-local').inputValue()===id,`${id}: real pointer selects the walking person`);
    await page.waitForTimeout(350);
    const held=await read(id);
    check(Math.hypot(...held.visitor.map((value,index)=>value-before.visitor[index]))<0.02,`${id}: pointer conversation does not relocate the visitor`);
    await page.waitForTimeout(500);
    const still=await read(id);
    check(still.motion.status==='chatting'&&Math.hypot(...still.motion.position.map((value,index)=>value-held.motion.position[index]))<0.001,`${id}: clicked walker holds position during conversation`);
    await page.screenshot({path:`output/playwright/moving-people-${id}.png`});
    await page.locator('#community-close').click();
    await page.waitForFunction(({id,distance})=>JSON.parse(document.querySelector('#community-life-status').dataset.residents).find(p=>p.id===id).distance>distance+0.1,{id,distance:held.motion.distance},{timeout:20000});
    clicks.push({id,speed:before.motion.speed,screen:before.person.screen,position:before.motion.position});
  }
  check(releaseDistances.some(distance=>distance<2.8),'At least one route resumes inside the former visitor freeze radius');
  check(await page.locator('.visitor-reaction, .visitor-reactions').count()===0,'No floating NPC reaction captions');
  check(!errors.length,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,clicks,releaseDistances,errors,scope:'Real district routes, clocks and pointer events. Directory controls set up each approach; Jevica stays still when a conversation closes. No simulation state is injected.'};
}
