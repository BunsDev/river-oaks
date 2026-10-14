async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const origin = 'http://127.0.0.1:5173', worldId = 'creator-four-levels';
  const errors = [], checks = [];
  const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));

  const region = await (await page.request.get(`${origin}/data/sample-region.json`)).json();
  region.buildings[0].size[2] = 20;
  region.buildings[0].interior = { name: 'Moon Gallery', category: 'art', entrance: 'south',
    generation: { version: 1, seed: 'moon-gallery-four', levels: 4 } };
  await page.goto(`${origin}/?motion-debug=1`);
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected
    && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  await page.locator('.world-portal-form input[name=title]').fill('Four Level Gallery');
  await page.locator('.world-portal-form input[name=id]').fill(worldId);
  await page.locator('.world-portal-form input[name=region]').setInputFiles({ name: 'four-level-region.json',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(region)) });
  await page.locator('.world-portal-form button[type=submit]').click();
  const published = page.locator('.world-portal-list a').filter({ hasText: 'Four Level Gallery' });
  await published.waitFor({ state: 'visible' });
  const url = new URL(await published.getAttribute('href'), origin); url.searchParams.set('motion-debug', '1');
  const data = await (await page.request.get(`${origin}/api/world-data?world=${worldId}`)).json();
  const plan = data.world.buildingInteriors[0], levels = plan.levels;
  check(levels.length === 4 && levels.every((level, index) => level.index === index),
    'The published server plan has four ordered levels');
  check(/^[a-f0-9]{64}$/.test(plan.approvedSha256), 'The published plan carries an approval digest');

  await page.goto(url.href);
  await page.waitForFunction(id => window.__riverMultiplayer?.().connected
    && window.__riverMultiplayer().snapshot.worldId === id
    && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', worldId);
  const ownerId = await page.evaluate(() => window.__riverMultiplayer().selfId);
  const peerContext = await page.context().browser().newContext(), peer = await peerContext.newPage();
  peer.on('pageerror', error => errors.push(error.message));
  try {
    await peer.goto(url.href);
    await peer.waitForFunction(id => window.__riverMultiplayer?.().connected
      && window.__riverMultiplayer().snapshot.worldId === id
      && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', worldId);
    const peerData = await (await peer.request.get(`${origin}/api/world-data?world=${worldId}`)).json();
    check(peerData.world.buildingInteriors[0].approvedSha256 === plan.approvedSha256,
      'Both clients load the same approved four-level plan');
    const waitLevel = (tab, levelId) => tab.waitForFunction(({ ownerId, levelId }) =>
      window.__riverMultiplayer().snapshot.players.find(item => item.id === ownerId)?.levelId === levelId,
    { ownerId, levelId });
    const self = () => page.evaluate(() => {
      const town = window.__riverMultiplayer();
      return town.snapshot.players.find(item => item.id === town.selfId);
    });
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption(data.world.stores[0].id);
    await page.locator('#visit-destination').click();
    await page.waitForTimeout(1200);
    await page.locator('#enter-destination').click();
    await waitLevel(page, levels[0].id); await waitLevel(peer, levels[0].id);
    if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
    if (await page.locator('.visit-tools[open] > .visit-tools-toggle').count()) await page.locator('.visit-tools[open] > .visit-tools-toggle').click();
    const entry = (await self()).position;
    const move = async target => {
      let held = false, last;
      await page.locator('#canvas-host').focus();
      try {
        for (let step = 0; step < 360; step++) {
          if (await page.locator('.store-intro').isVisible()) {
            if (held) { await page.keyboard.up('KeyW'); held = false; }
            await page.locator('.store-intro button').click();
            await page.locator('#canvas-host').focus();
          }
          last = await page.evaluate(() => window.__riverCarriage().pose);
          const dx = target[0] - last.position[0], dz = -target[1] - last.position[2];
          if (Math.hypot(dx, dz) < 0.8 && last.speed < 0.12) return;
          const desired = Math.atan2(-dx, -dz), angle = Math.atan2(Math.sin(desired - last.yaw), Math.cos(desired - last.yaw));
          if (Math.abs(angle) > 0.04) {
            if (held) { await page.keyboard.up('KeyW'); held = false; }
            const drag = Math.max(-100, Math.min(100, -angle / 0.003));
            await page.mouse.move(600, 300); await page.mouse.down();
            await page.mouse.move(606, 300); await page.mouse.move(600 + drag, 300); await page.mouse.up();
            await page.locator('#canvas-host').focus();
          } else if (!held || step % 12 === 0 && last.speed < 0.05) {
            if (held) await page.keyboard.up('KeyW');
            await page.keyboard.down('KeyW'); held = true;
          }
          await page.waitForTimeout(35);
        }
        throw new Error(`Four-level route did not reach ${JSON.stringify(target)}: ${JSON.stringify(last)}`);
      } finally { if (held) await page.keyboard.up('KeyW'); }
    };
    for (let index = 0; index < 3; index++) {
      const portal = levels[index].portals.find(item => item.toLevelId === levels[index + 1].id);
      await move(portal.position);
      await page.waitForFunction(() => document.querySelector('#walking-enter')?.textContent?.includes('Go up one level'));
      await page.keyboard.press('KeyF');
      await waitLevel(page, levels[index + 1].id); await waitLevel(peer, levels[index + 1].id);
      await page.waitForFunction(levelId => window.__riverCarriage()?.pose?.levelId === levelId, levels[index + 1].id);
      await page.waitForFunction(levelId => window.__riverGeneratedInteriors?.().some(item => item.levelId === levelId && item.ready),
        levels[index + 1].id);
      check((await self()).altitude === 0, `Level ${index + 1} is a floor, not flight altitude`);
      await page.screenshot({ path: `output/playwright/creator-four-level-${index + 1}.png` });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected
      && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
    await waitLevel(page, levels[3].id); await waitLevel(peer, levels[3].id);
    await page.waitForFunction(levelId => window.__riverCarriage()?.pose?.levelId === levelId, levels[3].id);
    check(Math.abs((await page.evaluate(() => window.__riverCarriage().pose.ground)) - levels[3].floorElevation) < 0.01,
      'Reduced-motion reload restores the top floor height');
    for (let index = 3; index > 0; index--) {
      const portal = levels[index].portals.find(item => item.toLevelId === levels[index - 1].id);
      await move(portal.position);
      const button = index === 3 ? '#walking-enter' : '#walking-descend';
      await page.waitForFunction(selector => {
        const action = document.querySelector(selector);
        return action && !action.hidden && action.textContent.includes('Go down');
      }, button);
      check((await page.locator(button).textContent()).includes('Go down'), `Level ${index} exposes descent`);
      await page.locator('#canvas-host').focus();
      await page.keyboard.press(index === 3 ? 'KeyF' : 'Shift+KeyF');
      await waitLevel(page, levels[index - 1].id); await waitLevel(peer, levels[index - 1].id);
    }
    await move(entry);
    await page.waitForFunction(() => document.querySelector('#walking-enter')?.textContent?.includes('Step outside'));
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => !document.querySelector('#walking-hud')?.dataset.inside);
    check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);
    return { passed: true, checks, levels: levels.map(level => level.id), approvedSha256: plan.approvedSha256,
      scope: 'Four-level publication and two local authenticated clients, keyboard traversal, stream readiness, reconnect and reduced motion; no hosted or human visual acceptance.' };
  } finally { await peerContext.close(); }
}
