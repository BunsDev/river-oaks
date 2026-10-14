async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const origin = 'http://127.0.0.1:5173', worldId = 'studio-published', errors = [], checks = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  // Issue the harness's normal loopback identity before visiting the gated editor.
  await page.request.get(`${origin}/auth/session`);
  await page.goto(`${origin}/studio.html`);
  await page.waitForSelector('body[data-studio-ready="true"]');
  await page.getByRole('button', { name: 'Add building', exact: true }).click();
  await page.getByLabel('Height (m)', { exact: true }).fill('9');
  await page.getByLabel('Height (m)', { exact: true }).press('Tab');
  const panel = page.getByRole('region', { name: 'Generated interior' });
  await panel.getByRole('button', { name: 'Preview level 0' }).click();
  await panel.getByRole('button', { name: 'Apply preview' }).click();
  await panel.getByRole('button', { name: 'Preview add level' }).click();
  await panel.getByRole('button', { name: 'Apply preview' }).click();
  await panel.getByRole('button', { name: 'View level 0' }).click();
  const v = Number(await panel.getByLabel('Display local V (m)').inputValue());
  await panel.getByLabel('Display local V (m)').fill(String(v + 1.5));
  await panel.getByLabel('Display finish', { exact: true }).selectOption('oak');
  await panel.getByLabel('Floor finish', { exact: true }).selectOption('concrete');
  await panel.getByRole('button', { name: 'Preview furnishing and finishes' }).click();
  await panel.getByRole('button', { name: 'Apply preview' }).click();
  await panel.getByRole('button', { name: 'View level 1' }).click();
  await panel.getByRole('button', { name: 'Preview regenerate untouched level' }).click();
  await panel.getByRole('button', { name: 'Apply preview' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const chunks = []; for await (const chunk of await (await download).createReadStream()) chunks.push(chunk);
  const exported = Buffer.concat(chunks), region = JSON.parse(exported.toString());
  const expected = await page.evaluate(async ({ region, worldId }) => {
    const { previewBuildingInteriorPlan } = await import('/src/studio/interior-plan.js');
    return previewBuildingInteriorPlan(region, region.buildings[0].id, worldId);
  }, { region, worldId });
  check(expected.levels[0].layers.authoredOverrides.length >= 1, 'Studio export includes stable authored furnishing slots');

  await page.goto(`${origin}/?motion-debug=1`);
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  await page.locator('.world-portal-form input[name=title]').fill('Studio Gallery');
  await page.locator('.world-portal-form input[name=id]').fill(worldId);
  await page.locator('.world-portal-form input[name=region]').setInputFiles({ name: 'studio-region.json', mimeType: 'application/json', buffer: exported });
  await page.locator('.world-portal-form button[type=submit]').click();
  const published = page.locator('.world-portal-list a').filter({ hasText: 'Studio Gallery' });
  await published.waitFor({ state: 'visible' });
  const url = new URL(await published.getAttribute('href'), origin); url.searchParams.set('motion-debug', '1');
  const data = await (await page.request.get(`${origin}/api/world-data?world=${worldId}`)).json();
  const { approvedSha256, ...plan } = data.world.buildingInteriors[0];
  check(JSON.stringify(plan) === JSON.stringify(expected), 'Published authority compiles the exported overrides and level seed exactly');
  check(/^[a-f0-9]{64}$/.test(approvedSha256), 'Published plan carries its approval digest');
  const [ground, upper] = plan.levels, portal = ground.portals.find(item => item.toLevelId === upper.id);
  const store = data.world.stores.find(item => item.building_id === plan.buildingId);
  await page.goto(url.href);
  await page.waitForFunction(id => window.__riverMultiplayer?.().connected && window.__riverMultiplayer().snapshot.worldId === id
    && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', worldId);
  const ownerId = await page.evaluate(() => window.__riverMultiplayer().selfId);
  const context = await page.context().browser().newContext(), peer = await context.newPage();
  peer.on('pageerror', error => errors.push(error.message));
  try {
    await peer.goto(url.href);
    await peer.waitForFunction(id => window.__riverMultiplayer?.().connected && window.__riverMultiplayer().snapshot.worldId === id
      && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', worldId);
    const peerData = await (await peer.request.get(`${origin}/api/world-data?world=${worldId}`)).json();
    check(peerData.world.buildingInteriors[0].approvedSha256 === approvedSha256, 'Both clients load the same approved plan');
    const denied = await peer.evaluate(async region => {
      const session = await (await fetch('/auth/session')).json();
      return (await fetch('/api/worlds', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: JSON.stringify({ id: 'guest-generated', title: 'Guest attempt', description: '', region }) })).status;
    }, region);
    check(denied === 403, 'A guest cannot publish a generated region');
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption(store.id);
    await page.locator('#visit-destination').click();
    await page.waitForTimeout(1200);
    await page.locator('#enter-destination').click();
    const waitLevel = (tab, levelId) => tab.waitForFunction(({ ownerId, levelId }) =>
      window.__riverMultiplayer().snapshot.players.find(item => item.id === ownerId)?.levelId === levelId, { ownerId, levelId });
    await waitLevel(page, ground.id); await waitLevel(peer, ground.id);
    const entry = await page.evaluate(() => window.__riverMultiplayer().snapshot.players.find(item => item.id === window.__riverMultiplayer().selfId).position);
    if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
    if (await page.locator('.visit-tools[open] > .visit-tools-toggle').count()) await page.locator('.visit-tools[open] > .visit-tools-toggle').click();
    const move = async target => {
      let held = false, last;
      await page.locator('#canvas-host').focus();
      try {
        for (let step = 0; step < 360; step++) {
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
        throw new Error(`Creator route did not reach ${JSON.stringify(target)}: ${JSON.stringify(last)}`);
      } finally { if (held) await page.keyboard.up('KeyW'); }
    };
    await move(portal.position);
    await page.waitForFunction(() => document.querySelector('#walking-enter')?.textContent.includes('Go up one level'));
    await page.keyboard.press('KeyF');
    await waitLevel(page, upper.id); await waitLevel(peer, upper.id);
    check(true, 'Keyboard traversal reaches the published upper floor and replicates to the second client');
    await page.screenshot({ path: 'output/playwright/creator-generated-level-1.png' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
    await waitLevel(page, upper.id); await waitLevel(peer, upper.id);
    await page.waitForFunction(levelId => window.__riverCarriage()?.pose?.levelId === levelId, upper.id);
    const restored = await page.evaluate(() => window.__riverCarriage().pose);
    check(restored.levelId === upper.id && Math.abs(restored.ground - upper.floorElevation) < 0.01,
      'Reconnect restores the upper controller floor rather than street elevation');
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyF');
    await waitLevel(page, ground.id); await waitLevel(peer, ground.id);
    await move(entry);
    await page.waitForFunction(() => document.querySelector('#walking-enter')?.textContent.includes('Step outside'));
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => !document.querySelector('#walking-hud')?.dataset.inside);
    check(true, 'The published route returns through ground level to the street');
    check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);
    return { passed: true, checks, approvedSha256, worldId, scope: 'Local Studio export, real publication UI and two authenticated development clients; no hosted or live identity acceptance.' };
  } finally { await context.close(); }
}
