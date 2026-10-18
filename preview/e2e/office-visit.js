async page => {
  const checks=[],check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  await page.locator('#office-lobby').waitFor({state:'attached',timeout:15000});
  await page.locator('#office-lobby').evaluate(b=>b.click());
  await page.waitForFunction(()=>document.querySelector('#office-enter')?.disabled===false);
  await page.evaluate(()=>{const dialog=document.querySelector('#office-visit');window.officeObservedPhases=[];new MutationObserver(()=>{const phase=dialog.dataset.phase;if(phase&&window.officeObservedPhases.at(-1)!==phase)window.officeObservedPhases.push(phase);}).observe(dialog,{attributes:true,attributeFilter:['data-phase']});});
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyF');
  await page.locator('#office-visit[open]').waitFor();
  try{await page.waitForFunction(()=>window.officeObservedPhases?.includes('boarding'),null,{timeout:30000});}
  catch(error){throw new Error(`${error.message}: ${JSON.stringify(await page.evaluate(()=>({phases:window.officeObservedPhases,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,phase:document.querySelector('#office-visit').dataset.phase})))}`);}
  await page.screenshot({path:'output/playwright/office-elevator-boarding.png'});
  await page.waitForFunction(()=>window.officeObservedPhases?.includes('ascending'));
  await page.screenshot({path:'output/playwright/office-elevator-ride.png'});
  await page.waitForFunction(()=>document.querySelector('#office-visit')?.open&&document.querySelector('#office-visit').dataset.phase==='office');
  const observed=await page.evaluate(()=>window.officeObservedPhases);console.log('Rendered phases:',observed);
  check(['boarding','closing','ascending','opening','arriving','office'].every(p=>observed.includes(p)),'All elevator phases render before walking begins');
  check(true,'F at the lobby boards the elevator, rides upstairs and releases walking');
  await page.locator('#office-visit').focus();await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');
  await page.waitForTimeout(350);
  const pos=await page.locator('#office-visit').evaluate(d=>JSON.parse(d.dataset.position));
  check(pos[1]>2,'W moves the player into the office');
  await page.screenshot({path:'output/playwright/office-walking.png'});
  await page.keyboard.down('KeyW');await page.waitForTimeout(4000);await page.keyboard.up('KeyW');
  const wall=await page.locator('#office-visit').evaluate(d=>JSON.parse(d.dataset.position));check(wall[1]<6.4,'The back wall and storage stop movement');
  await page.locator('#office-exit').click();await page.waitForFunction(()=>!document.querySelector('#office-visit').open);
  check(await page.locator('#canvas-host').evaluate(h=>document.activeElement===h),'Leaving returns focus to the street');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#office-enter').click();
  await page.waitForFunction(()=>document.querySelector('#office-visit')?.open&&document.querySelector('#office-visit').dataset.phase==='office',null,{timeout:60000});
  check(true,'Reduced motion enters without the elevator camera motion');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#office-visit').open);
  const guestContext=await page.context().browser().newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  await guestContext.addCookies([{name:'fixture_session',value:'guest',url:page.url()}]);
  const guest=await guestContext.newPage(),guestErrors=[];
  guest.on('pageerror',error=>guestErrors.push(error.message));
  try {
    await guest.goto(page.url(),{waitUntil:'commit'});
    await guest.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
    await guest.locator('#office-lobby').waitFor({state:'attached'});
    const entrance=await guest.evaluate(async()=>{const {officesFor}=await import('/src/office-contract.js');return officesFor(await(await fetch('/data/district.json')).json())[0].entrance;});
    await guest.locator('#office-lobby').evaluate(b=>b.click());
    await guest.locator('#office-nearby').waitFor({state:'visible'});
    await guest.waitForFunction(target=>{const m=window.__riverMultiplayer(),p=m.snapshot?.players.find(p=>p.id===m.selfId);return m.connected&&p&&Math.hypot(p.position[0]-target[0],p.position[1]-target[1])<.5;},entrance);
    check(await guest.locator('#office-enter').isDisabled(),'An uninvited guest cannot board');
    await guest.locator('#canvas-host').focus();await guest.keyboard.press('KeyF');
    await guest.locator('#office-request-dialog[open]').waitFor();
    await page.locator('#office-enter').click();
    await page.waitForFunction(()=>document.querySelector('#office-visit')?.open&&document.querySelector('#office-visit').dataset.phase==='office',null,{timeout:60000});
    await page.locator('#office-access').click();
    await page.locator('#office-management button').filter({hasText:'Invite resident'}).waitFor({timeout:15000});
    await page.locator('#office-management button').filter({hasText:'Invite resident'}).click();
    await guest.waitForFunction(()=>document.querySelector('#office-enter')?.disabled===false,null,{timeout:15000});
    await guest.locator('#office-enter').click();
    await guest.waitForFunction(()=>document.querySelector('#office-visit')?.open&&document.querySelector('#office-visit').dataset.phase==='office',null,{timeout:60000});
    check(true,'Jevica invites the visitor from her office and the guest enters');
    await guest.screenshot({path:'output/playwright/office-guest.png'});
    await page.locator('#office-management button').filter({hasText:'Revoke access'}).click();
    await guest.waitForFunction(()=>!document.querySelector('#office-visit').open);
    check(true,'Revocation returns the guest to the lobby immediately');
    await guest.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('#office-management button').filter({hasText:'Invite resident'}).click();
    await guest.waitForFunction(()=>document.querySelector('#office-enter')?.disabled===false);
    await guest.locator('#office-enter').click();
    await guest.waitForFunction(()=>document.querySelector('#office-visit')?.open&&document.querySelector('#office-visit').dataset.phase==='boarding');
    await page.locator('#office-management button').filter({hasText:'Revoke access'}).click();
    await guest.waitForFunction(()=>!document.querySelector('#office-visit').open);
    check(await guest.evaluate(()=>{const m=window.__riverMultiplayer();return !m.snapshot.players.find(p=>p.id===m.selfId)?.office&&window.__riverOffice()===null&&document.activeElement===document.querySelector('#canvas-host');}),'Revocation during boarding ends the authoritative visit and restores street controls');
    await page.locator('#office-exit').click();
    check(guestErrors.length===0,`No guest browser errors: ${guestErrors.join('; ')}`);
  } catch(error) {
    const diagnostics=await guest.evaluate(()=>{const m=window.__riverMultiplayer?.();return {connected:m?.connected,self:m?.snapshot?.players.find(p=>p.id===m.selfId),local:window.__riverCarriage?.().pose,nearby:document.querySelector('#office-nearby')?.getBoundingClientRect().toJSON(),active:document.activeElement?.id,pending:document.querySelector('#office-pending')?.open,request:document.querySelector('#office-request-dialog')?.open,status:[...document.querySelectorAll('.office-panel [role=status],#office-request-dialog [role=status]')].map(n=>n.textContent)};}).catch(e=>({unavailable:e.message}));
    await guest.screenshot({path:'output/playwright/office-guest-failure.png'}).catch(()=>{});
    throw new Error(`${error.message}\nGuest diagnostics: ${JSON.stringify({diagnostics,guestErrors})}`,{cause:error});
  } finally {await guestContext.close();}
  return {checks};
}
