async page => {
 const origin='http://127.0.0.1:5180',checks=[],errors=[],heldResponses=[];
 const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
 const ready=p=>p.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host').dataset.playerReady==='true',null,{timeout:60000});
 page.on('pageerror',e=>errors.push(e.message));await page.context().addCookies([{name:'fixture_session',value:'alice',url:origin}]);
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/?motion-debug=1&render-audit=1');await ready(page);
 const peerContext=await page.context().browser().newContext({viewport:{width:1440,height:1000}});
 await peerContext.addCookies([{name:'fixture_session',value:'bob',url:origin}]);const peer=await peerContext.newPage();peer.setDefaultTimeout(60000);peer.on('pageerror',e=>errors.push(e.message));
 // Fault only the receiving peer's transport. The authoritative server and
 // owner's account remain untouched throughout fallback/recovery assertions.
 let peerFault=null,peerFaultSnapshots=0,peerConnections=0;
 await peer.routeWebSocket('**/multiplayer?*',client=>{
  const server=client.connectToServer();peerConnections++;
  client.onMessage(message=>server.send(message));
  server.onMessage(message=>{
   const data=JSON.parse(String(message));
   if(data.type==='snapshot'&&peerFault){
    const player=data.players?.find(player=>player.id==='alice');
    if(player?.character){peerFault(player);peerFaultSnapshots++;client.send(JSON.stringify(data));return;}
   }
   client.send(message);
  });
 });
 const framePeer=async()=>{
  await peer.evaluate(()=>{const p=window.__riverMultiplayer().snapshot.players.find(p=>p.id==='alice');const [x,z,y]=p.position;window.__riverRenderAudit.view({position:[x,y+1.3,-z+3.5],target:[x,y+1,-z],fov:38});});
  await peer.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 };
 const rendered=async(p,palette,remote)=>{
  const expected={rose:'b66e89',midnight:'353044'}[palette];if(!expected)return;
  await p.waitForFunction(({expected,remote})=>{const view=window.__riverMultiplayer(),materials=(remote?view.remotes.find(p=>p.id==='alice')?.materials:view.selfMaterials)??[];const outfit=materials.filter(m=>m.slot==='outfit');return outfit.length>0&&outfit.every(m=>m.color===expected);},{expected,remote});
  check(true,`${remote?'Peer':'Local'} loaded outfit materials use ${palette}`);
 };
 const open=async()=>{
  if(!await page.locator('.visit-tools').evaluate(n=>n.open))await page.locator('.visit-tools-toggle').click();
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.getByRole('button',{name:'Open character studio',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
 };
 const dialog=page.getByRole('dialog',{name:'Character studio'});
 const account=()=>page.evaluate(()=>fetch('/api/character').then(r=>r.json()));
 const waitWear=async palette=>{
  await page.waitForFunction(()=>['ready','error','conflict'].includes(document.querySelector('.character-studio').dataset.accountPhase));
  if(await dialog.locator('[data-retry]').isVisible()){
   await page.waitForTimeout(2200);await dialog.locator('[data-retry]').click();
  }
  await page.waitForFunction(palette=>window.__riverMultiplayer().snapshot.players.find(p=>p.id==='alice')?.character?.palette===palette,palette);
  await peer.waitForFunction(palette=>window.__riverMultiplayer().remotes.some(p=>p.id==='alice'&&p.character?.palette===palette),palette);
  await rendered(page,palette,false);await rendered(peer,palette,true);
 };
 try{
  await peer.goto(origin+'/?motion-debug=1&render-audit=1');await ready(peer);
  await peer.waitForFunction(()=>{const remote=window.__riverMultiplayer().remotes.find(p=>p.id==='alice');return remote?.ready&&remote.appearance==='sable-human'&&remote.character?.revision===0&&remote.character.palette==='authored'&&remote.character.hair==='authored';});
  const authoredBaseline=await peer.evaluate(()=>window.__riverMultiplayer().remotes.find(p=>p.id==='alice').materials);
  check(['outfit','hair'].every(slot=>authoredBaseline.some(material=>material.slot===slot)),'Known authored Sable baseline includes real outfit and hair materials before customization');
  const alternate=await peer.evaluate(async()=>{
   const {characterDefinitionFor,validateCharacterDefinition}=await import('/src/character-definition.js');
   const definition=characterDefinitionFor('alice','man-tailored',{revision:2});
   if(!validateCharacterDefinition(definition,{ownerId:'alice'}).ok)throw new Error('Alternate appearance fixture must be independently valid');
   return definition;
  });
  check(alternate.appearanceId!=='sable-human'&&alternate.revision>0,'Appearance mismatch uses a valid owned published definition for a different appearance');
  await open();
  await dialog.locator('[data-character=sable]').click();
  await dialog.getByRole('radio',{name:'Rose silk',exact:true}).click();await dialog.getByRole('radio',{name:'Espresso',exact:true}).click();
  await dialog.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
  let saved=await account();check(saved.character.draft.palette==='rose'&&!saved.selection.character,'Save keeps the customized draft private');
  await dialog.locator('[data-wear]').click();await waitWear('rose');saved=await account();
  check(saved.character.published.revision===1&&saved.selection.character.palette==='rose','Wear publishes and equips the owner revision');
  const deferredCases=['save','read'];
  const holdResponse=async pattern=>{
   let release,captured,captureFailed,finished,routeError,timer,first=true;
   const gate=new Promise(resolve=>{release=resolve;}),done=new Promise(resolve=>{finished=resolve;});
   const received=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Expected held account response was not captured')),15000);captured=()=>{clearTimeout(timer);resolve();};captureFailed=error=>{clearTimeout(timer);reject(error);};});
   // The capture can fail while a preceding browser action is still pending.
   received.catch(()=>{});
   const handler=async route=>{if(!first)return route.continue();first=false;try{const response=await route.fetch();captured();await gate;await route.fulfill({response});}catch(error){routeError=error;captureFailed(error);}finally{finished();}};
   await page.route(pattern,handler);
   const held={received,release:async()=>{clearTimeout(timer);release();if(!first)await done;await page.unroute(pattern,handler);if(routeError)throw routeError;}};
   heldResponses.push(held);return held;
  };
  if(deferredCases.includes('save')){
   const held=await holdResponse('**/api/character/draft?*');
   await dialog.getByRole('radio',{name:'Lagoon',exact:true}).click();await dialog.locator('[data-save]').click();await held.received;
   await dialog.getByRole('radio',{name:'Rose silk',exact:true}).click();await dialog.locator('[data-close]').click();
   await page.waitForTimeout(2200);await page.locator('input[name=player-character][value=rowan]').check();
   await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerAppearance==='rowan-human'&&document.querySelector('#canvas-host').dataset.playerReady==='true');
   await page.getByRole('button',{name:'Open character studio',exact:true}).click();
   check(['loading','saving'].includes(await dialog.getAttribute('data-account-phase')),'The delayed account operation is still pending on reopen');await held.release();
   await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
   check(await dialog.getAttribute('data-palette')==='rose','A delayed save preserves the retained visible edit across reopening');
   check(await dialog.locator('[data-wear]').isEnabled(),'Reopening during a delayed save refreshes selection after the save settles');
   await dialog.locator('.cs-preview[data-ready=true]').waitFor();
   await page.screenshot({path:'output/playwright/character-studio-deferred-save-ready.png'});
   await dialog.locator('[data-wear]').click();await waitWear('rose');
   check((await account()).character.published.revision===1,'Rewear after a delayed save reuses the published look');
  }
  if(deferredCases.includes('read')){
   await dialog.locator('[data-close]').click();const held=await holdResponse('**/api/character?*');
   await page.getByRole('button',{name:'Open character studio',exact:true}).click();await held.received;
   await dialog.getByRole('radio',{name:'Midnight',exact:true}).click();await dialog.locator('[data-close]').click();
   await page.waitForTimeout(2200);await page.locator('input[name=player-character][value=rowan]').check();
   await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerAppearance==='rowan-human'&&document.querySelector('#canvas-host').dataset.playerReady==='true');
   await page.getByRole('button',{name:'Open character studio',exact:true}).click();
   check(['loading','saving'].includes(await dialog.getAttribute('data-account-phase')),'The delayed account operation is still pending on reopen');await held.release();
   await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
   check(await dialog.getAttribute('data-palette')==='midnight','A delayed read does not replace the retained local edit');
   await dialog.getByRole('radio',{name:'Rose silk',exact:true}).click();
   check(await dialog.locator('[data-wear]').isEnabled(),'Reopening during a delayed read refreshes selection after the old read settles');
   await dialog.locator('.cs-preview[data-ready=true]').waitFor();
   await page.screenshot({path:'output/playwright/character-studio-deferred-read-ready.png'});
   await dialog.locator('[data-wear]').click();await waitWear('rose');
   check((await account()).character.published.revision===1,'Rewear after a delayed read reuses the published look');
  }
  await page.screenshot({path:'output/playwright/character-studio-saved.png'});
  await dialog.locator('[data-close]').click();await framePeer();await peer.screenshot({path:'output/playwright/character-studio-peer-rose.png'});
  await page.waitForTimeout(2200); // The authoritative appearance cooldown remains in effect.
  await page.locator('input[name=player-character][value=rowan]').check();await ready(page);
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerAppearance==='rowan-human');
  await open();
  check(await dialog.getAttribute('data-palette')==='rose','Reopening after a legacy character change retains the saved local look');
  check(await dialog.locator('[data-wear]').isEnabled(),'Reopening refreshes the worn selection so the retained look can be worn again');
  check(!(await dialog.locator('[data-account-status]').textContent()).includes('You are wearing'),'Reopening does not falsely report the retained look as currently worn');
  await dialog.locator('.cs-preview[data-ready=true]').waitFor();
  await page.screenshot({path:'output/playwright/character-studio-reopen-ready.png'});
  await dialog.locator('[data-wear]').click();await waitWear('rose');
  check((await account()).character.published.revision===1,'Wearing the retained look again reuses its immutable publication');
  await dialog.locator('[data-close]').click();

  await page.reload();await ready(page);await open();check(await dialog.getAttribute('data-palette')==='rose','Reconnect opens the canonical equipped customization');
  await dialog.getByRole('radio',{name:'Midnight',exact:true}).click();await dialog.locator('[data-wear]').click();await waitWear('midnight');
  check((await account()).character.published.revision===2,'Editing and wearing appends an immutable revision');
  await dialog.locator('[data-close]').click();await framePeer();await peer.screenshot({path:'output/playwright/character-studio-peer-midnight.png'});
  const canonical=(await account()).selection.character,connectionsBeforeFaults=peerConnections;
  const authoredMaterials=JSON.stringify(authoredBaseline);
  const revisionFaults=[
   ['missing',player=>{delete player.character;}],
   ['unpublished',player=>{player.character.revision=0;}],
   ['stale-catalog',player=>{player.character.provenance.catalog='retired-catalog';}],
   ['corrupt-asset',player=>{player.character.assets[0].sha256='0'.repeat(64);}],
   ['foreign-owner',player=>{player.character.ownerId='bob';}],
   ['unsupported-palette',player=>{player.character.palette='removed-color';}],
   ['mismatched-appearance',player=>{player.character=structuredClone(alternate);}],
  ];
  for(const [name,mutate]of revisionFaults){
   peerFaultSnapshots=0;peerFault=mutate;
   await peer.waitForFunction(()=>{
    const view=window.__riverMultiplayer(),remote=view.remotes.find(p=>p.id==='alice');
    return view.connected&&remote?.ready&&!remote.fallback&&remote.appearance==='sable-human'&&remote.character?.revision===0&&remote.character.palette==='authored'&&remote.character.hair==='authored';
   });
   check(peerFaultSnapshots>0,`${name}: fault reached the actual peer snapshot transport`);
   const fallback=await peer.evaluate(()=>window.__riverMultiplayer().remotes.find(p=>p.id==='alice'));
   const outfit=fallback.materials.filter(m=>m.slot==='outfit');
   check(outfit.length>0&&outfit.some(m=>m.color!=='353044'),`${name}: actual outfit materials restore authored colors`);
   const materials=JSON.stringify(fallback.materials);
   check(materials===authoredMaterials,`${name}: fallback restores consistent authored outfit and hair`);
   if(name==='corrupt-asset'){await framePeer();await peer.screenshot({path:'output/playwright/character-studio-peer-invalid-revision.png'});}
   check(JSON.stringify((await account()).selection.character)===JSON.stringify(canonical),`${name}: peer delivery fault cannot mutate the authoritative selection`);
   peerFault=null;
   await peer.waitForFunction(expected=>{
    const remote=window.__riverMultiplayer().remotes.find(p=>p.id==='alice');
    return remote?.ready&&JSON.stringify(remote.character)===JSON.stringify(expected);
   },canonical);
   await rendered(peer,'midnight',true);
   check(peerConnections===connectionsBeforeFaults,`${name}: canonical revision recovers on the existing connection`);
  }
  await framePeer();await peer.screenshot({path:'output/playwright/character-studio-peer-revision-recovered.png'});await open();
  // Apply then lose the private-save HTTP response. Retry must recover its receipt.
  let lost=false;await page.route('**/api/character/draft?*',async route=>{
   if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();
  });
  await dialog.getByRole('radio',{name:'Lagoon',exact:true}).click();await dialog.locator('[data-save]').click();
  await dialog.locator('[data-retry]').waitFor({state:'visible'});const afterLost=(await account()).character.version;
  await dialog.locator('[data-close]').click();
  await page.getByRole('button',{name:'Open character studio',exact:true}).click();
  check(await dialog.getAttribute('data-palette')==='lagoon'&&await dialog.locator('[data-retry]').isVisible(),'Reopening an uncertain save retains the local edit and retry action');
  check(await dialog.locator('[data-cancel]').isDisabled(),'Reopening cannot discard an uncertain save');
  await dialog.locator('[data-retry]').click();await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
  check((await account()).character.version===afterLost,'A lost save response retries without duplicating the mutation');await page.unroute('**/api/character/draft?*');
  // A second authenticated editor changes the draft; the visible local edit stays.
  await page.evaluate(async()=>{
   const session=await fetch('/auth/session').then(r=>r.json()),current=await fetch('/api/character').then(r=>r.json());
   const definition={...current.character.draft,palette:'botanical'};
   const result=await fetch('/api/character/draft',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({definition,expectedVersion:current.character.version,requestId:crypto.randomUUID()})});
   if(!result.ok)throw new Error('Concurrent fixture save failed');
  });
  await dialog.getByRole('radio',{name:'Rose silk',exact:true}).click();await dialog.locator('[data-save]').click();
  await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='conflict');
  check(await dialog.getAttribute('data-palette')==='rose','Concurrent save conflict retains the visible local edit');
  check((await account()).character.draft.palette==='botanical','Conflict preserves the other editor’s saved draft');
  await dialog.locator('[data-refresh]').click();await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
  check(await dialog.getAttribute('data-palette')==='rose','Checking the account does not discard local edits');
  await dialog.locator('[data-load-draft]').click();check(await dialog.getAttribute('data-palette')==='botanical','Loading the saved draft is an explicit choice');
  await dialog.locator('[data-character=rowan]').click();
  await page.evaluate(()=>{const dialog=document.querySelector('.character-studio');window.__studioClosedDuringWear=false;const observer=new MutationObserver(()=>{if(!dialog.open)window.__studioClosedDuringWear=true;});observer.observe(dialog,{attributes:true,attributeFilter:['open']});window.__studioWearObserver=observer;});
  await dialog.locator('[data-wear]').click();await waitWear('authored');await ready(page);
  check(await dialog.isVisible()&&!await page.evaluate(()=>window.__studioClosedDuringWear),'Wearing a different base keeps Studio open through local avatar replacement');
  await page.evaluate(()=>window.__studioWearObserver.disconnect());
  // A fresh peer has no previous Rowan rig to keep when the initial asset fails.
  let blockedAssets=0;
  await peer.route('**/assets/characters/man-tailored.glb',route=>{blockedAssets++;return route.abort('failed');});
  await peer.reload();await ready(peer);
  await peer.waitForFunction(()=>window.__riverMultiplayer().remotes.some(p=>p.id==='alice'&&p.fallback&&!p.ready));
  check(blockedAssets>0,'The peer fixture actually refused the selected rig asset');
  await framePeer();await peer.screenshot({path:'output/playwright/character-studio-peer-fallback.png'});
  await peer.unroute('**/assets/characters/man-tailored.glb');
  await peer.waitForFunction(()=>{const view=window.__riverMultiplayer(),selected=view.snapshot.players.find(p=>p.id==='alice');return view.remotes.some(p=>p.id==='alice'&&p.ready&&!p.fallback&&p.character?.revision===selected.character.revision&&p.appearance===selected.appearance);});
  check(true,'A first-load asset failure recovers the canonical peer revision without reconnecting');
  await framePeer();await peer.screenshot({path:'output/playwright/character-studio-peer-recovered.png'});
  check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);
  return {passed:true,checks,scope:'Real two-account HTTP/WebSocket/browser flow; automated rendering only, no human accessibility or physical device acceptance'};
 }finally{for(const held of heldResponses)await held.release().catch(()=>{});await peerContext.close();}
}
