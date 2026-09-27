async page => {
  const checks=[],errors=[],contacts=[],origin=page.url().startsWith('http')?await page.evaluate(()=>location.origin):'http://127.0.0.1:5181';
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(`${origin}/e2e/fixtures/carriage.html`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
  for(const view of ['riding','riding-slope']) {
    const feet=await page.evaluate(view=>{
      const f=window.carriageFixture;f.render(view);
      return f.avatar.feet.map(leg=>{
        leg.foot.updateWorldMatrix(true,false);
        const points=leg.sole.map(p=>f.carriage.object.worldToLocal(p.clone().applyMatrix4(leg.foot.matrixWorld)));
        return {side:leg.side,minY:Math.min(...points.map(p=>p.y)),minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x))};
      });
    },view);
    check(feet.every(f=>Math.abs(f.minY-1.1725)<.001&&f.minX>=-.925&&f.maxX<=.925),`${view}: both soles contact the actual transformed cabin floor`);
    contacts.push({view,feet});
    if(view==='riding')await page.screenshot({path:'output/playwright/carriage-seated-detail.png'});
  }
  for(const view of ['three-quarter','side','detail','reference']) {
    await page.evaluate(view=>window.carriageFixture.render(view),view);
    await page.screenshot({path:`output/playwright/carriage-${view}.png`});
  }
  await page.goto(`${origin}/?motion-debug=1`);
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&document.querySelector('#canvas-host')?.dataset.carriageReady==='true');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.locator('#player-carriage').click();
  const before=await page.evaluate(()=>window.__riverCarriage());
  check(before.placement.scale===.78,'The coach is at its tuned .78 scale');
  check(before.visible&&!before.riding,'Calling places a visible carriage near Jevica');
  check(before.tyreClearances.every(gap=>Math.abs(gap)<.001),'All four parked tyres meet rendered paving');
  await page.locator('#player-ride').click();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true');
  check(await page.locator('#player-flight').isDisabled(),'Flight cannot start while seated');
  check(await page.locator('#player-carriage').isDisabled(),'A ridden carriage cannot be summoned elsewhere');
  await page.waitForTimeout(600);await page.screenshot({path:'output/playwright/carriage-riding.png'});
  await page.locator('#canvas-host').focus();await page.keyboard.down('KeyW');
  try {await page.waitForFunction(()=>window.__riverCarriage().placement.distance>7,{},{timeout:15000});}
  finally {await page.keyboard.up('KeyW');}
  await page.waitForFunction(()=>Math.abs(window.__riverCarriage().placement.speed)<.03);
  const driven=await page.evaluate(()=>window.__riverCarriage());
  check(Math.hypot(driven.placement.position[0]-before.placement.position[0],driven.placement.position[2]-before.placement.position[2])>6,'Riding moves the real carriage and rider through the district');
  check(driven.tyreClearances.every(gap=>Math.abs(gap)<.001),'All four moving tyres follow the rendered road');
  await page.waitForTimeout(700);
  const coast=await page.evaluate(()=>window.__riverCarriage());
  check(coast.spinners.every((s,i)=>Math.abs(s.rotation-driven.spinners[i].rotation)>.02),'All four rendered wheel centers keep spinning after braking');
  check(coast.tyreClearances.every(gap=>Math.abs(gap)<.001),'Free-spinning centers leave tyre contact unchanged');
  if(await page.locator('#walking-talk').isVisible()) {
    const position=driven.pose.position;
    await page.locator('#walking-talk').click();await page.locator('#community-dialogue').waitFor({state:'visible'});
    const talking=await page.evaluate(()=>window.__riverCarriage());
    check(talking.riding&&Math.hypot(...talking.pose.position.map((v,i)=>v-position[i]))<.02,'Jevica talks to a nearby resident without leaving or moving the carriage');
    await page.locator('#community-close').click();
  }
  await page.screenshot({path:'output/playwright/carriage-driven.png'});
  await page.locator('#player-ride').click();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='false');
  const after=await page.evaluate(()=>window.__riverCarriage());
  check(after.pose.showBody,'Dismount preserves a clear third-person camera');
  check(Math.abs(after.rider[1]-after.pose.ground)<.001,'Dismounted Jevica stands on the rendered pavement');
  await page.locator('#canvas-host').focus();const x=after.pose.position[0],z=after.pose.position[2];
  await page.keyboard.down('KeyW');await page.waitForTimeout(650);await page.keyboard.up('KeyW');
  await page.waitForFunction(([x,z])=>Math.hypot(window.__riverCarriage().pose.position[0]-x,window.__riverCarriage().pose.position[2]-z)>.1,[x,z]);
  check(true,'Walking resumes after leaving the carriage');
  await page.locator('#player-flight').click();
  check(!(await page.evaluate(()=>window.__riverCarriage().pose.flying)),'Takeoff is rejected while the bubble overlaps the parked coach');
  await page.locator('#canvas-host').focus();await page.keyboard.down('KeyS');await page.waitForTimeout(1000);await page.keyboard.up('KeyS');
  await page.locator('#player-flight').click();await page.waitForFunction(()=>window.__riverCarriage().pose.altitude>3);
  check(await page.locator('#player-ride').isDisabled(),'Boarding is unavailable in flight');
  await page.locator('#player-flight').click();await page.waitForFunction(()=>!window.__riverCarriage().pose.flying);
  check(errors.length===0,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,contacts,before,driven,after,errors};
}
