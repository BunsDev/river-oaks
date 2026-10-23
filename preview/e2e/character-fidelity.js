async page => {
 const origin='http://127.0.0.1:5180',checks=[],errors=[];
 const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
 const ready=p=>p.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host').dataset.playerReady==='true',null,{timeout:90000});
 page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});
 await page.context().addCookies([{name:'fixture_session',value:'alice',url:origin}]);
 await page.goto(origin+'/?motion-debug=1&render-audit=1');await ready(page);
 const peerContext=await page.context().browser().newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await peerContext.addCookies([{name:'fixture_session',value:'bob',url:origin}]);
 const peer=await peerContext.newPage();peer.setDefaultTimeout(90000);peer.on('pageerror',error=>errors.push(error.message));
 const open=async()=>{
  if(!await page.locator('.visit-tools').evaluate(node=>node.open))await page.locator('.visit-tools-toggle').click();
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.getByRole('button',{name:'Open character studio',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
 };
 try{
  await peer.goto(origin+'/?motion-debug=1&render-audit=1');await ready(peer);
  for(const [character,id,rig] of [['morgan','morgan-human','man-realistic-casual'],['imani','imani-human','woman-realistic-tailored']]){
   await open();const dialog=page.getByRole('dialog',{name:'Character studio'});
   await dialog.locator(`[data-character=${character}]`).click();
   await page.waitForFunction(id=>document.querySelector('.cs-preview')?.dataset.appearance===id&&document.querySelector('.cs-preview')?.dataset.ready==='true',id);
   check(await dialog.locator('[data-cs-colors]').isHidden(),`${id}: unsupported color controls stay unavailable`);
   await page.screenshot({path:`output/playwright/character-fidelity-${character}-studio.png`});
   await dialog.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
   await dialog.locator('[data-wear]').click();
   await page.waitForFunction(id=>document.querySelector('#canvas-host').dataset.playerAppearance===id&&document.querySelector('#canvas-host').dataset.playerReady==='true',id);
   await peer.waitForFunction(id=>window.__riverMultiplayer().remotes.some(player=>player.id==='alice'&&player.ready&&player.appearance===id&&player.character?.appearanceId===id),id);
   const saved=await page.evaluate(async rig=>{
    const {characterFidelityContract}=await import('/src/character-fidelity-contract.js');
    const response=await fetch('/api/character'),state=await response.json();
    return {status:response.status,rig:state.character.published.rig,sha:state.character.published.assets[0].sha256,pinned:characterFidelityContract(rig).asset.sha256};
   },rig);
   check(saved.status===200&&saved.rig===rig&&saved.sha===saved.pinned,`${id}: publication preserves the exact approved asset pin`);
   await page.reload();await ready(page);
   check(await page.locator('#canvas-host').getAttribute('data-player-appearance')===id,`${id}: selected identity survives reload`);
   await peer.evaluate(()=>{const player=window.__riverMultiplayer().snapshot.players.find(player=>player.id==='alice');const [x,z,y]=player.position;window.__riverRenderAudit.view({position:[x,y+1.4,-z+3.5],target:[x,y+.95,-z],fov:35});});
   await peer.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await peer.screenshot({path:`output/playwright/character-fidelity-${character}-world-peer.png`});
   check(true,`${id}: authoritative local and peer render paths loaded`);
  }
  check(errors.length===0,`No page errors: ${errors.join('; ')}`);
  return {passed:true,checks,scope:'Local Chromium fixture identities, Studio publication, shared peer and reload; not live auth, native, physical-device or human acceptance'};
 }finally{await peerContext.close();}
}
