async (page, { computerOrigin }) => {
 // #486: Tasks and Computer in Jevica's office desk, against the separate-origin child fixture
 // (preview/e2e/fixtures/office-computer-child). Synthetic accounts and notes only.
 const checks=[],check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
 if(!computerOrigin)throw new Error('Run with pnpm run test:experience office-computer-embed; the runner starts the Computer fixture.');
 const fixture=mode=>fetch(`${computerOrigin}/api/fixture`,{method:'POST',body:JSON.stringify(mode)});
 await fixture({save:'ok',close:'normal',frame:'allow'});
 await page.emulateMedia({reducedMotion:'reduce'});
 const computerRequests=[],deskBodies=[];
 page.on('request',r=>{if(r.url().startsWith(computerOrigin))computerRequests.push(r.url());if(r.url().includes('/api/office-desk/')&&r.postData())deskBodies.push(r.postData());});
 const child=()=>page.frameLocator('.desk-computer-frame');
 const childFrame=()=>page.frames().find(f=>f.url().startsWith(`${computerOrigin}/?embed=place`));
 const frames=()=>page.locator('.desk-computer-frame').count();
 const state=()=>page.locator('#office-desk').getAttribute('data-computer');
 const waitState=(value,timeout=20000)=>page.waitForFunction(value=>document.querySelector('#office-desk')?.dataset.computer===value,value,{timeout});
 const waitView=value=>page.waitForFunction(value=>document.querySelector('#office-desk')?.dataset.view===value,value);
 const status=()=>page.locator('#desk-computer-status').textContent();
 const deskOpen=()=>page.locator('#office-desk').evaluate(d=>d.open);
 const arrive=async(tab=page)=>{
  await tab.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  // A reconnect or world rebuild can resume the server's visit without the lobby.
  if(await tab.locator('#office-visit').evaluate(n=>n.open)){await tab.waitForFunction(()=>document.querySelector('#office-visit')?.dataset.phase==='office',null,{timeout:60000});return;}
  await tab.locator('#office-lobby').waitFor({state:'attached'});await tab.locator('#office-lobby').evaluate(b=>b.click());
  if(await tab.locator('#play-tab-office').count())await tab.locator('#play-tab-office').click();
  await tab.waitForFunction(()=>document.querySelector('#office-enter')?.disabled===false,null,{timeout:30000});
  await tab.locator('#office-enter').click();
  await tab.waitForFunction(()=>document.querySelector('#office-visit')?.dataset.phase==='office',null,{timeout:60000});
 };
 const openDesk=async(tab=page)=>{await tab.locator('#office-desk-open').click();await tab.locator('#desk-loading').waitFor({state:'hidden'});};
 const signIn=async(tab,account)=>{
  const [popup]=await Promise.all([tab.context().waitForEvent('page'),tab.locator('#desk-computer-signin').click()]);
  await popup.locator(`button[value=${account}]`).click();await popup.locator('#standalone-account').filter({hasText:'Signed in as'}).waitFor();
  const top=await popup.evaluate(()=>window.top===window);await popup.close();return top;
 };

 // Counts live window message listeners, so departures and teardown can be shown to leave none behind,
 // and keeps the town sockets so a journey can drop the connection the way a network loss would.
 const instrument=tab=>tab.addInitScript(()=>{const live=new Set(),add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
  window.addEventListener=(type,fn,options)=>{if(type==='message')live.add(fn);return add(type,fn,options);};
  window.removeEventListener=(type,fn,options)=>{if(type==='message')live.delete(fn);return remove(type,fn,options);};
  window.__messageListeners=()=>live.size;
  const Native=window.WebSocket,sockets=[];window.WebSocket=class extends Native{constructor(...args){super(...args);sockets.push(this);}};
  window.__dropTown=()=>sockets.filter(s=>/\/multiplayer/.test(s.url)&&s.readyState===Native.OPEN).map(s=>s.close(4999,'journey: network drop')).length;});
 await instrument(page);
 await page.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});await arrive();await openDesk();
 const listeners=await page.evaluate(()=>window.__messageListeners());
 check(await page.locator('#desk-views').isVisible()&&await page.locator('#desk-view-tasks').getAttribute('aria-selected')==='true','The desk opens on Tasks with a Computer tab beside it');
 check(await frames()===0&&computerRequests.length===0,'Nothing loads from Computer before its tab opens');

 // A Tasks draft whose save failed: its retry and contents must survive a visit to Computer.
 await page.locator('#desk-start').click();await page.locator('#desk-title').fill('Synthetic desk draft');
 await page.route('**/api/office-desk/save?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'desk_unavailable'})}));
 await page.locator('#desk-notes').fill('Keep this draft while I use Computer.');await page.locator('#desk-notice').waitFor({state:'visible'});
 await page.locator('#desk-view-computer').click();await page.locator('#desk-confirm').waitFor({state:'visible'});
 check(/open Computer/.test(await page.locator('#desk-confirm-message').textContent())&&await frames()===0,'An unsaved task asks before Computer opens');
 // A second click retries the save; Computer still waits for it and for the person's choice.
 await page.locator('#desk-view-computer').click();await page.locator('#desk-confirm').waitFor({state:'visible'});
 check(await frames()===0&&await page.locator('#office-desk').getAttribute('data-view')==='tasks'&&computerRequests.length===0,'Clicking Computer again retries the task first and still asks');
 await page.locator('#desk-confirm-yes').click();

 await waitState('signin');
 check(await frames()===0&&await page.locator('#desk-computer-signin').getAttribute('href')===`${computerOrigin}/api/auth/login`&&await page.locator('#desk-computer-signin').getAttribute('target')==='_blank','Signed-out Computer offers its fixed top-level sign-in, with no frame left behind');
 await page.screenshot({path:'output/playwright/desk-computer-signin.png'});
 check(await signIn(page,'ada'),'Computer sign-in happens in its own top-level tab');
 await page.locator('#desk-computer-continue').click();await waitState('account-confirmation');
 check(await child().locator('#gate-name').textContent()==='Ada Fixture'&&await child().locator('#desktop').isHidden(),'A fresh frame shows Computer’s own account choice before any document');
 check(await frames()===1,'Exactly one Computer frame');
 await child().locator('#continue').click();await waitState('usable');
 await child().locator('#note').fill('Synthetic note for Ada');
 await page.waitForFunction(()=>document.querySelector('#desk-computer-status')?.textContent==='Saved to your Computer account');
 check(true,'Computer reports an acknowledged account save in the parent status');
 await page.screenshot({path:'output/playwright/desk-computer-desktop.png'});

 // Keys typed in Computer never reach the world: no parent handler sees them.
 await page.evaluate(()=>{window.__deskParentKeys=0;addEventListener('keydown',()=>window.__deskParentKeys++,true);});
 const position=await page.locator('#office-visit').getAttribute('data-position');
 await child().locator('#note').press('End');for(const key of ['w','a','s','d','e','q','z','m','y','f'])await child().locator('#note').press(key);await page.waitForTimeout(300);
 check(await page.evaluate(()=>window.__deskParentKeys)===0&&await page.locator('#office-visit').getAttribute('data-position')===position,'Typing in Computer cannot move, act or talk in the office');
 await child().locator('#note').fill('Synthetic note for Ada');await page.waitForFunction(()=>document.querySelector('#desk-computer-status')?.textContent==='Saved to your Computer account');

 const sent=await childFrame().evaluate(()=>window.__fixture.received);
 check(sent.length>=1&&sent.every(m=>['protocol','version','type','instanceId',...(m.type==='prepare-close'?['requestId']:[])].join()===Object.keys(m).join()),'Place sends Computer lifecycle fields only: no credentials, account or task data');

 // Escape: Computer's own menu first, then its top level asks Place to close.
 await child().locator('#menu-button').click();await child().locator('#menu').waitFor({state:'visible'});
 await page.keyboard.press('Escape');await child().locator('#menu').waitFor({state:'hidden'});
 check(await deskOpen()&&await state()==='usable','Escape closes Computer’s own menu first');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#office-desk').open);
 check(await frames()===0&&await page.locator('#office-visit').evaluate(n=>n===document.activeElement),'Escape at Computer’s top level closes the desk, removes the frame and restores office focus');

 await openDesk();
 check(await page.locator('#desk-title').inputValue()==='Synthetic desk draft'&&await page.locator('#desk-notes').inputValue()==='Keep this draft while I use Computer.'&&await page.locator('#desk-notice').isVisible(),'The Tasks draft and its failed save survive Computer');
 await page.unroute('**/api/office-desk/save?*');await page.locator('#desk-retry').click();
 await page.waitForFunction(()=>document.querySelector('#desk-save-status')?.textContent==='All changes saved');check(true,'Retry then saves the same task');
 for(let visit=0;visit<3;visit++){
  await page.locator('#desk-view-computer').click();await waitState('account-confirmation');await child().locator('#continue').click();await waitState('usable');
  check(await frames()===1,`Computer visit ${visit+1} runs exactly one frame`);
  await page.locator('#desk-view-tasks').click();await waitView('tasks');
 }
 check(await frames()===0&&await page.evaluate(()=>window.__messageListeners())===listeners,'Repeated Computer visits leave no frame or message listener behind');

 // A conflict survives a visit to Computer: the draft and the Reload choice wait on Tasks.
 await page.route('**/api/office-desk/save?*',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'desk_conflict'})}));
 await page.locator('#desk-notes').fill('Synthetic conflicting draft');await page.locator('#desk-reload').waitFor({state:'visible'});
 await page.locator('#desk-view-computer').click();await page.locator('#desk-confirm').waitFor({state:'visible'});await page.locator('#desk-confirm-yes').click();
 await waitState('account-confirmation');await page.locator('#desk-view-tasks').click();await waitView('tasks');
 check(await page.locator('#desk-notes').inputValue()==='Synthetic conflicting draft'&&await page.locator('#desk-reload').isVisible()&&/changed in another tab/.test(await page.locator('#desk-error').textContent())&&await page.locator('#desk-save').isDisabled(),'A task conflict and its draft survive a visit to Computer, still offering Reload saved work');
 await page.unroute('**/api/office-desk/save?*');
 await page.locator('#desk-reload').click();await page.locator('#desk-confirm-yes').click();
 await page.waitForFunction(()=>document.querySelector('#desk-notice')?.hidden&&document.querySelector('#desk-notes')?.value==='Keep this draft while I use Computer.');
 check(true,'Reload saved work then restores the saved task');

 await page.locator('#desk-view-computer').click();await waitState('account-confirmation');
 check(await child().locator('#desktop').isHidden(),'Reentry starts a fresh account gate');
 await child().locator('#continue').click();await waitState('usable');
 check(await child().locator('#note').inputValue()==='Synthetic note for Ada','The note saved to the Computer account comes back after the frame was destroyed and recreated');

 // A save still in flight when leaving: the frame stays until Computer says it is done.
 await fixture({save:'slow'});
 await child().locator('#note').fill('Synthetic note, saved while leaving');await page.locator('#desk-view-tasks').click();
 await waitState('closing');check(await frames()===1&&/Checking/.test(await status()),'Leaving during a save waits for Computer with the frame still mounted');
 await waitView('tasks');
 check(await page.locator('#desk-computer-receipt').textContent()==='Computer saved your work to your account.'&&await frames()===0,'Computer confirms the account save before the frame is removed');
 await fixture({save:'ok',close:'cancel'});
 await page.locator('#desk-view-computer').click();await waitState('account-confirmation');await child().locator('#continue').click();await waitState('usable');
 const instance=await childFrame().evaluate(()=>window.__fixture.state.instanceId);
 await page.locator('#desk-view-tasks').click();await page.waitForFunction(()=>document.querySelector('#office-desk').dataset.computer==='usable'&&!document.querySelector('#desk-view-tasks').disabled);
 check(await page.locator('#office-desk').getAttribute('data-view')==='computer'&&await childFrame().evaluate(()=>window.__fixture.state.instanceId)===instance,'A cancelled close keeps editing in the same Computer');

 // Forged, stale and malformed messages change nothing.
 await childFrame().evaluate(id=>{const send=window.__fixture.send,base={protocol:'typesafe-place-embed',version:1};
  send({...base,type:'status',instanceId:'stale-instance-00000001',state:'signin-required',sync:'none'});
  send({...base,type:'status',instanceId:id,state:'usable',sync:'saved',note:'leak'});
  send({...base,version:2,type:'request-close',instanceId:id});
  send({...base,type:'close-result',instanceId:id,requestId:'request-not-pending-01',result:'ready',persistence:'saved'});
  send({...base,type:'request-close',instanceId:id,url:'https://example.com/'});send({...base,type:'init',instanceId:id});},instance);
 const here=page.url();
 await page.evaluate(id=>window.postMessage({protocol:'typesafe-place-embed',version:1,type:'request-close',instanceId:id},'*'),instance);
 await page.waitForTimeout(300);
 check(await state()==='usable'&&await deskOpen()&&await frames()===1&&page.url()===here,'Stale, malformed, unsupported, URL-bearing and wrong-origin messages are ignored and navigate nothing');
 // Real cross-origin forgeries with the current instance id: another origin, and Computer's own origin from a window that is not the frame.
 const {elsewhere}=await (await fetch(`${computerOrigin}/api/fixture`)).json();
 await page.evaluate(([urls,id])=>{
  window.__forged=[];window.__forgedListener=event=>{if(event.data?.instanceId===id)window.__forged.push(event.origin);};addEventListener('message',window.__forgedListener);
  const messages=[{protocol:'typesafe-place-embed',version:1,type:'status',instanceId:id,state:'signin-required',sync:'none'},{protocol:'typesafe-place-embed',version:1,type:'request-close',instanceId:id}];
  for(const url of urls){const f=document.createElement('iframe');f.className='journey-forge';f.src=`${url}#${encodeURIComponent(JSON.stringify(messages))}`;document.body.append(f);}
 },[[`${elsewhere}/forge`,`${computerOrigin}/forge`],instance]);
 await page.waitForFunction(()=>window.__forged.length>=4,null,{timeout:15000});
 const forgedFrom=await page.evaluate(()=>{removeEventListener('message',window.__forgedListener);for(const f of document.querySelectorAll('.journey-forge'))f.remove();return [...new Set(window.__forged)];});
 check(forgedFrom.length===2&&await state()==='usable'&&await deskOpen()&&await frames()===1,`Forged sign-in and close messages from another origin and from another Computer window change nothing (${forgedFrom.join(', ')})`);
 // A reload inside Computer is a new document: a fresh instance and account gate, nothing carried over.
 await childFrame().evaluate(()=>location.reload());await waitState('account-confirmation');
 check(await child().locator('#desktop').isHidden()&&await status()==='Confirm your TypeSafe Computer account to continue','A reload inside Computer starts a fresh account gate and drops the old save status');
 await child().locator('#continue').click();await waitState('usable');
 await fixture({close:'normal'});

 // Switching Computer accounts shows that account's own desktop.
 await page.locator('#desk-view-tasks').click();await waitView('tasks');
 await page.locator('#desk-view-computer').click();await waitState('account-confirmation');
 await child().locator('#switch').click();await child().locator('#account-ben').click();await child().locator('#gate-name').filter({hasText:'Ben Fixture'}).waitFor();
 await child().locator('#continue').click();await waitState('usable');
 check(await child().locator('#note').inputValue()==='','Another Computer account sees only its own notes');

 // A failed save is never reported as saved; Computer's local copy is labelled as such.
 await fixture({save:'fail'});
 await child().locator('#note').fill('Synthetic offline draft for Ben');
 await page.waitForFunction(()=>document.querySelector('#desk-computer-status')?.textContent==='Not saved to your Computer account yet');
 await page.locator('#desk-view-tasks').click();await waitState('attention');
 check(await child().locator('#save-dialog').isVisible()&&/needs your decision/.test(await page.locator('#desk-computer-message').textContent())&&await frames()===1,'An unsaved change asks for a decision instead of closing');
 await page.screenshot({path:'output/playwright/desk-computer-attention.png'});
 await page.locator('#desk-computer-keep').click();await waitState('usable');
 await child().locator('#keep-local').click();
 await page.waitForFunction(()=>document.querySelector('#desk-computer-status')?.textContent==='Offline · Computer is keeping changes in this browser');
 await page.locator('#desk-view-tasks').click();await waitView('tasks');
 check(await page.locator('#desk-computer-receipt').textContent()==='Computer kept unsynced changes in this browser.','Leaving after keeping a local copy says so, not “saved”');
 await page.locator('#desk-close').click();await page.waitForFunction(()=>!document.querySelector('#office-desk').open);await openDesk();
 check(await page.locator('#desk-computer-receipt').textContent()==='','An old receipt does not reappear on the next visit to the desk');
 await page.locator('#desk-view-computer').click();await waitState('account-confirmation');await child().locator('#continue').click();await waitState('usable');
 check(await child().locator('#note').inputValue()==='Synthetic offline draft for Ben'&&await status()==='Offline · Computer is keeping changes in this browser','Computer recovers its local copy in the same browser, still marked unsynced');
 await fixture({save:'ok'});

 // No answer: keep the frame and offer keep, retry and an explicit exit.
 await fixture({close:'hang'});
 await page.locator('#desk-computer-return').click();await waitState('closing');await waitState('unconfirmed',15000);
 check(await frames()===1&&/didn’t confirm/.test(await page.locator('#desk-computer-message').textContent())&&await page.locator('#desk-computer-try').isVisible()&&await page.locator('#desk-computer-keep').isVisible(),'An unanswered close is not treated as a save');
 await page.screenshot({path:'output/playwright/desk-computer-unconfirmed.png'});
 await page.locator('#desk-computer-leave').click();await page.waitForFunction(()=>!document.querySelector('#office-desk').open);
 check(await frames()===0&&await page.locator('#office-visit').evaluate(n=>n.open&&n===document.activeElement),'Leave without confirmation removes the frame and returns to the office');

 // Forced: the visit ends while Computer hangs in the middle of a close. The frame goes at once.
 await openDesk();
 await page.locator('#desk-view-computer').click();await waitState('account-confirmation');await child().locator('#continue').click();await waitState('usable');
 await page.locator('#desk-computer-return').click();await waitState('closing');
 const started=Date.now();
 await page.evaluate(()=>{const m=window.__riverMultiplayer(),office=m.snapshot.players.find(p=>p.id===m.selfId).office;return window.__riverMultiplayerCommand({type:'office',action:'leave',officeId:office.id});});
 await page.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open&&!document.querySelector('#office-visit').open,null,{timeout:5000});
 check(Date.now()-started<5000,`Ending the visit removes an unresponsive Computer at once (${Date.now()-started} ms)`);

 // Forced: the town connection drops while Computer hangs. The desk does not wait for a reconnect.
 await arrive();await openDesk();await page.locator('#desk-view-computer').click();await waitState('account-confirmation');await child().locator('#continue').click();await waitState('usable');
 const dropped=Date.now();check(await page.evaluate(()=>window.__dropTown())>0,'The journey drops the live town connection');
 await page.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open,null,{timeout:10000});
 check(Date.now()-dropped<5000,`A dropped connection removes an unresponsive Computer at once (${Date.now()-dropped} ms)`);
 await page.waitForFunction(()=>window.__riverMultiplayer?.().connected,null,{timeout:60000});

 // Forced: the world is rebuilt (Reload world data) while Computer hangs.
 await arrive();await openDesk();await page.locator('#desk-view-computer').click();await waitState('account-confirmation');await child().locator('#continue').click();await waitState('usable');
 const rebuilt=Date.now();await page.evaluate(()=>document.querySelector('#reload').click());
 await page.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open,null,{timeout:15000});
 check(Date.now()-rebuilt<10000,`Rebuilding the world removes an unresponsive Computer without waiting for it (${Date.now()-rebuilt} ms)`);
 await page.waitForFunction(()=>document.querySelector('#reload')?.disabled===false&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
 check(await page.evaluate(()=>window.__messageListeners())===listeners,'No Computer listener survives a dropped connection or a world rebuild');
 await fixture({close:'normal'});

 // Denied framing (Computer's frame-ancestors) times out to working recovery.
 await fixture({frame:'deny'});
 await arrive();await openDesk();await page.locator('#desk-view-computer').click();await waitState('failed',25000);
 check(await frames()===0&&await page.locator('#desk-computer-open').getAttribute('href')===`${computerOrigin}/`&&await page.locator('#desk-computer-continue').textContent()==='Try again','A Computer that cannot load offers retry and Open separately, with no frame left behind');
 await page.screenshot({path:'output/playwright/desk-computer-failed.png'});
 await page.locator('#desk-computer-tasks').click();await waitView('tasks');
 check(await page.locator('#desk-title').inputValue()==='Synthetic desk draft','Tasks keep working after Computer fails');
 await fixture({frame:'allow'});

 // Narrow touch layout and keyboard return.
 await page.setViewportSize({width:390,height:844});
 await page.locator('#desk-view-computer').click();await waitState('account-confirmation');await child().locator('#continue').click();await waitState('usable');
 const fit=await page.evaluate(()=>{const d=document.querySelector('#office-desk'),f=document.querySelector('.desk-computer-frame').getBoundingClientRect(),r=document.querySelector('#desk-computer-return').getBoundingClientRect();return {overflow:d.scrollWidth>d.clientWidth,frame:f.width>300&&f.height>400&&f.right<=innerWidth,ret:r.height>=43&&r.right<=innerWidth&&r.bottom<=innerHeight};});
 check(!fit.overflow&&fit.frame&&fit.ret,'Phone-width desk fits Computer and a touch-sized Return to office');
 await page.screenshot({path:'output/playwright/desk-computer-mobile.png'});
 await page.setViewportSize({width:320,height:700});check(!await page.locator('#office-desk').evaluate(d=>d.scrollWidth>d.clientWidth),'Small phones keep the Computer view contained');
 await page.locator('#desk-computer-return').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('#office-desk').open);
 check(await frames()===0&&await page.locator('#office-visit').evaluate(n=>n===document.activeElement),'Return to office works from the keyboard and restores office focus');
 await page.setViewportSize({width:1440,height:1000});

 // A visitor opens their own Computer, and revocation removes it at once even when it hangs.
 const guestContext=await page.context().browser().newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 await guestContext.addCookies([{name:'fixture_session',value:'guest',url:page.url()}]);
 const guest=await guestContext.newPage(),guestErrors=[];guest.on('pageerror',error=>guestErrors.push(error.message));await instrument(guest);
 try{
  await page.locator('#office-access').click();
  await guest.goto(page.url(),{waitUntil:'commit'});
  await guest.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  await page.locator('#office-management button').filter({hasText:'Invite resident'}).waitFor({timeout:15000});
  await page.locator('#office-management button').filter({hasText:'Invite resident'}).click();
  await arrive(guest);await openDesk(guest);
  await guest.locator('#desk-view-computer').click();await guest.waitForFunction(()=>document.querySelector('#office-desk')?.dataset.computer==='signin');
  check(true,'A visitor does not inherit the office owner’s Computer session');
  await signIn(guest,'cy');await guest.locator('#desk-computer-continue').click();
  await guest.waitForFunction(()=>document.querySelector('#office-desk')?.dataset.computer==='account-confirmation');
  check(await guest.frameLocator('.desk-computer-frame').locator('#gate-name').textContent()==='Cy Fixture','The visitor confirms their own Computer account');
  await guest.frameLocator('.desk-computer-frame').locator('#continue').click();await guest.waitForFunction(()=>document.querySelector('#office-desk')?.dataset.computer==='usable');
  check(await guest.frameLocator('.desk-computer-frame').locator('#note').inputValue()==='','The visitor sees none of another account’s notes');
  await fixture({close:'hang'});
  const revoked=Date.now();await page.locator('#office-management button').filter({hasText:'Revoke access'}).click();
  await guest.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open&&!document.querySelector('#office-visit').open,null,{timeout:10000});
  check(Date.now()-revoked<5000,`Revocation removes the visitor’s unresponsive Computer at once (${Date.now()-revoked} ms)`);
  // The next Place account in the same browser: its own tasks, and a fresh Computer gate, never the prior desktop.
  await fixture({close:'normal'});
  await guestContext.addCookies([{name:'fixture_session',value:'bob',url:page.url()}]);
  await guest.reload({waitUntil:'commit'});
  await guest.waitForFunction(()=>window.__riverMultiplayer?.().connected&&window.__riverMultiplayer().selfId==='bob'&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  await page.locator('#office-management select option',{hasText:'bob'}).waitFor({state:'attached',timeout:15000});
  await page.locator('#office-management select').selectOption({label:'bob'});await page.locator('#office-management button').filter({hasText:'Invite resident'}).click();
  await arrive(guest);await openDesk(guest);
  check(await guest.locator('#desk-start').isVisible(),'A second Place account in the same browser sees only its own tasks');
  await guest.locator('#desk-start').click();await guest.locator('#desk-title').fill('Synthetic task for bob');
  await guest.waitForFunction(()=>document.querySelector('#desk-save-status')?.textContent==='All changes saved');
  await guest.locator('#desk-view-computer').click();await guest.waitForFunction(()=>document.querySelector('#office-desk')?.dataset.computer==='account-confirmation');
  check(await guest.frameLocator('.desk-computer-frame').locator('#desktop').isHidden()&&await guest.frameLocator('.desk-computer-frame').locator('#gate-name').textContent()==='Cy Fixture','The next Place account gets a fresh Computer gate, not the previous desktop');
  await guest.frameLocator('.desk-computer-frame').locator('#continue').click();await guest.waitForFunction(()=>document.querySelector('#office-desk')?.dataset.computer==='usable');
  await fixture({close:'hang'});
  // A live Place account change on this page: the connection returns as another account, and
  // access-entry reloads the page into that account at its next check (every 15 s). Wait for
  // that reload before going on, so it cannot land in the middle of a later step.
  const reloaded=guest.waitForEvent('domcontentloaded',{timeout:30000});reloaded.catch(()=>{});
  await guestContext.addCookies([{name:'fixture_session',value:'guest',url:page.url()}]);
  const switched=Date.now();check(await guest.evaluate(()=>window.__dropTown())>0,'The page reconnects as another Place account');
  await guest.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open,null,{timeout:10000});
  check(Date.now()-switched<5000,`The account change removes bob’s unresponsive Computer at once (${Date.now()-switched} ms)`);
  await reloaded;check(true,'The page then reloads into the new Place account');
  await guest.waitForFunction(()=>window.__riverMultiplayer?.().connected&&window.__riverMultiplayer().selfId==='guest',null,{timeout:60000});
  await page.locator('#office-management select option',{hasText:'guest'}).waitFor({state:'attached',timeout:15000});
  await page.locator('#office-management select').selectOption({label:'guest'});await page.locator('#office-management button').filter({hasText:'Invite resident'}).click();
  await arrive(guest);await openDesk(guest);
  check(await guest.locator('#desk-count').textContent()==='0'&&await guest.locator('#desk-start').isVisible(),'After the account change on the same page, none of bob’s tasks are shown');
  await guest.locator('#desk-view-computer').click();await guest.waitForFunction(()=>document.querySelector('#office-desk')?.dataset.computer==='account-confirmation');
  check(await guest.frameLocator('.desk-computer-frame').locator('#desktop').isHidden(),'After the account change, Computer starts at its account gate, not bob’s desktop');
  await guest.frameLocator('.desk-computer-frame').locator('#continue').click();await guest.waitForFunction(()=>document.querySelector('#office-desk')?.dataset.computer==='usable');
  const signedOut=Date.now();
  await guest.evaluate(()=>fetch('/auth/logout',{method:'POST',headers:{'X-CSRF-Token':'fixture-guest'}}));
  await guest.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open,null,{timeout:10000});
  check(Date.now()-signedOut<5000,`Place sign-out removes an unresponsive Computer at once (${Date.now()-signedOut} ms)`);
  check(guestErrors.length===0,`No guest browser errors: ${guestErrors.join('; ')}`);
 }finally{await fixture({close:'normal'});await guestContext.close();}

 check(!deskBodies.some(body=>/Synthetic (note|offline)/.test(body)),'Computer notes never reach Place task requests');
 check(!/Synthetic (note|offline)/.test(await page.evaluate(()=>JSON.stringify(window.__riverMultiplayer().snapshot))),'Computer notes never appear in the public world snapshot');
 check(await frames()===0&&await page.evaluate(()=>window.__messageListeners())===listeners,'After every departure and forced teardown, no Computer frame or listener remains');
 return {checks};
}
