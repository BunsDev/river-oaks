async (page, { computerOrigin, computerRevision, computerFraming }) => {
 // #487: the office desk against a real TypeSafe Computer checkout's embed child (typesafe-place-embed v1),
 // started by the runner from RIVER_OAKS_COMPUTER_CHECKOUT with TSC_AUTH=off dev users. Synthetic notes only.
 // Not hosted sign-in or a real origin pair: both servers are loopback, and Computer signs in without WorkOS.
 const checks=[],check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
 if(!computerOrigin||!computerRevision||!computerFraming)throw new Error('Run with RIVER_OAKS_COMPUTER_CHECKOUT=<checkout> pnpm run test:experience office-computer-real.');
 check(true,`Computer candidate ${computerRevision.branch} @ ${computerRevision.head}${computerRevision.dirty?' (dirty)':''} on ${computerOrigin}`);
 await page.emulateMedia({reducedMotion:'reduce'});
 const NOTE='Synthetic real-child note 487',LOCAL='Synthetic local-only note 487';
 const computerDocuments=[],deskBodies=[];
 page.on('request',r=>{if(r.url().startsWith(`${computerOrigin}/?embed=place`))computerDocuments.push(r.url());if(r.url().includes('/api/office-desk/')&&r.postData())deskBodies.push(r.postData());});
 const child=()=>page.frameLocator('.desk-computer-frame');
 const childFrame=()=>page.frames().find(f=>f.url().startsWith(`${computerOrigin}/?embed=place`));
 const frames=()=>page.locator('.desk-computer-frame').count();
 const state=()=>page.locator('#office-desk').getAttribute('data-computer');
 const waitState=(value,timeout=20000)=>page.waitForFunction(value=>document.querySelector('#office-desk')?.dataset.computer===value,value,{timeout});
 const waitView=value=>page.waitForFunction(value=>document.querySelector('#office-desk')?.dataset.view===value,value);
 const waitStatus=text=>page.waitForFunction(text=>document.querySelector('#desk-computer-status')?.textContent===text,text,{timeout:20000});
 const deskOpen=()=>page.locator('#office-desk').evaluate(d=>d.open);
 const gate=()=>child().getByRole('main',{name:'Choose your TypeSafe Computer account'});
 const widgets=()=>child().getByRole('article').count();
 const noteTitle=()=>child().getByRole('article',{name:'Note widget'}).first().getByRole('textbox',{name:'Note title'});
 const arrive=async(tab=page)=>{
  await tab.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  if(await tab.locator('#office-visit').evaluate(n=>n.open)){await tab.waitForFunction(()=>document.querySelector('#office-visit')?.dataset.phase==='office',null,{timeout:60000});return;}
  await tab.locator('#office-lobby').waitFor({state:'attached'});await tab.locator('#office-lobby').evaluate(b=>b.click());
  if(await tab.locator('#play-tab-office').count())await tab.locator('#play-tab-office').click();
  await tab.waitForFunction(()=>document.querySelector('#office-enter')?.disabled===false,null,{timeout:30000});
  await tab.locator('#office-enter').click();
  await tab.waitForFunction(()=>document.querySelector('#office-visit')?.dataset.phase==='office',null,{timeout:60000});
 };
 const openDesk=async(tab=page)=>{await tab.locator('#office-desk-open').click();await tab.locator('#desk-loading').waitFor({state:'hidden'});};
 // The gate comes first in every frame: Place says account-confirmation and Computer shows no widget.
 const openComputer=async()=>{
  await page.locator('#desk-view-computer').click();await waitState('account-confirmation');
  await gate().waitFor();return (await widgets())===0;
 };
 const continueIn=async()=>{await gate().getByRole('button',{name:'Continue'}).click();await waitState('usable');await child().getByRole('article',{name:'Checklist widget'}).waitFor();};
 const toTasks=async()=>{await page.locator('#desk-view-tasks').click();await waitView('tasks');};
 const instrument=tab=>tab.addInitScript(()=>{const live=new Set(),add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
  window.addEventListener=(type,fn,options)=>{if(type==='message')live.add(fn);return add(type,fn,options);};
  window.removeEventListener=(type,fn,options)=>{if(type==='message')live.delete(fn);return remove(type,fn,options);};
  window.__messageListeners=()=>live.size;
  const Native=window.WebSocket,sockets=[];window.WebSocket=class extends Native{constructor(...args){super(...args);sockets.push(this);}};
  window.__dropTown=()=>sockets.filter(s=>/\/multiplayer/.test(s.url)&&s.readyState===Native.OPEN).map(s=>s.close(4999,'journey: network drop')).length;});
 // Computer's own storage, through a same-origin page of Computer's that is not the desk frame.
 const forgetComputerCopy=async()=>{
  await page.evaluate(url=>new Promise(r=>{const f=document.createElement('iframe');f.className='journey-computer-storage';f.src=url;f.onload=r;document.body.append(f);}),`${computerOrigin}/api/health`);
  await page.frames().find(f=>f.url()===`${computerOrigin}/api/health`).evaluate(()=>localStorage.clear());
  await page.evaluate(()=>document.querySelector('.journey-computer-storage').remove());
 };

 await instrument(page);
 await page.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});await arrive();await openDesk();
 const listeners=await page.evaluate(()=>window.__messageListeners());
 check(await frames()===0&&computerDocuments.length===0,'Nothing loads from Computer before its tab opens');

 // The first milestone: account gate, a note, an account-acknowledged save, real frame destruction, recreation, recovery.
 check(await openComputer(),'A fresh frame shows Computer’s real account gate, Continue and Switch, before any document');
 check(await frames()===1&&computerDocuments.length===1,'Exactly one Computer frame');
 await continueIn();
 await child().getByRole('radiogroup',{name:'Widget size'}).getByRole('radio',{name:'Small'}).click();
 await child().getByRole('button',{name:'Add note',exact:true}).click();
 await noteTitle().fill(NOTE);
 await waitStatus('Saved to your Computer account');
 check(true,'Place shows the account save that Computer acknowledged');
 await page.screenshot({path:'output/playwright/desk-computer-real-desktop.png'});

 await page.evaluate(()=>{window.__deskParentKeys=0;addEventListener('keydown',()=>window.__deskParentKeys++,true);});
 const position=await page.locator('#office-visit').getAttribute('data-position');
 await noteTitle().press('End');for(const key of ['w','a','s','d','e','q','m','y'])await noteTitle().press(key);await page.waitForTimeout(300);
 check(await page.evaluate(()=>window.__deskParentKeys)===0&&await page.locator('#office-visit').getAttribute('data-position')===position,'Typing in Computer cannot move, act or talk in the office');
 await noteTitle().fill(NOTE);await waitStatus('Saved to your Computer account');

 await toTasks();
 check(await page.locator('#desk-computer-receipt').textContent()==='Computer saved your work to your account.'&&await frames()===0,'Leaving waits for Computer’s saved answer, then removes the frame');
 await forgetComputerCopy();
 check(await openComputer(),'Reentry starts a fresh account gate with nothing behind it');
 await continueIn();
 check(await noteTitle().inputValue()===NOTE,'The note comes back from the Computer account after the frame and this browser’s copy are gone');

 // Escape: Computer's palette first, then Computer's top level asks Place to close.
 await child().getByRole('main',{name:'TypeSafe Computer desktop'}).click({position:{x:8,y:8}});
 const palette=child().getByRole('dialog',{name:'Tell your computer'});
 for(let i=0;i<10&&!await palette.isVisible();i++){await page.keyboard.press('ControlOrMeta+k');await page.waitForTimeout(300);}
 await palette.waitFor();await page.keyboard.press('Escape');await palette.waitFor({state:'detached'});await page.waitForTimeout(300);
 check(await deskOpen()&&await state()==='usable','Escape closes Computer’s palette first');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#office-desk').open);
 check(await frames()===0&&await page.locator('#office-visit').evaluate(n=>n===document.activeElement),'Escape at Computer’s top level closes the desk, removes the frame and restores office focus');
 await openDesk();

 // A save the account cannot take: Computer asks, and its local copy is reported as local, never saved.
 await page.route(`${computerOrigin}/api/state`,route=>route.request().method()==='PUT'?route.fulfill({status:503,contentType:'application/json',body:'{}'}):route.continue());
 await openComputer();await continueIn();
 await noteTitle().fill(LOCAL);
 await page.waitForFunction(()=>/^(Offline|Not saved)/.test(document.querySelector('#desk-computer-status')?.textContent??''),null,{timeout:20000});
 await page.locator('#desk-view-tasks').click();await waitState('attention');
 const leave=child().getByRole('dialog',{name:"Your latest changes aren't in your account yet"});
 check(await leave.isVisible()&&await frames()===1,'An unsaved change asks for a decision in Computer instead of closing');
 await page.screenshot({path:'output/playwright/desk-computer-real-attention.png'});
 await page.locator('#desk-computer-keep').click();await waitState('usable');
 await leave.getByRole('button',{name:'Keep in this browser',exact:true}).click();await leave.waitFor({state:'detached'});
 await toTasks();
 check(await page.locator('#desk-computer-receipt').textContent()==='Computer kept unsynced changes in this browser.'&&await frames()===0,'Choosing Computer’s local copy is reported as local, not saved');
 await page.unroute(`${computerOrigin}/api/state`);
 await openComputer();await continueIn();
 check(await noteTitle().inputValue()===LOCAL,'The local copy is there in the next frame');
 await waitStatus('Saved to your Computer account');check(true,'…and reaches the account once it can');
 await toTasks();

 // Bounded resource cycle: ten open, edit, close, reopen visits.
 const before=computerDocuments.length;
 for(let visit=1;visit<=10;visit++){
  await openComputer();await continueIn();
  await noteTitle().fill(`${NOTE} · visit ${visit}`);await waitStatus('Saved to your Computer account');
  if(await frames()!==1)throw new Error(`Visit ${visit} ran ${await frames()} frames`);
  await toTasks();
 }
 check(computerDocuments.length-before===10,'Ten visits load ten Computer documents, one per visit');
 check(await frames()===0&&await page.evaluate(()=>window.__messageListeners())===listeners,'Ten visits leave no frame or message listener behind');

 // Forced teardown with the real child mounted: the visit ends, then the town connection drops.
 await openComputer();await continueIn();
 let started=Date.now();
 await page.evaluate(()=>{const m=window.__riverMultiplayer(),office=m.snapshot.players.find(p=>p.id===m.selfId).office;return window.__riverMultiplayerCommand({type:'office',action:'leave',officeId:office.id});});
 await page.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open&&!document.querySelector('#office-visit').open,null,{timeout:5000});
 check(Date.now()-started<5000,`Ending the visit removes Computer at once (${Date.now()-started} ms)`);
 await arrive();await openDesk();await openComputer();await continueIn();
 started=Date.now();check(await page.evaluate(()=>window.__dropTown())>0,'The journey drops the live town connection');
 await page.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open,null,{timeout:10000});
 check(Date.now()-started<5000,`A dropped connection removes Computer at once (${Date.now()-started} ms)`);
 await page.waitForFunction(()=>window.__riverMultiplayer?.().connected,null,{timeout:60000});
 // The world is rebuilt (Reload world data) with the real child mounted.
 await arrive();await openDesk();await openComputer();await continueIn();
 started=Date.now();await page.evaluate(()=>document.querySelector('#reload').click());
 await page.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open,null,{timeout:15000});
 check(Date.now()-started<10000,`Rebuilding the world removes Computer without waiting for it (${Date.now()-started} ms)`);
 await page.waitForFunction(()=>document.querySelector('#reload')?.disabled===false&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
 check(await page.evaluate(()=>window.__messageListeners())===listeners,'No Computer listener survives a dropped connection or a world rebuild');
 await arrive();await openDesk();

 // Switch: Computer signs out in its frame, and sign-in is a top-level tab Place offers.
 await openComputer();
 const [signOutTab]=await Promise.all([page.context().waitForEvent('page'),gate().getByRole('button',{name:'Switch account'}).click()]);
 await waitState('signin');
 check(await frames()===0&&await page.locator('#desk-computer-signin').getAttribute('href')===`${computerOrigin}/api/auth/login`,'Switch signs Computer out and Place offers its top-level sign-in, with no frame left');
 if(!signOutTab.isClosed())await signOutTab.close();
 // A second Computer account in this browser (a fresh dev user), signed in at the top level.
 await page.context().addCookies([{name:'tsc_dev_user',value:`user_local_dev_487_b_${Date.now().toString(36)}`,url:computerOrigin}]);
 const [signInTab]=await Promise.all([page.context().waitForEvent('page'),page.locator('#desk-computer-signin').click()]);
 await signInTab.waitForURL(`${computerOrigin}/`);check(await signInTab.evaluate(()=>window.top===window),'Computer sign-in happens in its own top-level tab');await signInTab.close();
 await page.locator('#desk-computer-continue').click();await waitState('account-confirmation');await gate().waitFor();
 await gate().getByRole('button',{name:'Continue'}).click();
 const ask=child().getByRole('dialog',{name:/^Add this computer's desktop to/});await ask.waitFor();
 check(await widgets()===0&&await state()==='account-confirmation','The other account’s desktop stays hidden while Computer asks what to do with it');
 await ask.getByRole('button',{name:"Use my account's copy"}).click();await waitState('usable');
 await child().getByRole('article',{name:'Checklist widget'}).waitFor();
 check(await child().getByRole('article',{name:'Note widget'}).count()===0,'The second Computer account sees only its own desktop');

 // An expired Computer session hides the desktop and Place offers sign-in again.
 await page.context().addCookies([{name:'tsc_dev_signed_out',value:'1',url:computerOrigin}]);
 await child().getByRole('button',{name:'Add note',exact:true}).click();
 await waitState('signin',30000);
 check(await frames()===0,'An expired Computer session removes the desktop and offers sign-in');
 await page.locator('#desk-computer-tasks').click();await waitView('tasks');
 await page.locator('#desk-close').click();await page.waitForFunction(()=>!document.querySelector('#office-desk').open);

 // Two Place accounts in another browser: a visitor, then the next Place account on the same page.
 // Each browser has its own Computer cookie, so the visitor is a separate Computer dev user.
 const guestContext=await page.context().browser().newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 await guestContext.addCookies([{name:'fixture_session',value:'guest',url:page.url()}]);
 const guest=await guestContext.newPage(),guestErrors=[];guest.on('pageerror',error=>guestErrors.push(error.message));await instrument(guest);
 const guestChild=()=>guest.frameLocator('.desk-computer-frame');
 const guestState=value=>guest.waitForFunction(value=>document.querySelector('#office-desk')?.dataset.computer===value,value,{timeout:20000});
 const guestGate=async()=>{await guest.locator('#desk-view-computer').click();await guestState('account-confirmation');
  await guestChild().getByRole('main',{name:'Choose your TypeSafe Computer account'}).waitFor();return (await guestChild().getByRole('article').count())===0;};
 const guestContinue=async()=>{await guestChild().getByRole('button',{name:'Continue'}).click();await guestState('usable');await guestChild().getByRole('article',{name:'Checklist widget'}).waitFor();};
 const gone=tab=>tab.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open,null,{timeout:10000});
 try{
  await page.locator('#office-access').click();
  await guest.goto(page.url(),{waitUntil:'commit'});
  await guest.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  await page.locator('#office-management button').filter({hasText:'Invite resident'}).waitFor({timeout:15000});
  await page.locator('#office-management button').filter({hasText:'Invite resident'}).click();
  await arrive(guest);await openDesk(guest);
  check(await guestGate(),'A visitor gets their own Computer account gate, with nothing behind it');
  await guestContinue();
  check(await guestChild().getByRole('article',{name:'Note widget'}).count()===0,'The visitor sees none of the office owner’s Computer notes');
  const revoked=Date.now();await page.locator('#office-management button').filter({hasText:'Revoke access'}).click();
  await guest.waitForFunction(()=>!document.querySelector('.desk-computer-frame')&&!document.querySelector('#office-desk').open&&!document.querySelector('#office-visit').open,null,{timeout:10000});
  check(Date.now()-revoked<5000,`Revocation removes the visitor’s Computer at once (${Date.now()-revoked} ms)`);

  await guestContext.addCookies([{name:'fixture_session',value:'bob',url:page.url()}]);
  await guest.reload({waitUntil:'commit'});
  await guest.waitForFunction(()=>window.__riverMultiplayer?.().connected&&window.__riverMultiplayer().selfId==='bob'&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  await page.locator('#office-management select option',{hasText:'bob'}).waitFor({state:'attached',timeout:15000});
  await page.locator('#office-management select').selectOption({label:'bob'});await page.locator('#office-management button').filter({hasText:'Invite resident'}).click();
  await arrive(guest);await openDesk(guest);
  check(await guest.locator('#desk-start').isVisible(),'A second Place account in the same browser sees only its own tasks');
  check(await guestGate(),'The next Place account gets a fresh Computer gate, not the previous desktop');
  await guestContinue();
  const signedOut=Date.now();
  await guest.evaluate(()=>fetch('/auth/session').then(r=>r.json()).then(s=>fetch('/auth/logout',{method:'POST',headers:{'X-CSRF-Token':s.csrfToken}})));
  await gone(guest);
  check(Date.now()-signedOut<5000,`Place sign-out removes Computer at once (${Date.now()-signedOut} ms)`);
  check(guestErrors.length===0,`No visitor browser errors: ${guestErrors.join('; ')}`);
 }finally{await guestContext.close();}

 // Denied framing: Computer's own frame-ancestors refuses this Place, and Place recovers to Tasks.
 // Last, because the restart forgets Computer's in-memory account sync.
 await computerFraming.refuse();
 await page.context().clearCookies({name:'tsc_dev_signed_out'});
 await openDesk();await page.locator('#desk-view-computer').click();await waitState('failed',25000);
 check(await frames()===0&&await page.locator('#desk-computer-open').getAttribute('href')===`${computerOrigin}/`&&await page.locator('#desk-computer-continue').textContent()==='Try again','A Computer that refuses this Place offers retry and Open separately, with no frame left behind');
 await page.locator('#desk-computer-tasks').click();await waitView('tasks');
 check(await page.locator('#office-desk').getAttribute('data-view')==='tasks'&&await frames()===0,'Tasks open after Computer refuses the frame');
 await computerFraming.allow();
 await page.locator('#desk-view-computer').click();await waitState('account-confirmation');await gate().waitFor();
 check(await frames()===1,'Once Computer lists this Place again, the next open frames it at the account gate');
 await toTasks();

 check(!deskBodies.some(body=>body.includes('Synthetic real-child')||body.includes('Synthetic local-only')),'Computer notes never reach Place task requests');
 check(!/Synthetic (real-child|local-only)/.test(await page.evaluate(()=>JSON.stringify(window.__riverMultiplayer().snapshot))),'Computer notes never appear in the public world snapshot');
 check(await frames()===0&&await page.evaluate(()=>window.__messageListeners())===listeners,'After every departure and forced teardown, no Computer frame or listener remains');
 return {checks,computer:{origin:computerOrigin,...computerRevision}};
}
