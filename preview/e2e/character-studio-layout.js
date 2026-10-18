async page => {
 const checks=[],check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('http://127.0.0.1:5173/');
 await page.locator('#loading').waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
 if(!await page.locator('.visit-tools').evaluate(n=>n.open))await page.locator('.visit-tools-toggle').click();
 if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
 await page.getByRole('button',{name:'Open character studio',exact:true}).click();
 const studio=page.locator('.character-studio[open]');
 await studio.locator('[data-character=sable]').click();
 await page.waitForFunction(()=>document.querySelector('.character-studio[open] .cs-preview')?.dataset.appearance==='sable-human'&&document.querySelector('.cs-preview').dataset.ready==='true');
 const desktop=await studio.evaluate(n=>{const box=n.getBoundingClientRect(),controls=n.querySelector('.cs-controls');return {width:box.width,height:box.height,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,controlHeight:controls.clientHeight,contentHeight:controls.scrollHeight};});
 check(desktop.width>=1412&&desktop.height>=872,'Desktop Studio fills the available viewport');
 check(desktop.scrollWidth<=desktop.clientWidth&&desktop.contentHeight<=desktop.controlHeight+1,`Desktop controls fit without scrolling: ${JSON.stringify(desktop)}`);
 await page.screenshot({path:'output/playwright/character-studio-layout-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 check(await studio.evaluate(n=>n.scrollWidth<=n.clientWidth&&n.getBoundingClientRect().width<=innerWidth),'Phone Studio fits horizontally');
 const workspace=studio.locator('.cs-workspace');await workspace.evaluate(n=>n.scrollTop=n.scrollHeight);
 check(await studio.locator('[data-portrait]').isVisible(),'Phone tools remain reachable in one scroll area');
 await page.screenshot({path:'output/playwright/character-studio-layout-phone.png'});
 return {checks,desktop};
}
