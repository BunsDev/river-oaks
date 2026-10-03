async page => {
  const origin='http://127.0.0.1:5180',ownerId='user_01M40Y914S1H4EJCEHH91DKTAY';
  const ready=async tab=>tab.waitForFunction(()=>window.__riverMultiplayer?.().snapshot?.players?.length
    && document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:60000});
  await page.context().addCookies([{name:'fixture_session',value:'guest',url:origin}]);
  await page.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await ready(page);
  const guest=await page.evaluate(()=>({appearance:window.__riverMultiplayer().snapshot.players.find(player=>player.id==='guest')?.appearance,
    jevicaHidden:document.querySelector('[name=player-character][value=jevica]')?.closest('label')?.hidden,
    garageHidden:document.querySelector('.vehicle-garage')?.hidden,
    companionHidden:document.querySelector('#player-companion')?.hidden,
    carVisible:window.__riverCarriage().visible,
    jevVisible:window.__riverCarriage().princeVisible}));
  if(guest.appearance!=='sable-human'||!guest.jevicaHidden||!guest.garageHidden||!guest.companionHidden||guest.carVisible||guest.jevVisible)
    throw new Error(`Guest could access Jevica or her crew: ${JSON.stringify(guest)}`);
  await page.close();
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
    await owner.locator('.player-settings summary').click();
    await owner.locator('#player-ride').click();
    await owner.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true');
    await owner.keyboard.down('w');
    await owner.waitForFunction(ownerId=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===ownerId)?.vehicle==='rolls',ownerId);
    await owner.keyboard.up('w');
    if(!await owner.evaluate(()=>window.__riverCarriage().riding))throw new Error('Owner lost the ride after the shared town accepted its pose');
    return {passed:true,guest,privileged};
  } finally {await context.close();}
}
