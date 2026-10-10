async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks=[],errors=[],views=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/v1/**',route=>route.fulfill({status:503,json:{}}));
  for(const remote of [false,true]){
    await page.goto(`http://127.0.0.1:5173/e2e/fixtures/jevica.html?appearance=forest-aristocrat-feminine${remote?'&remote=1':''}`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    const fit=await page.evaluate(()=>{
      const f=window.jevicaFixture,results=[];f.avatar.rig.model.traverse(o=>{if(o.userData.vineFit==='skin-profile')results.push({parent:o.parent.name,children:o.children.length});});return results;
    });
    check(fit.length===2,`${remote?'Remote':'Local'} Silvan fits both bare arm vines to the shipped skin`);
    for(const view of ['full','profile']){
      views.push(await page.evaluate(view=>window.jevicaFixture.render(view,0),view));
      if(!remote)await page.screenshot({path:`output/playwright/silvan-fitted-${view}.png`});
    }
    await page.evaluate(()=>{const f=window.jevicaFixture;for(let i=1;i<=180;i++)f.avatar.update(i*1000/60,'continue',false,{speed:1.1,distance:i/60*1.1},()=>0);f.render('full',3000,1.1);});
    if(!remote)await page.screenshot({path:'output/playwright/silvan-fitted-walking.png'});
  }
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.carriageDriverReady==='true'&&window.__riverCarriage?.().placement);
  const panel=page.locator('#panel-toggle');if(await panel.getAttribute('aria-expanded')==='false')await panel.click();
  await openHudSpace(page, 'explore-section');await page.locator('#destination').selectOption({label:'Dior'});
  await page.locator('#visit-destination').click();if(!await page.locator('.player-settings').evaluate(e=>e.open))await page.locator('.player-settings > summary').click();
  await page.locator('#player-carriage').click();
  await page.locator('#player-companion').click();await page.waitForFunction(()=>window.__riverCarriage().companion.mode==='walking');
  await page.keyboard.press('F3');await page.locator('[data-debug-layer="navigation"]').check();
  await page.waitForFunction(()=>window.__riverDebug().root.getObjectByName('Jev route')?.geometry.attributes.position.count>0);
  check(true,'F3 displays the current walking route in the district');
  await page.screenshot({path:'output/playwright/jev-navigation-walking.png'});
  await page.keyboard.press('F3');
  // Dior's doorway is inside the flight roof margin. Walk into the plaza first.
  await page.locator('#canvas-host').focus();await page.keyboard.down('KeyS');
  await page.waitForTimeout(2200);await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyB');
  await page.waitForFunction(()=>window.__riverCarriage().pose.flying,null,{timeout:10000});
  await page.waitForFunction(()=>window.__riverCarriage().companion.mode==='flying',null,{timeout:20000});
  await page.keyboard.press('F3');await page.locator('[data-debug-layer="navigation"]').check();
  await page.waitForFunction(()=>window.__riverDebug().counts.navigationProbes>0);
  const probes=await page.evaluate(()=>window.__riverDebug().counts.navigationProbes);
  check(probes>0,'F3 displays actual Jev flight sensing in the district');
  await page.screenshot({path:'output/playwright/jev-navigation-sensing.png'});
  await page.locator('[data-debug-layer="navigation"]').uncheck();
  check(await page.evaluate(()=>!window.__riverDebug().root.getObjectByName('Jev navigation')),'Turning sensing off disposes its geometry');
  check(!errors.length,`No browser errors: ${errors.join('; ')}`);
  return {checks,views,probes,errors};
}
