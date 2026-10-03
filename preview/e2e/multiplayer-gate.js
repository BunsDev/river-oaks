async page => {
 const origin='http://127.0.0.1:5180';page.setDefaultTimeout(45000);
 const checks=[],errors=[];const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};page.on('pageerror',error=>errors.push(error.message));
 await page.context().addCookies([{name:'fixture_session',value:'alice',url:origin}]);
 await page.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await page.waitForFunction(()=>window.__riverMultiplayer?.().connected);
 await page.locator('#canvas-host').focus();
 const replacementContext=await page.context().browser().newContext();
 try {
   await replacementContext.addCookies([{name:'fixture_session',value:'alice',url:origin}]);
   const replacement=await replacementContext.newPage();
   await replacement.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await replacement.waitForFunction(()=>window.__riverMultiplayer?.().connected);
   await page.waitForFunction(()=>document.querySelector('#multiplayer-status')?.textContent==='Your account joined from another tab.');
   await page.bringToFront();
   check(await page.locator('.app-shell').evaluate(node=>node.inert),'Disconnected game is locked');
   check(await page.locator('#multiplayer-title').evaluate(node=>node===document.activeElement),'Disconnect focuses the recovery dialog title');
   check(!await page.getByRole('link',{name:'Sign in with WorkOS',includeHidden:true}).isVisible(),'Authenticated recovery hides the sign-in link');
   await page.keyboard.press('Tab');
   check(await page.getByRole('button',{name:'Try again',exact:true}).evaluate(node=>node===document.activeElement),'Forward Tab reaches the first available recovery action');
   await page.keyboard.press('Shift+Tab');
   check(await page.locator('.multiplayer-gate').getByRole('button',{name:'Sign out',exact:true}).evaluate(node=>node===document.activeElement),'Shift+Tab reaches sign-out without entering the inert game');
   await page.keyboard.press('Tab');
   check(await page.getByRole('button',{name:'Try again',exact:true}).evaluate(node=>node===document.activeElement),'Tab wraps to the first recovery action');
   await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__riverMultiplayer?.().connected);
   check(await page.locator('#canvas-host').evaluate(node=>node===document.activeElement),'Successful retry restores movement focus');
   await replacement.waitForFunction(()=>document.querySelector('#multiplayer-status')?.textContent==='Your account joined from another tab.');
   await replacement.getByRole('button',{name:'Try again',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#multiplayer-status')?.textContent==='Your account joined from another tab.');
   await page.bringToFront();await page.setViewportSize({width:390,height:844});
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile recovery dialog fits the viewport');
   await page.screenshot({path:'output/playwright/multiplayer-recovery-mobile.png'});
   await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');
   await page.getByRole('link',{name:'Sign in with WorkOS'}).waitFor({state:'visible'});
   check(await page.locator('#multiplayer-title').evaluate(node=>node===document.activeElement),'Signed-out gate starts with accessible title focus');
   await page.keyboard.press('Tab');
   check(await page.getByRole('link',{name:'Sign in with WorkOS'}).evaluate(node=>node===document.activeElement),'Sign-in link is reachable by keyboard');
   await page.keyboard.press('Tab');
   check(await page.getByRole('link',{name:'Sign in with WorkOS'}).evaluate(node=>node===document.activeElement),'Anonymous gate keeps keyboard focus on its available action');
   await page.screenshot({path:'output/playwright/multiplayer-sign-in-mobile.png'});
   if(errors.length)throw new Error(errors.join('; '));
   return {passed:true,checks,errors};
 } finally {await replacementContext.close();}
}
