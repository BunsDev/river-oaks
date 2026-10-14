async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const origin = 'http://127.0.0.1:5173';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
  const peerContext = await page.context().browser().newContext();
  await peerContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
  await peerContext.route('**/v1/**', route => route.fulfill({ status: 503, json: {} }));
  const peer = await peerContext.newPage();
  peer.on('pageerror', error => errors.push(error.message));
  const ready = p => p.waitForFunction(() => window.__riverMultiplayer?.().connected
    && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  const observed = (selfId, position) => peer.waitForFunction(({ selfId, position }) => {
    const player = window.__riverMultiplayer().snapshot.players.find(item => item.id === selfId);
    return player && Math.hypot(player.position[0] - position[0], player.position[1] - position[1]) < 0.25;
  }, { selfId, position });
  try {
    await page.goto(`${origin}/?motion-debug=1`); await ready(page);
    await peer.goto(`${origin}/?motion-debug=1`);
    await peer.waitForFunction(() => window.__riverMultiplayer?.().connected, null, { timeout: 60000 });
    const selfId = await page.evaluate(() => window.__riverMultiplayer().selfId);
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: 'Laura Rathe Fine Art' });
    await page.locator('#visit-destination').click();
    await page.waitForFunction(() => window.__riverGeneratedInteriors?.()[0]?.ready);
    await page.waitForTimeout(1500);
    await page.locator('#enter-destination').click();
    await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside);
    if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
    await page.locator('#canvas-host').focus();
    await page.keyboard.down('KeyW'); await page.waitForTimeout(1700); await page.keyboard.up('KeyW');
    await page.waitForTimeout(250);
    if (!await page.locator('#walking-hud').getAttribute('data-inside')) throw new Error('Player left the gallery while walking inward');
    const inside = await page.evaluate(() => {
      const multiplayer = window.__riverMultiplayer();
      const player = multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId);
      return { position: player.position, levelId: window.__riverGeneratedInteriors()[0].levelId };
    });
    await observed(selfId, inside.position);
    const peerInside = await peer.evaluate(async selfId => {
      const { attachDistrictGalleryPlan } = await import('/src/district-interior-contract.js');
      const { storeRoomsFor } = await import('/src/store-rooms.js');
      const [district, approved] = await Promise.all([
        fetch('/data/district.json').then(response => response.json()),
        fetch('/data/building-interiors/river-oaks-gallery-v1.json').then(response => response.json()),
      ]);
      const room = storeRoomsFor(attachDistrictGalleryPlan(district, approved)).find(item => item.name === 'Laura Rathe Fine Art');
      const player = window.__riverMultiplayer().snapshot.players.find(item => item.id === selfId);
      return { planId: room.planId, generatedId: room.generatedPlan?.id,
        position: player.position, local: room.toLocal(player.position[0], player.position[1]),
        contains: room.contains(player.position[0], player.position[1]),
        access: room.containsAccess(player.position[0], player.position[1]) };
    }, selfId);
    if (peerInside.generatedId !== peerInside.planId || !peerInside.contains) {
      throw new Error(`Peer did not see the player inside the approved gallery footprint: ${JSON.stringify(peerInside)}`);
    }
    if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => !document.querySelector('#walking-hud')?.dataset.inside);
    const outside = await page.evaluate(() => {
      const multiplayer = window.__riverMultiplayer();
      return multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId)?.position;
    });
    await observed(selfId, outside);
    if (errors.length) throw new Error(errors.join('; '));
    return { passed: true, levelId: inside.levelId, inside: inside.position, outside,
      scope: 'Two local authenticated clients observe authoritative gallery entry and exit.' };
  } finally { await peerContext.close(); }
}
