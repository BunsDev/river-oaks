async page => {
 const origin='http://127.0.0.1:5180';page.setDefaultTimeout(45000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.context().addCookies([{name:'fixture_session',value:'alice',url:origin}]);
 await page.goto(origin+'/?motion-debug=1');await page.waitForFunction(()=>window.__riverMultiplayer?.().connected);
 const replacementContext=await page.context().browser().newContext();
 try {
   await replacementContext.addCookies([{name:'fixture_session',value:'alice',url:origin}]);
   const replacement=await replacementContext.newPage();
   await replacement.goto(origin+'/?motion-debug=1');await replacement.waitForFunction(()=>window.__riverMultiplayer?.().connected);
   await page.waitForFunction(()=>document.querySelector('#multiplayer-status')?.textContent==='Your account joined from another tab.');
   await page.bringToFront();
   if(!await page.locator('.app-shell').evaluate(node=>node.inert))throw new Error('Disconnected game must be locked');
   await page.locator('.multiplayer-gate').getByRole('button',{name:'Sign out',exact:true}).click();
   await page.getByRole('link',{name:'Sign in with WorkOS'}).waitFor({state:'visible'});
   if(errors.length)throw new Error(errors.join('; '));
   return {passed:true,checks:['Duplicate account closes the old connection','Locked game retains accessible sign-out','Gate sign-out returns to anonymous login'],errors};
 } finally {await replacementContext.close();}
}
