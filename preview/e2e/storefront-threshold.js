async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const origin = 'http://127.0.0.1:5173', routes = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('**/v1/**', route => route.fulfill({ status: 503, json: {} }));
  const peerContext = await page.context().browser().newContext();
  await peerContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
  await peerContext.route('**/v1/**', route => route.fulfill({ status: 503, json: {} }));
  const peer = await peerContext.newPage();
  peer.on('pageerror', error => errors.push(error.message));
  const ready = p => p.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  const move = async target => {
    const samples = [], started = Date.now(); let held = [];
    try {
      while (Date.now() - started < 15000) {
        const pose = await page.evaluate(() => window.__riverCarriage().pose);
        samples.push({ ms: Date.now() - started, position: pose.position, yaw: pose.yaw, speed: pose.speed });
        const dx = target[0] - pose.position[0], dz = -target[1] - pose.position[2];
        if (Math.hypot(dx, dz) < 0.04 && pose.speed < 0.08) return samples;
        // Brake before the waypoint: the real controller retains walking inertia.
        // Coarse arrival tolerances exceed the jamb route's 5 cm side clearance.
        const distance = Math.hypot(dx, dz);
        const desiredYaw = Math.atan2(-dx, -dz);
        const angle = Math.atan2(Math.sin(desiredYaw - pose.yaw), Math.cos(desiredYaw - pose.yaw));
        if (distance > 0.04 && Math.abs(angle) > 0.012) {
          for (const key of held) await page.keyboard.up(key);
          held = [];
          // Use the actual drag-to-look input, then walk along the route rather
          // than approximate a rotated doorway with eight keyboard directions.
          const drag = Math.max(-100, Math.min(100, -angle / 0.003));
          await page.mouse.move(600, 300); await page.mouse.down();
          // Activate the existing >5 px gesture dead zone before fine aiming.
          await page.mouse.move(606, 300);
          await page.mouse.move(600 + drag, 300); await page.mouse.up();
          await page.locator('#canvas-host').focus();
          continue;
        }
        const projectedVelocity = (pose.velocity[0] * dx + pose.velocity[1] * dz) / Math.max(distance, 0.001);
        const keys = [];
        if (distance - projectedVelocity * 0.14 > 0.025) keys.push('KeyW');
        for (const key of held) if (!keys.includes(key)) await page.keyboard.up(key);
        for (const key of keys) if (!held.includes(key)) await page.keyboard.down(key);
        held = keys; await page.waitForTimeout(25);
      }
      throw new Error(`Walking did not reach ${JSON.stringify(target)}; last samples ${JSON.stringify(samples.slice(-3))}`);
    } finally { for (const key of held) await page.keyboard.up(key); }
  };
  try {
    await page.goto(`${origin}/?motion-debug=1`); await ready(page);
    await peer.goto(`${origin}/?motion-debug=1`); await ready(peer);
    const selfId = await page.evaluate(() => window.__riverMultiplayer().selfId);
    for (const [index, name] of ['Hermès', 'Vince', 'Steak 48'].entries()) {
      if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
      await openHudSpace(page, 'explore-section');
      await page.locator('#destination').selectOption({ label: name });
      await page.locator('#visit-destination').click();
      await page.waitForFunction(() => document.querySelector('#walking-hud').dataset.primaryAction === 'enter');
      const room = await page.evaluate(async name => {
        const { planStoreRooms } = await import('/src/store-rooms.js');
        const world = await (await fetch('/data/district.json')).json();
        const room = planStoreRooms(world).find(room => room.name === name);
        return { id: room.storeId, outside: room.toWorld(0, -1.1), inside: room.toWorld(0, 1), leftOutside: room.toWorld(-0.45, -1.1), leftInside: room.toWorld(-0.45, 1) };
      }, name);
      await page.locator('#panel-toggle').click();
      await page.locator('#canvas-host').focus();
      // The directory establishes arrival only. Every threshold crossing uses keys.
      const legs = [['approach', room.outside], ['enter', room.inside], ['exit', room.outside]];
      if (name !== 'Hermès') legs.push(['left-approach', room.leftOutside], ['left-enter', room.leftInside], ['left-exit', room.leftOutside]);
      for (const [leg, target] of legs) {
        const samples = await move(target), end = samples.at(-1).position;
        await peer.waitForFunction(({ id, end }) => {
          const player = window.__riverMultiplayer().snapshot.players.find(p => p.id === id);
          return player && Math.hypot(player.position[0] - end[0], player.position[1] + end[2]) < 0.3;
        }, { id: selfId, end });
        routes.push({ name, storeId: room.id, leg, target, samples, end, peerObserved: true });
        await page.screenshot({ path: `output/playwright/storefront-threshold-${index}-${leg}.png` });
      }
    }
    if (errors.length) throw new Error(errors.join('; '));
    return { passed: true, routes, errors, scope: 'Normal keyboard traversal with real local server and second client; no F entry or teleport across threshold.' };
  } finally { await peerContext.close(); }
}
