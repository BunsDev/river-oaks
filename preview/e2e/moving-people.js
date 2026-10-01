async page => {
  const checks=[],errors=[],clicks=[];
  const check=(condition,message)=>{if(!condition)throw new Error(message);checks.push(message);};
  const read=async id=>page.evaluate(id=>({
    person:window.__riverPeople('spine_03').find(person=>person.id===id),
    motion:JSON.parse(document.querySelector('#community-life-status').dataset.residents).find(person=>person.id===id),
    visitor:JSON.parse(document.querySelector('#walking-hud').dataset.position),
  }),id);
  const leaveCourtesyRadius=async id=>{
    await page.locator('#canvas-host').focus();await page.keyboard.down('KeyS');
    try {
      await page.waitForFunction(id=>{
        const resident=JSON.parse(document.querySelector('#community-life-status').dataset.residents).find(p=>p.id===id);
        const visitor=JSON.parse(document.querySelector('#walking-hud').dataset.position);
        return Math.hypot(visitor[0]-resident.position[0],visitor[2]+resident.position[1])>=3.15;
      },id,{timeout:10000});
    } finally {await page.keyboard.up('KeyS');}
  };
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.waitForFunction(()=>{
    const d=document.querySelector('#canvas-host').dataset;
    return d.charactersReady==='24'&&d.storePeopleTotal&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true';
  });
  // Use real controls to approach each rig, then step back out of its courtesy
  // stop radius. Routes and the animation clock continue throughout this test.
  for(const id of ['local-00','local-01','local-02','local-03','local-04','local-05']) {
    if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
    await page.locator('[data-section=community-section]').click();
    if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
    await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();
    await page.locator('#community-dialogue').waitFor({state:'visible'});await page.locator('#community-close').click();
    await page.locator('#panel-toggle').click();await page.waitForTimeout(500);
    await leaveCourtesyRadius(id);
    // Residents keep walking, so follow this one as a player would: turn toward
    // them with the arrow keys and run to them, until they are walking, on screen
    // and comfortably inside the 4.5 m talking reach. Then click straight away.
    const ready=()=>page.evaluate(id=>{
      const p=JSON.parse(document.querySelector('#community-life-status').dataset.residents).find(p=>p.id===id);
      const v=JSON.parse(document.querySelector('#walking-hud').dataset.position);
      const mesh=window.__riverPeople('spine_03').find(person=>person.id===id);
      const distance=Math.hypot(v[0]-p.position[0],v[2]+p.position[1]),[x,y]=mesh?.screen??[-1,-1];
      return {walking:p.speed>0.2&&p.status==='walking',distance,x,onScreen:Boolean(mesh)&&mesh.depth>-1&&mesh.depth<1&&x>200&&x<1240&&y>100&&y<900,inReach:Boolean(mesh?.visible&&mesh.reachable)&&distance<=4};
    },id);
    const hold=async(keys,ms)=>{await page.locator('#canvas-host').focus();for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(ms);for(const key of [...keys].reverse())await page.keyboard.up(key);};
    for(const started=Date.now();;) {
      const r=await ready();
      if(r.walking&&r.inReach&&r.onScreen) {
        // Let the visitor come to rest from the run, then confirm they still qualify.
        await page.waitForTimeout(500);const settled=await ready();
        if(settled.walking&&settled.inReach&&settled.onScreen)break;
        continue;
      }
      if(Date.now()-started>30000)throw new Error(`${id}: never walking on screen within comfortable reach (${JSON.stringify(r)})`);
      if(!r.onScreen)await hold([r.x>720?'ArrowRight':'ArrowLeft'],120);
      else if(r.distance>3.5)await hold(['ShiftLeft','KeyW'],Math.min(1200,r.distance*180));
      else await page.waitForTimeout(80);
    }
    const before=await read(id);
    check(before.person.visible&&before.person.reachable,`${id}: walking mesh is visible and in reach`);
    check(before.person.depth>-1&&before.person.depth<1&&before.person.screen[0]>0&&before.person.screen[0]<1440&&before.person.screen[1]>0&&before.person.screen[1]<1000,`${id}: walking mesh projects inside the viewport`);
    // Measure from the moment of the click: the visitor may still be slowing from the run.
    const atClick=await page.evaluate(()=>JSON.parse(document.querySelector('#walking-hud').dataset.position));
    await page.mouse.click(...before.person.screen);
    await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
    check(await page.locator('#community-local').inputValue()===id,`${id}: real pointer selects the walking person`);
    await page.waitForTimeout(350);
    const held=await read(id);
    check(Math.hypot(...held.visitor.map((value,index)=>value-atClick[index]))<0.02,`${id}: pointer conversation does not relocate the visitor`);
    await page.waitForTimeout(500);
    const still=await read(id);
    check(still.motion.status==='chatting'&&Math.hypot(...still.motion.position.map((value,index)=>value-held.motion.position[index]))<0.001,`${id}: clicked walker holds position during conversation`);
    await page.screenshot({path:`output/playwright/moving-people-${id}.png`});
    await page.locator('#community-close').click();await leaveCourtesyRadius(id);
    await page.waitForFunction(({id,distance})=>JSON.parse(document.querySelector('#community-life-status').dataset.residents).find(p=>p.id===id).distance>distance+0.1,{id,distance:held.motion.distance},{timeout:20000});
    clicks.push({id,speed:before.motion.speed,screen:before.person.screen,position:before.motion.position});
  }
  check(!errors.length,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,clicks,errors,scope:'Real district routes, clocks and pointer events. Directory controls set up each approach; no simulation state is injected.'};
}
