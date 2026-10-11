async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks = [], routes = [], errors = [], origin = 'http://127.0.0.1:5173';
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/?motion-debug=1`);
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption({ label: 'Hermès' }); await page.locator('#visit-destination').click();
  await page.waitForFunction(() => document.querySelector('#walking-hud').dataset.primaryAction === 'enter');
  await page.locator('#panel-toggle').click();
  if (await page.locator('.visit-tools').evaluate(node => node.open)) await page.locator('.visit-tools-toggle').click();
  await page.locator('#canvas-host').focus();
  for (const name of ['Dior', 'Equinox', 'Hermès']) {
    const path = await page.evaluate(async name => {
      const { createResidentNavigation } = await import('/src/navigation.js');
      const world = await (await fetch('/data/district.json')).json(), pose = window.__riverCarriage().pose;
      return createResidentNavigation(world).route([pose.position[0], -pose.position[2]], world.stores.find(store => store.name === name).visit);
    }, name);
    check(path?.length, `${name}: a pedestrian route exists`);
    const started = Date.now(), samples = []; let held = [];
    try {
      for (const target of path) {
        const leg = Date.now();
        while (true) {
          const pose = await page.evaluate(() => window.__riverCarriage().pose);
          const dx = target[0] - pose.position[0], dz = -target[1] - pose.position[2];
          samples.push({ ms: Date.now() - started, position: pose.position });
          if (Math.hypot(dx, dz) < 0.15) {
            for (const key of held) await page.keyboard.up(key);
            held = []; break;
          }
          if (Date.now() - leg > 180000) throw new Error(`${name}: stalled at ${JSON.stringify({ target, pose })}`);
          const desired = Math.atan2(-dx, -dz), difference = Math.atan2(Math.sin(desired - pose.yaw), Math.cos(desired - pose.yaw));
          if (Math.abs(difference) > 0.03) {
            for (const key of held) await page.keyboard.up(key);
            held = [];
            const rect = await page.locator('#canvas-host').boundingBox(), x = rect.x + rect.width / 2, y = rect.y + rect.height * 0.4;
            const drag = Math.max(-rect.width * 0.35, Math.min(rect.width * 0.35, -difference / 0.003));
            await page.mouse.move(x, y); await page.mouse.down();
            await page.mouse.move(x + drag, y, { steps: 3 }); await page.mouse.up();
            continue;
          }
          // Playwright does not generate the OS repeat events of a held key.
          // Repeat normal input so a focus/authoritative correction cannot leave
          // the driver's held-key bookkeeping ahead of the game's input state.
          await page.locator('#canvas-host').focus();
          await page.keyboard.down('KeyW'); held = ['KeyW'];
          await page.waitForTimeout(50);
          if (Math.hypot(dx, dz) < 1) { await page.keyboard.up('KeyW'); held = []; }
        }
      }
    } finally { for (const key of held) await page.keyboard.up(key); }
    const end = await page.evaluate(() => {
      const town = window.__riverMultiplayer();
      return { pose: window.__riverCarriage().pose, server: town.snapshot.players.find(player => player.id === town.selfId) };
    });
    const target = path.at(-1);
    check(Math.hypot(end.pose.position[0] - target[0], end.pose.position[2] + target[1]) < 0.4, `${name}: normal keyboard walking reaches the storefront`);
    check(Math.hypot(end.pose.position[0] - end.server.position[0], end.pose.position[2] + end.server.position[1]) < 0.5, `${name}: server position agrees with the walker`);
    const length = samples.slice(1).reduce((sum, sample, i) => sum + Math.hypot(sample.position[0] - samples[i].position[0], sample.position[2] - samples[i].position[2]), 0);
    routes.push({ name, path, seconds: (Date.now() - started) / 1000, length, samples, end });
    console.log(`Spatial street reached ${name}: ${length.toFixed(1)} m in ${routes.at(-1).seconds.toFixed(1)} s`);
    await page.screenshot({ path: `output/playwright/spatial-street-${routes.length}.png` });
  }
  check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);
  return { checks, routes, errors, scope: 'Hermès to Dior to Equinox and back to Hermès, normal keyboard walking; one fixture identity, no live auth' };
}
