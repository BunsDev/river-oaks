async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined');
  const selfId = await page.evaluate(() => window.__riverMultiplayer().selfId);
  const peerContext = await page.context().browser().newContext();
  await peerContext.addCookies([{ name: 'fixture_session', value: 'bob', url: new URL(page.url()).origin }]);
  const peer = await peerContext.newPage();
  peer.on('pageerror', error => errors.push(error.message));
  const peerStart = performance.now();
  await peer.goto(page.url());
  try {
    await peer.waitForFunction(() => window.__riverMultiplayer?.().connected, null, { timeout: 90000 });
  } catch (error) {
    const diagnostic = await peer.evaluate(() => ({
      connected: window.__riverMultiplayer?.().connected,
      selfId: window.__riverMultiplayer?.().selfId,
      worldId: window.__riverMultiplayer?.().snapshot?.worldId,
      status: document.querySelector('#multiplayer-status')?.textContent,
      ready: document.querySelector('#canvas-host')?.dataset.playerReady,
      loading: document.querySelector('#loading')?.textContent,
    }));
    throw new Error(`Gallery peer did not connect: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  const peerReadyMs = performance.now() - peerStart;
  const peerSeesLevel = levelId => peer.waitForFunction(({ selfId, levelId }) =>
    window.__riverMultiplayer().snapshot.players.find(item => item.id === selfId)?.levelId === levelId,
  { selfId, levelId });
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption({ label: 'Laura Rathe Fine Art' });
  await page.locator('#visit-destination').click();
  await page.waitForFunction(() => window.__riverGeneratedInteriors?.().length === 2
    && window.__riverGeneratedInteriors()[0].ready && !window.__riverGeneratedInteriors()[1].ready
    && window.__riverGeneratedInteriors()[1].shellVisible);
  await page.waitForTimeout(1500);
  await page.locator('#enter-destination').click();
  await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside);
  await page.waitForFunction(() => window.__riverGeneratedInteriors?.()[1]?.ready);
  if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  if (await page.locator('.visit-tools[open] > .visit-tools-toggle').count()) await page.locator('.visit-tools[open] > .visit-tools-toggle').click();
  await page.locator('#canvas-host').focus();
  const stair = await page.evaluate(async () => {
    const plan = await fetch('/data/building-interiors/river-oaks-gallery-v2.json').then(response => response.json());
    const up = plan.levels[0].portals.find(portal => portal.kind === 'stairs');
    return { position: up.position, upperId: plan.levels[1].id, groundId: plan.levels[0].id };
  });
  await peerSeesLevel(stair.groundId);
  const move = async target => {
    let held = false, last = null;
    try {
      for (let step = 0; step < 360; step++) {
        if (await page.locator('.store-intro').isVisible()) {
          if (held) { await page.keyboard.up('KeyW'); held = false; }
          await page.locator('.store-intro button').click();
          await page.locator('#canvas-host').focus();
        }
        const pose = await page.evaluate(() => window.__riverCarriage().pose);
        last = pose;
        const dx = target[0] - pose.position[0], dz = -target[1] - pose.position[2];
        if (Math.hypot(dx, dz) < 0.85 && pose.speed < 0.12) return pose;
        const desiredYaw = Math.atan2(-dx, -dz);
        const angle = Math.atan2(Math.sin(desiredYaw - pose.yaw), Math.cos(desiredYaw - pose.yaw));
        if (Math.abs(angle) > 0.04) {
          if (held) { await page.keyboard.up('KeyW'); held = false; }
          const drag = Math.max(-100, Math.min(100, -angle / 0.003));
          await page.mouse.move(600, 300); await page.mouse.down();
          await page.mouse.move(606, 300); await page.mouse.move(600 + drag, 300); await page.mouse.up();
          await page.locator('#canvas-host').focus();
        } else if (!held || step % 12 === 0 && pose.speed < 0.05) {
          if (held) await page.keyboard.up('KeyW');
          await page.keyboard.down('KeyW'); held = true;
        }
        await page.waitForTimeout(35);
      }
      const diagnostics = await page.evaluate(() => {
        const multiplayer = window.__riverMultiplayer();
        return { authoritative: multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId),
          notice: document.querySelector('#walking-notice')?.textContent,
          dialogueOpen: !document.querySelector('#community-dialogue')?.hidden,
          focused: document.activeElement?.id };
      });
      throw new Error(`Walking could not reach gallery stair ${JSON.stringify(target)}; last=${JSON.stringify(last)}; diagnostics=${JSON.stringify(diagnostics)}`);
    } finally { if (held) await page.keyboard.up('KeyW'); }
  };
  await move(stair.position);
  await page.waitForFunction(() => document.querySelector('#walking-enter')?.textContent?.includes('Go up one level'));
  await page.screenshot({ path: 'output/playwright/generated-gallery-level-0-route.png' });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(upperId => {
    const multiplayer = window.__riverMultiplayer();
    return multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId)?.levelId === upperId;
  }, stair.upperId);
  const upstairs = await page.evaluate(() => {
    const multiplayer = window.__riverMultiplayer();
    return multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId);
  });
  if (upstairs.altitude !== 0 || upstairs.position[2] < 22) throw new Error(`Invalid upper-floor pose: ${JSON.stringify(upstairs)}`);
  await peerSeesLevel(stair.upperId);
  await page.screenshot({ path: 'output/playwright/generated-gallery-level-1.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reloadStarted = performance.now();
  await page.reload();
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined');
  try {
    await page.waitForFunction(upperId => {
      const multiplayer = window.__riverMultiplayer();
      return multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId)?.levelId === upperId
        && window.__riverCarriage().pose?.levelId === upperId;
    }, stair.upperId, { timeout: 60000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const multiplayer = window.__riverMultiplayer();
      return { connected: multiplayer.connected, selfId: multiplayer.selfId,
        player: multiplayer.snapshot?.players.find(item => item.id === multiplayer.selfId),
        pose: window.__riverCarriage().pose,
        status: document.querySelector('#multiplayer-status')?.textContent,
        ready: document.querySelector('#canvas-host')?.dataset.playerReady };
    });
    throw new Error(`Upper-level reload did not recover after ${Math.round(performance.now() - reloadStarted)}ms: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  await peerSeesLevel(stair.upperId);
  await page.waitForFunction(() => document.querySelector('#walking-enter')?.textContent?.includes('Go down to ground floor'));
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(groundId => {
    const multiplayer = window.__riverMultiplayer();
    return multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId)?.levelId === groundId;
  }, stair.groundId);
  await peerSeesLevel(stair.groundId);
  await peerContext.close();
  if (errors.length) throw new Error(errors.join('; '));
  return { passed: true, upperId: stair.upperId, groundId: stair.groundId, peerReadyMs,
    scope: 'Two local authenticated clients agree on keyboard ascent, descent, reconnect and reduced motion.' };
}
