async page=>{
 const checks=[],errors=[];const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
 page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:5173/?motion-debug=1');
 await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host').dataset.playerReady==='true');
 if(!await page.locator('.visit-tools').evaluate(n=>n.open))await page.locator('.visit-tools-toggle').click();
 if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
 const open=()=>page.getByRole('button',{name:'Open character studio',exact:true}).click();await open();
 const dialog=page.getByRole('dialog',{name:'Character studio'});
 await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
 const read=()=>page.evaluate(()=>fetch('/api/character').then(r=>r.json())),before=await read();
 await dialog.locator('[data-character=sable]').click();await dialog.getByRole('radio',{name:'Rose silk',exact:true}).click();
 await dialog.locator('[data-save]').click();await dialog.locator('[data-retry]').waitFor({state:'visible'});
 check((await dialog.locator('[data-account-status]').textContent()).includes('Character Studio is paused'),'Server pause explains that edits and saved looks are safe');
 check(await dialog.getAttribute('data-palette')==='rose','Rejected save preserves the visible edit');
 await dialog.locator('[data-retry]').click();await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='error');
 check(await dialog.locator('[data-retry]').isVisible()&&await dialog.locator('[data-cancel]').isDisabled(),'Paused retry retains the uncertain action without permitting discard');
 check(JSON.stringify(await read())===JSON.stringify(before),'Paused saves leave the server draft, publication and selected appearance unchanged');
 await dialog.locator('[data-close]').click();await open();
 check(await dialog.getAttribute('data-palette')==='rose'&&await dialog.locator('[data-retry]').isVisible(),'Closing and reopening retains edits and retry identity');
 await page.screenshot({path:'output/playwright/character-studio-paused.png'});
 check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);return {passed:true,checks};
}
