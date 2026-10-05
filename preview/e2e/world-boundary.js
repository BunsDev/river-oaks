async page => {
  const origin='http://127.0.0.1:5173',checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/?world=garden-2&motion-debug=1`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true');
  const live=await page.evaluate(()=>{const m=window.__riverMultiplayer();return {worldId:m.snapshot.worldId,version:m.snapshot.protocolVersion,admin:m.snapshot.players.find(player=>player.id===m.selfId)?.canBuild};});
  check(live.worldId==='garden-2'&&live.version===2,'An alternate world joins with its own versioned snapshot');
  check(live.admin===true,'Jevica retains building permission in the alternate world');
  const otherContext=await page.context().browser().newContext();
  try {
    const other=await otherContext.newPage();other.setDefaultTimeout(60000);other.on('pageerror',error=>errors.push(error.message));
    await other.goto(`${origin}/?motion-debug=1`,{waitUntil:'commit'});
    await other.waitForFunction(()=>window.__riverMultiplayer?.().connected&&window.__riverMultiplayer?.().snapshot?.worldId==='river-oaks');
    check(true,'An unqualified link still joins the original River Oaks world');
    await other.goto(`${origin}/?world=unknown-world&motion-debug=1`,{waitUntil:'commit'});
    await other.waitForFunction(()=>document.querySelector('#multiplayer-status')?.textContent==='World not found.');
    check(!await other.evaluate(()=>window.__riverMultiplayer?.().connected),'An unknown world cannot join this server');
    check(await other.locator('.multiplayer-gate').isVisible(),'A missing world shows a clear connection gate');
  } finally {await otherContext.close();}
  check(errors.length===0,`No browser errors: ${errors.join('; ')}`);
  return {passed:true,checks,errors};
}
