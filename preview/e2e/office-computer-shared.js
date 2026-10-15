async page => {
 const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);console.log(label);};
 const ready=async tab=>{await tab.emulateMedia({reducedMotion:'reduce'});await tab.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});};
 const upstairs=tab=>tab.waitForFunction(()=>document.querySelector('#office-visit')?.dataset.phase==='office'&&document.querySelector('#office-visit')?.open,null,{timeout:60000});
 const saved=tab=>tab.waitForFunction(()=>document.querySelector('#desk-save-status')?.textContent==='All changes saved');
 await page.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});await ready(page);
 await page.locator('#office-lobby').evaluate(b=>b.click());await page.locator('#office-personal').evaluate(b=>b.click());await upstairs(page);
 const officeId=await page.evaluate(()=>{const mp=window.__riverMultiplayer();return mp.snapshot.players.find(p=>p.id===mp.selfId).office.id;});
 await page.locator('#office-desk-open').click();await page.locator('#desk-start').click();await page.locator('#desk-title').fill('Owner private notes');await saved(page);
 await page.locator('#desk-scope-shared').click();await page.locator('#desk-start').click();await page.locator('#desk-title').fill('Collaborative plan');await page.locator('#desk-notes').fill('Shared with accepted collaborators');await saved(page);await page.locator('#desk-close').click();
 const context=await page.context().browser().newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addCookies([{name:'fixture_session',value:'guest',url:page.url()}]);const guest=await context.newPage();
 try{
  await guest.goto(page.url(),{waitUntil:'commit'});await ready(guest);
  await guest.locator('#office-lobby').evaluate(b=>b.click());
  const guestId=await guest.evaluate(()=>window.__riverMultiplayer().selfId);
  await page.locator('#office-access').click();await page.getByLabel('Resident to invite').selectOption(guestId);
  await page.locator('#office-management button').filter({hasText:'Invite resident'}).click();
  await guest.waitForFunction(id=>[...document.querySelector('#office-workspace').options].some(o=>o.value===id),officeId,{timeout:15000});
  await guest.locator('#office-workspace').evaluate((n,id)=>{n.value=id;n.dispatchEvent(new Event('change'));},officeId);
  await guest.waitForFunction(()=>document.querySelector('#office-accept')?.hidden===false);
  check(await guest.locator('#office-enter').isDisabled(),'A pending collaboration invitation does not permit office entry');
  await guest.locator('#office-accept').evaluate(b=>b.click());
  await guest.locator('#office-lobby').evaluate(b=>b.click());await guest.waitForFunction(()=>!document.querySelector('#office-enter').disabled);
  await guest.locator('#office-enter').evaluate(b=>b.click());await upstairs(guest);
  await guest.locator('#office-desk-open').click();await guest.locator('#desk-start').waitFor({state:'visible'});
  check(await guest.locator('#desk-tasks').textContent()==='','Collaborator cannot see the owner’s private tasks');
  await guest.locator('#desk-scope-shared').click();await guest.waitForFunction(()=>document.querySelector('#desk-title')?.value==='Collaborative plan');
  check(await guest.locator('#desk-notes').inputValue()==='Shared with accepted collaborators','Accepted collaborator reads the shared office task');
  await guest.locator('#desk-result').fill('Result from the invited resident');await saved(guest);
  await page.locator('#office-desk-open').click();await page.waitForFunction(()=>document.querySelector('#desk-result')?.value==='Result from the invited resident');
  check(true,'Shared edits resume on the owner’s computer');await page.locator('#desk-close').click();
  await page.locator('#office-management button').filter({hasText:'Revoke collaboration'}).click();
  await guest.waitForFunction(()=>!document.querySelector('#office-desk').open&&!document.querySelector('#office-visit').open,null,{timeout:15000});
  check(await guest.locator('#desk-title').inputValue()===''&&await guest.locator('#desk-notes').inputValue()===''&&await guest.locator('#desk-result').inputValue()==='','Revocation closes the computer and clears shared task fields');
  check(await guest.locator('#desk-tasks').textContent()==='','Revocation clears the shared task list');
  await guest.screenshot({path:'output/playwright/office-collaboration-revoked-mobile.png'});
 }finally{await context.close();}
 await page.locator('#office-exit').click();return {checks};
}
