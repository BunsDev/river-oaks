async page=>{
 const checks=[],errors=[];const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|WebGLProgram/.test(m.text()))errors.push(m.text());});
 await page.setViewportSize({width:1440,height:1000});
 let stage="fixture";
 try{
  await page.goto('http://127.0.0.1:5181/e2e/fixtures/carriage.html');await page.waitForFunction(()=>document.body.dataset.ready==='true');
  await page.evaluate(()=>window.carriageFixture.render('team'));await page.screenshot({path:'output/playwright/unicorn-team.png'});
  stage='district';await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.unicornsReady==='true'&&document.querySelector('#canvas-host')?.dataset.carriageDriverReady==='true'&&window.__riverCarriage().placement);
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.locator('#player-carriage').click();await page.waitForTimeout(300);
  const before=await page.evaluate(()=>window.__riverCarriage());
  check(before.visible&&before.unicorns.length===2,'The summoned carriage has two loaded unicorns');
  check(before.placement.team,'Parking reserves clearance for the complete team');
  check(before.unicorns.every(h=>Math.abs(h.position[1]-before.placement.position[1])<.25),'Both unicorns remain on the district road at real world coordinates');
  await page.screenshot({path:'output/playwright/unicorn-district.png'});
  stage='boarding';await page.locator('#player-ride').click();await page.waitForFunction(()=>window.__riverCarriage().riding);await page.locator('#canvas-host').focus();await page.keyboard.down('KeyW');
  stage='travel';try{await page.waitForFunction(()=>window.__riverCarriage().placement.distance>5,null,{timeout:16000});}finally{await page.keyboard.up('KeyW');}
  const moving=await page.evaluate(()=>window.__riverCarriage());
  check(moving.unicorns.every(h=>h.walkWeight>.9),'Both unicorns blend into their contact-driven gait while pulling');
  check(moving.unicorns.every((h,i)=>Math.hypot(h.position[0]-before.unicorns[i].position[0],h.position[2]-before.unicorns[i].position[2])>4),'The team travels with the actual coach');
  check(moving.unicorns.every(h=>Math.abs(h.position[1]-moving.placement.position[1])<.25),'Animated unicorns retain road contact while riding');
  stage="braking";await page.waitForFunction(()=>window.__riverCarriage().unicorns.every(h=>h.walkWeight<.01));
  check(true,'Gait blends back to idle after braking');
  await page.screenshot({path:'output/playwright/unicorn-riding.png'});
  stage='dismount';await page.locator('#player-ride').click();await page.waitForFunction(()=>!window.__riverCarriage().riding);
  check(true,'Jevica can leave the complete unicorn carriage');check(!errors.length,'No uncaught runtime or shader errors');
  return {checks,before,moving,errors};
 }catch(error){throw new Error(`${stage}: ${error.message}`);}finally{await page.keyboard.up('KeyW');await page.goto('about:blank');}
}
