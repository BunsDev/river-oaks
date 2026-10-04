async page => {
  const origin='http://127.0.0.1:5180',ownerId='user_01M40Y914S1H4EJCEHH91DKTAY';
  const ready=async tab=>tab.waitForFunction(()=>window.__riverMultiplayer?.().snapshot?.players?.length
    && document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:60000});
  await page.context().addCookies([{name:'fixture_session',value:'guest',url:origin}]);
  await page.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await ready(page);
  const guest=await page.evaluate(()=>({appearance:window.__riverMultiplayer().snapshot.players.find(player=>player.id==='guest')?.appearance,
    jevicaHidden:document.querySelector('[name=player-character][value=jevica]')?.closest('label')?.hidden,
    flightHidden:document.querySelector('#player-flight')?.hidden,
    garageHidden:document.querySelector('.vehicle-garage')?.hidden,
    companionHidden:document.querySelector('#player-companion')?.hidden,
    carVisible:window.__riverCarriage().visible,
    jevVisible:window.__riverCarriage().princeVisible}));
  if(guest.appearance!=='sable-human'||!guest.jevicaHidden||!guest.flightHidden||!guest.garageHidden||!guest.companionHidden||guest.carVisible||guest.jevVisible)
    throw new Error(`Guest could access Jevica or her crew: ${JSON.stringify(guest)}`);
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyB');
  if(await page.evaluate(()=>document.querySelector('#walking-hud').dataset.flying==='true'))throw new Error('Guest took flight with B');
  await page.locator('input[name=player-form][value=beast]').check();
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerAppearance==='woman-casual');
  await page.locator('#player-beast-movement').click();
  await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.find(player=>player.id==='guest')?.movement==='beast');
  if(await page.locator('#walking-movement').isHidden())await page.locator('#walking-controls-toggle').click();
  if(!await page.locator('#walking-sprint').isVisible())throw new Error('Guest beast has no touch sprint control');
  const context=await page.context().browser().newContext();
  try {
    await context.addCookies([{name:'fixture_session',value:'owner',url:origin}]);
    const owner=await context.newPage();
    await owner.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await ready(owner);
    await owner.waitForFunction(()=>document.querySelector('#canvas-host').dataset.carriageDriverReady==='true');
    const privileged=await owner.evaluate(ownerId=>({appearance:window.__riverMultiplayer().snapshot.players.find(player=>player.id===ownerId)?.appearance,
      jevicaVisible:!document.querySelector('[name=player-character][value=jevica]')?.closest('label')?.hidden,
      garageVisible:!document.querySelector('.vehicle-garage')?.hidden,
      companionVisible:!document.querySelector('#player-companion')?.hidden,
      carVisible:window.__riverCarriage().visible,
      jevVisible:window.__riverCarriage().princeVisible}),ownerId);
    if(privileged.appearance!=='jevica'||!privileged.jevicaVisible||!privileged.garageVisible
      ||!privileged.companionVisible||!privileged.carVisible||!privileged.jevVisible)
      throw new Error(`Owner is missing Jevica or her crew: ${JSON.stringify(privileged)}`);
    if(!await owner.locator('#player-flight').isVisible())throw new Error('Jevica flight control is hidden');
    await owner.locator('#player-flight').click();
    await owner.waitForFunction(ownerId=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===ownerId)?.altitude>.2,ownerId);
    await owner.locator('#player-flight').click();
    await owner.waitForFunction(ownerId=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===ownerId)?.altitude===0,ownerId);
    await owner.locator('.player-settings summary').click();
    await owner.locator('#player-ride').click();
    await owner.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true');
    await owner.keyboard.down('w');
    await owner.waitForFunction(ownerId=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===ownerId)?.vehicle==='rolls',ownerId);
    await owner.keyboard.up('w');
    if(!await owner.evaluate(()=>window.__riverCarriage().riding))throw new Error('Owner lost the ride after the shared town accepted its pose');
    await page.waitForFunction(ownerId=>window.__riverMultiplayer().remotes?.some(player=>player.id===ownerId&&player.vehicle==='rolls'&&player.roadVisible&&player.riderSeated),ownerId,{timeout:5000});
    await page.screenshot({path:'output/playwright/shared-ride-peer.png'});
    return {passed:true,guest,privileged};
  } finally {await context.close();await page.close();}
}
