async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks = [], errors = [], routes = [], origin = 'http://127.0.0.1:5173';
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  let socket, connections = 0;
  await page.routeWebSocket('**/multiplayer?*', route => { socket = { client: route, server: route.connectToServer() }; connections++; });
  page.on('pageerror', error => errors.push(error.message));
  const peerContext = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  await peerContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
  const peer = await peerContext.newPage();
  peer.on('pageerror', error => errors.push(error.message));
  const ready = p => p.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  try {
    await page.goto(`${origin}/?motion-debug=1`); await ready(page);
    await peer.goto(`${origin}/?motion-debug=1`); await ready(peer);
    const selfId = await page.evaluate(() => window.__riverMultiplayer().selfId);
    for (const [index, name] of ['Zadig & Voltaire', 'de Boulle'].entries()) {
      if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
      await openHudSpace(page, 'explore-section');
      await page.locator('#destination').selectOption({ label: name }); await page.locator('#visit-destination').click();
      await page.waitForFunction(() => document.querySelector('#walking-hud').dataset.primaryAction === 'enter');
      await page.locator('#walking-enter').click();
      // The first-visit intro starts from the town's snapshot and can open before
      // the walking HUD repaints, which then stays still until the intro ends.
      const intro = page.locator('.store-intro[open]');
      await page.waitForFunction(() => document.querySelector('#walking-hud').dataset.inside || document.querySelector('.store-intro[open]') || !document.querySelector('#walking-notice').hidden);
      if (!await page.locator('#walking-hud').getAttribute('data-inside') && !await intro.count()) {
        await page.locator('#walking-notice').waitFor({ state: 'hidden' }); await page.locator('#walking-enter').click();
      }
      await intro.waitFor({ state: 'visible' });
      await intro.getByRole('button', { name: /Skip intro|Continue/ }).click();
      await intro.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !!document.querySelector('#walking-hud').dataset.inside);
      await page.locator('#panel-toggle').click();
      if (await page.locator('.player-settings').evaluate(node => node.open)) await page.locator('.player-settings > summary').click();
      await page.locator('#canvas-host').focus();
      const room = await page.evaluate(async name => {
        const { planStoreRooms } = await import('/src/store-rooms.js');
        const world = await (await fetch('/data/district.json')).json(), room = planStoreRooms(world).find(room => room.name === name);
        return { id: room.id, center: room.center, width: room.width, depth: room.depth, facade: room.facade, right: room.right, inward: room.inward, rear: room.toWorld(room.center - 0.15, 6.1), diagonal: room.toWorld(room.center + 0.2, 3.7), outside: room.toWorld(0, -2) };
      }, name);
      const initial = await page.evaluate(() => window.__riverCarriage().pose.position);
      for (const [leg, target] of [['diagonal-approach', room.diagonal], ['rear', room.rear], ['conversation-return', room.rear], ['diagonal-return', room.diagonal], ['return', [initial[0], -initial[2]]], ['street', room.outside], ['threshold-return', [initial[0], -initial[2]]]]) {
        const started = Date.now(), samples = []; let held = [];
        try {
          while (Date.now() - started < 60000) {
            const { pose, occupants } = await page.evaluate(id => {
              const ids = new Set(window.__riverMultiplayer().snapshot.locals.filter(local => local.storeId === id).map(local => local.id));
              return { pose: window.__riverCarriage().pose, occupants: window.__riverPeople().filter(person => ids.has(person.id) && person.visible).map(person => ({ id: person.id, position: person.renderedPosition, role: person.role })) };
            }, room.id);
            const dx = target[0] - pose.position[0], dz = -target[1] - pose.position[2];
            samples.push({ ms: Date.now() - started, position: pose.position, occupants, keys: [...held] });
            if (Math.hypot(dx, dz) < 0.18) break;
            const desired = Math.atan2(-dx, -dz), difference = Math.atan2(Math.sin(desired - pose.yaw), Math.cos(desired - pose.yaw));
            if (Math.abs(difference) > 0.03) {
              const rect = await page.locator('#canvas-host').boundingBox(), x = rect.x + rect.width / 2, y = rect.y + rect.height * 0.4;
              const drag = Math.max(-rect.width * 0.35, Math.min(rect.width * 0.35, -difference / 0.003));
              await page.mouse.move(x, y); await page.mouse.down();
              await page.mouse.move(x + drag, y, { steps: 3 }); await page.mouse.up();
              continue;
            }
            const keys = ['KeyW'];
            samples.at(-1).keys = [...keys];
            for (const key of held) if (!keys.includes(key)) await page.keyboard.up(key);
            for (const key of keys) if (!held.includes(key)) await page.keyboard.down(key);
            held = keys; await page.waitForTimeout(Math.min(80, Math.hypot(dx, dz) / 1.65 * 350));
            // Bounds inspection skins every visible person. Release input before
            // that work, so inspection latency cannot extend a held movement key.
            for (const key of held) await page.keyboard.up(key);
            held = [];
          }
        } finally { for (const key of held) await page.keyboard.up(key); }
        const end = await page.evaluate(() => window.__riverCarriage().pose.position);
        const reached = Math.hypot(end[0] - target[0], -end[2] - target[1]) < 0.22;
        check(reached, `${name}: normal keyboard walking reaches ${leg}${reached ? '' : `; ${JSON.stringify({ end, target, tail: samples.slice(-4) })}`}`);
        await peer.waitForFunction(({ id, end }) => {
          const player = window.__riverMultiplayer().snapshot.players.find(player => player.id === id);
          return player && Math.hypot(player.position[0] - end[0], player.position[1] + end[2]) < 0.3;
        }, { id: selfId, end });
        check(true, `${name}: peer receives the authoritative ${leg} position`);
        const people = await page.evaluate(() => window.__riverPeople().filter(person => person.visible));
        const elapsed = (Date.now() - started) / 1000;
        const length = samples.slice(1).reduce((sum, sample, i) => sum + Math.hypot(sample.position[0] - samples[i].position[0], sample.position[2] - samples[i].position[2]), 0);
        const nearestOccupant = Math.min(...samples.flatMap(sample => sample.occupants.map(person => Math.hypot(sample.position[0] - person.position[0], sample.position[2] - person.position[2]))));
        const closest = samples.flatMap(sample => sample.occupants.map(person => ({ player: sample.position, person, distance: Math.hypot(sample.position[0] - person.position[0], sample.position[2] - person.position[2]) }))).sort((a, b) => a.distance - b.distance)[0];
        check(Number.isFinite(nearestOccupant) && nearestOccupant >= 0.63, `${name}: ${leg} clears occupied stations (0.35 m player + 0.28 m standing proxy), measured ${nearestOccupant.toFixed(3)} m${nearestOccupant < 0.63 ? `; ${JSON.stringify(closest)}` : ''}`);
        routes.push({ name, leg, room, elapsed, length, nearestOccupant, samples, people, end, authoritative: await peer.evaluate(id => window.__riverMultiplayer().snapshot.players.find(player => player.id === id), selfId) });
        console.log(`Spatial circulation ${name} ${leg}: ${length.toFixed(2)} m, occupant distance ${nearestOccupant.toFixed(3)} m`);
        await page.screenshot({ path: `output/playwright/spatial-circulation-${index}-${leg}.png` });
        if (leg === 'rear') {
          await page.keyboard.press('KeyV');
          check(await page.locator('#player-camera').getAttribute('aria-pressed') === 'false', `${name}: first-person camera is active`);
          await page.waitForTimeout(250);
          await page.screenshot({ path: `output/playwright/spatial-circulation-${index}-first-person.png` });
          await page.keyboard.press('KeyV');
          check(await page.locator('#player-camera').getAttribute('aria-pressed') === 'true', `${name}: third-person camera is restored`);
          const staff = await page.evaluate(id => {
            const ids = new Set(window.__riverMultiplayer().snapshot.locals.filter(local => local.storeId === id).map(local => local.id));
            return window.__riverPeople().find(person => ids.has(person.id) && person.role === 'staff' && person.reachable)?.id;
          }, room.id);
          check(Boolean(staff), `${name}: rear activity area has reachable staff`);
          await openHudSpace(page, 'community-section');
          if (!await page.locator('#community-more').evaluate(node => node.open)) await page.locator('#community-more > summary').click();
          await page.locator('#community-local').selectOption(staff); await page.locator('#community-meet').click();
          await page.locator('#community-dialogue').waitFor({ state: 'visible' });
          const talkingPosition = await page.evaluate(() => window.__riverCarriage().pose.position);
          // Meeting a local uses the normal server travel command. Keep its
          // correction separate from the keyboard route and never count it as walking.
          routes.at(-1).conversation = { staff, before: end, after: talkingPosition, relocation: Math.hypot(talkingPosition[0] - end[0], talkingPosition[2] - end[2]) };
          check(await page.evaluate(id => window.__riverCarriage().pose.roomId === id, room.id), `${name}: staff conversation opens in the same shop`);
          await page.locator('#community-close').click(); await page.locator('#people-toggle').click();
          const before = connections, prior = socket;
          await Promise.all([prior.client.close({ code: 1001, reason: 'Spatial acceptance reconnect' }), prior.server.close({ code: 1001, reason: 'Spatial acceptance reconnect' })]);
          await ready(page);
          await page.waitForFunction(id => window.__riverMultiplayer().selfId === id, selfId);
          check(connections > before, `${name}: reconnect retains the authoritative identity`);
          const recovered = await page.evaluate(() => window.__riverCarriage().pose.position);
          check(Math.hypot(recovered[0] - talkingPosition[0], recovered[2] - talkingPosition[2]) < 0.3, `${name}: reconnect retains the conversation position before the return walk`);
          await page.locator('#canvas-host').focus();
        }
      }
    }
    check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);
    return { checks, routes, errors };
  } finally { await peerContext.close(); }
}
