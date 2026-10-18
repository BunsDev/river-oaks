async page => {
 // The Gardens' first useful-work journey (#510) on the campus revision, three fixture accounts:
 // the resident (owner fixture) asks for a suite and accepts the operator's offer through the
 // dialog; at a public workstation in the Grove Offices hall she writes private work, leaves,
 // reloads and recovers it; a second resident at the next chair has only his own desk. Entering
 // a leased suite upstairs needs #508's levels and is not part of this journey yet.
 const checks=[],check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
 await page.emulateMedia({reducedMotion:'reduce'});
 const ready=async tab=>tab.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:120000});
 const title=tab=>tab.locator('.walking-title strong').textContent();
 const press=async(tab,key)=>{await tab.locator('#canvas-host').focus();await tab.keyboard.press(key);};
 const click=async(tab,selector,text)=>{const target=text?tab.locator(selector,{hasText:text}).first():tab.locator(selector).first();await target.waitFor({state:'attached'});await target.evaluate(n=>n.click());};
 // Inside means the HUD's room marker, not the title: the street title at the door also names Grove Offices.
 const hall='campus:T1-F1-hall',inside=(tab,timeout=30000)=>tab.waitForFunction(id=>document.querySelector('#walking-hud')?.dataset.inside===id,hall,{timeout});
 const intoHall=async tab=>{
  await click(tab,'#campus-panel button','Go to the Grove Offices hall');
  await tab.waitForFunction(()=>/Grove Offices hall/.test(document.querySelector('#campus-panel [role=status]')?.textContent??''),null,{timeout:30000});
  // A software-rendered runner can drop the first press while arrival settles; the door prompt stays, so ask again.
  for(let attempt=0;;attempt++){
   await tab.waitForFunction(()=>{const n=document.querySelector('#walking-enter');return n&&!n.hidden&&!n.disabled&&/Step inside Grove Offices/.test(n.textContent);},null,{timeout:30000});
   await tab.locator('#walking-enter').evaluate(n=>n.click());
   try{await inside(tab,10000);break;}catch(error){if(attempt===2)throw error;}
  }
 };
 const sitAndOpenDesk=async tab=>{
  await tab.waitForFunction(()=>/Sit down/.test(document.querySelector('#walking-interact')?.textContent??'')&&!document.querySelector('#walking-interact').hidden,null,{timeout:30000});
  await press(tab,'KeyZ');
  await tab.waitForFunction(()=>document.querySelector('.walking-title strong')?.textContent==='Seated',null,{timeout:30000});
  await tab.waitForFunction(()=>/Use this desk/.test(document.querySelector('#walking-play')?.textContent??'')&&!document.querySelector('#walking-play').hidden,null,{timeout:30000});
  await press(tab,'KeyX');
  await tab.locator('#office-desk').waitFor({state:'visible'});await tab.locator('#desk-loading').waitFor({state:'hidden'});
 };
 await page.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});await ready(page);
 const origin=new URL(page.url()).origin;
 check(await page.locator('#campus-panel').evaluate(n=>!n.hidden),'The Gardens appear in Play when the town serves the campus');
 const deskRead=tab=>tab.evaluate(async origin=>{const session=await (await fetch(`${origin}/auth/session`)).json();
  return (await fetch(`${origin}/api/office-desk/read?world=river-oaks`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:'{}'})).status;},origin);
 check(await deskRead(page)===403,'The desk stays closed away from a workstation');

 // The directory: every suite, no charge, and a request through the dialog.
 await click(page,'#campus-panel button','Suites and leases');
 await page.locator('#campus-dialog .campus-units li').first().waitFor();
 check(await page.locator('#campus-dialog .campus-units li').count()===43,'The directory lists all 43 suites by tower and floor');
 check((await page.locator('#campus-dialog .campus-label').textContent()).includes('No charge — owner-managed'),'Lease terms say no charge, owner-managed');
 check(await page.locator('#campus-dialog').evaluate(n=>!/\$|€|£|price|payment/i.test(n.textContent)),'No price or payment appears anywhere');
 await page.locator('#campus-dialog .campus-units li',{hasText:'T1-201'}).getByRole('button',{name:'Ask for this suite'}).click();
 await page.waitForFunction(()=>/Asked for suite T1-201/.test(document.querySelector('#campus-dialog .campus-status')?.textContent??''));
 check(await page.locator('#campus-dialog .campus-units li',{hasText:'T1-201'}).locator('.campus-chip').textContent()==='You asked','A request is shown as asked, not admitted');
 // Movement keys typed inside the open dialog never walk the resident.
 const before=await page.evaluate(()=>document.querySelector('#canvas-host')?.dataset.position??document.body.textContent.match(/(\d+) m walked/)?.[1]);
 await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');
 check(await page.evaluate(()=>document.querySelector('#canvas-host')?.dataset.position??document.body.textContent.match(/(\d+) m walked/)?.[1])===before,'Walking keys inside the dialog do not move the resident');
 // A phone-width dialog stays contained, with touch-sized controls.
 await page.setViewportSize({width:390,height:844});
 check(await page.locator('#campus-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1&&n.getBoundingClientRect().right<=innerWidth),'The dialog fits a phone width without horizontal overflow');
 check(await page.locator('#campus-dialog button:visible').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=43)),'Dialog actions keep touch-sized targets on a phone');
 await page.screenshot({path:'output/playwright/garden-campus-dialog-phone.png'});
 await page.setViewportSize({width:1440,height:1000});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#campus-dialog').open);
 check(await page.locator('#canvas-host').evaluate(n=>n===document.activeElement),'Escape closes the dialog and returns focus to the world');

 // The operator (bob fixture) offers the requested dates; the resident accepts.
 const browser=page.context().browser();
 const operatorContext=await browser.newContext({viewport:{width:1280,height:900}});await operatorContext.addCookies([{name:'fixture_session',value:'bob',url:origin}]);
 const operator=await operatorContext.newPage();operator.setDefaultTimeout(60000);
 await operator.goto(`${origin}/?motion-debug=1`,{waitUntil:'commit'});await ready(operator);
 await click(operator,'#campus-panel button','Suites and leases');
 await operator.locator('#campus-dialog .campus-section',{hasText:'Manage the campus'}).waitFor();
 await operator.locator('#campus-dialog .campus-row',{hasText:'T1-201'}).getByRole('button',{name:'Offer these dates'}).click();
 await operator.waitForFunction(()=>/Offer sent/.test(document.querySelector('#campus-dialog .campus-status')?.textContent??''));
 check(true,'The operator offers the requested dates');
 await click(page,'#campus-panel button','Suites and leases');
 await page.locator('#campus-dialog .campus-row',{hasText:'T1-201'}).getByRole('button',{name:'Accept'}).click();
 await page.waitForFunction(()=>/Lease accepted/.test(document.querySelector('#campus-dialog .campus-status')?.textContent??''));
 check(await page.locator('#campus-dialog .campus-units li',{hasText:'T1-201'}).locator('.campus-chip').textContent()==='Your suite','The accepted lease makes T1-201 the resident’s suite');
 check(await page.locator('#campus-dialog .campus-row',{hasText:'T1-201'}).count()===1,'The answered request is closed: only the lease remains');
 check(/Grove Offices \(T1\), Floor 2/.test(await page.locator('#campus-dialog .campus-row',{hasText:'T1-201'}).textContent()),'The lease explains how to reach the suite');
 await page.screenshot({path:'output/playwright/garden-campus-lease.png'});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#campus-dialog').open);

 // Private work at a public workstation, then leave, reload and recover it.
 await intoHall(page);
 await sitAndOpenDesk(page);
 check(await page.locator('#desk-start').isVisible(),'A public workstation opens the resident’s own empty desk');
 await page.locator('#desk-start').click();await page.locator('#desk-title').fill('Atelier launch plan');
 await page.locator('#desk-notes').fill('Private: invite the creators for a Friday open studio.');
 await page.waitForFunction(()=>document.querySelector('#desk-save-status')?.textContent==='All changes saved',null,{timeout:30000});
 check(true,'Work saves with the server’s acknowledgement');
 await page.screenshot({path:'output/playwright/garden-campus-desk.png'});
 await page.locator('#desk-close').click();
 await press(page,'KeyZ');await page.waitForFunction(()=>document.querySelector('.walking-title strong')?.textContent!=='Seated',null,{timeout:30000});
 check(await page.locator('#walking-play').evaluate(n=>n.hidden||!/Use this desk/.test(n.textContent)),'Standing up removes the desk action');
 check(await deskRead(page)===403,'Standing up closes the desk route');
 await page.reload({waitUntil:'commit'});await ready(page);
 await inside(page);
 await sitAndOpenDesk(page);
 check(await page.locator('#desk-title').inputValue()==='Atelier launch plan','Reloading and returning to a workstation recovers the saved work');
 await page.locator('#desk-close').click();

 // A second resident at the next chair has only his own desk.
 const guestContext=await browser.newContext({viewport:{width:1280,height:900}});await guestContext.addCookies([{name:'fixture_session',value:'alice',url:origin}]);
 const guest=await guestContext.newPage();guest.setDefaultTimeout(60000);
 await guest.goto(`${origin}/?motion-debug=1`,{waitUntil:'commit'});await ready(guest);
 await intoHall(guest);
 await guest.locator('#canvas-host').focus();await guest.keyboard.down('KeyD');await guest.waitForTimeout(450);await guest.keyboard.up('KeyD');
 await sitAndOpenDesk(guest);
 check(await guest.locator('#desk-start').isVisible(),'The neighbour’s workstation opens his own empty desk');
 check(await guest.evaluate(()=>!document.body.textContent.includes('invite the creators')),'Another account’s private work never reaches the neighbour’s page');
 await guest.screenshot({path:'output/playwright/garden-campus-neighbour.png'});
 await guestContext.close();await operatorContext.close();
 return {checks,limits:['Suite entry upstairs needs #508 levels; this journey proves the lease and public-workstation private work.']};
}
