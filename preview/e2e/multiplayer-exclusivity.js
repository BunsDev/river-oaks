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
  // Every account has a garage (Val, 2026-10-29): the guest's holds only the shared rose motorcycle, which she drives
  // herself; Jevica, flight, Jev and his companionship stay the owner's.
  if(guest.appearance!=='sable-human'||!guest.jevicaHidden||!guest.flightHidden||guest.garageHidden||!guest.companionHidden||guest.jevVisible)
    throw new Error(`Guest could access Jevica or her crew: ${JSON.stringify(guest)}`);
  await page.locator('#play-tab-rides').click();
  const garage=await page.evaluate(()=>({options:[...document.querySelectorAll('#player-vehicle option')].map(option=>option.value),
    call:document.querySelector('#player-carriage [data-call-label]')?.textContent,ride:document.querySelector('#player-ride [data-ride-label]')?.textContent,
    smartDriveHidden:document.querySelector('#player-chauffeur')?.hidden}));
  if(garage.options.join()!=='motorcycle'||garage.call!=='Call your ride'||garage.ride!=='Ride'||!garage.smartDriveHidden)
    throw new Error(`Guest garage is not the self-driven motorcycle alone: ${JSON.stringify(garage)}`);
  // The shared fixture town keeps each identity's position, and indoor-npcs leaves the guest inside a shop, where
  // calling a ride is refused. Another non-owner, 'unnamed', first arrives outdoors here to ride the motorcycle.
  const riderContext=await page.context().browser().newContext();
  let guestRide;
  try {
    await riderContext.addCookies([{name:'fixture_session',value:'unnamed',url:origin}]);
    const rider=await riderContext.newPage();
    await rider.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await ready(rider);
    const riderId=await rider.evaluate(()=>window.__riverMultiplayer().selfId);
    await rider.locator('#play-tab-rides').click();
    // A self-driven ride is not parked beside a new arrival (it would stand in their path); it comes when called.
    if(await rider.evaluate(()=>document.querySelector('#canvas-host').dataset.carriageReady==='true'||window.__riverCarriage().visible))
      throw new Error('A resident\'s motorcycle was parked before they called it');
    await rider.locator('#player-carriage').click();
    await rider.waitForFunction(()=>document.querySelector('#canvas-host').dataset.carriageReady==='true');
    await rider.locator('#player-ride').click();
    await rider.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true'&&document.querySelector('#canvas-host').dataset.driving==='true');
    await rider.locator('#canvas-host').focus();await rider.keyboard.down('w');
    await rider.waitForFunction(id=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===id)?.vehicle==='motorcycle',riderId,{timeout:20000});
    await rider.keyboard.up('w');
    guestRide=await rider.evaluate(()=>({jev:window.__riverCarriage().princeVisible,kind:window.__riverCarriage().vehicle,driver:window.__riverCarriage().pose?.riding?.driver,
      title:document.querySelector('.walking-title strong')?.textContent,smartDriveHidden:document.querySelector('#player-chauffeur')?.hidden,padShown:!document.querySelector('.player-drive-pad')?.hidden}));
    if(guestRide.jev||guestRide.kind!=='motorcycle'||!guestRide.driver||guestRide.title!=='Riding'||!guestRide.smartDriveHidden||!guestRide.padShown)
      throw new Error(`A resident is not driving the motorcycle herself: ${JSON.stringify(guestRide)}`);
    await rider.screenshot({path:'output/playwright/shared-ride-guest-motorcycle.png'});
    await rider.locator('#player-ride').click();
    await rider.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='false');
  } finally {await riderContext.close();}
  await page.locator('#play-tab-character').click();
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyB');
  if(await page.evaluate(()=>document.querySelector('#walking-hud').dataset.flying==='true'))throw new Error('Guest took flight with B');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerAppearance==='sable-human');
  if(await page.locator('#walking-movement').isHidden())await page.locator('#walking-controls-toggle').click();
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
    await owner.locator('#play-tab-rides').click();
    await owner.locator('#player-ride').click();
    await owner.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true');
    await owner.keyboard.down('w');
    await owner.waitForFunction(ownerId=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===ownerId)?.vehicle==='rolls',ownerId);
    await owner.keyboard.up('w');
    if(!await owner.evaluate(()=>window.__riverCarriage().riding))throw new Error('Owner lost the ride after the shared town accepted its pose');
    await page.waitForFunction(ownerId=>window.__riverMultiplayer().remotes?.some(player=>player.id===ownerId&&player.vehicle==='rolls'&&player.roadVisible&&player.riderSeated),ownerId,{timeout:5000});
    await page.screenshot({path:'output/playwright/shared-ride-peer.png'});
    return {passed:true,guest,garage,guestRide,privileged};
  } finally {await context.close();await page.close();}
}
