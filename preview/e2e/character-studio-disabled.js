async page=>{
 const checks=[],errors=[],requests=[];const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/character'))requests.push(request.method());});
 await page.goto('http://127.0.0.1:5173/?motion-debug=1');
 const ready=()=>page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host').dataset.playerReady==='true');await ready();
 check(await page.locator('.character-studio-trigger').count()===0&&await page.locator('.character-studio').count()===0,'Disabled Studio has no editor or entry control');
 if(!await page.locator('.visit-tools').evaluate(n=>n.open))await page.locator('.visit-tools-toggle').click();
 if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
 await page.locator('input[name=player-character][value=sable]').check();
 await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerAppearance==='sable-human'&&document.querySelector('#canvas-host').dataset.playerReady==='true');
 check(true,'Authored character selection works while Studio is disabled');
 await page.reload();await ready();
 check(await page.locator('#canvas-host').getAttribute('data-player-appearance')==='sable-human','Reconnect preserves the selected authored appearance');
 check(await page.locator('.character-studio-trigger').count()===0,'Reconnect keeps Studio disabled');
 check(requests.length===0,'Disabled editor makes no character HTTP requests');
 await page.screenshot({path:'output/playwright/character-studio-disabled.png'});
 check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);return {passed:true,checks};
}
