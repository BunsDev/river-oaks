async page => {
  // #491: in a published creator region, a visitor walks across a street with the keyboard
  // and the server keeps every step, over the sidewalks, curbs and the road crown it draws.
  const origin = 'http://127.0.0.1:5173', worldId = 'street-walk', checks = [], errors = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Synthetic fixture: flat ground, one residential street between the spawn and a shop.
  const region = {
    schema_version: 1, bounds_m: [-60, -60, 60, 60],
    terrain: { width: 5, height: 5, heights_m: Array(25).fill(0) }, spawn: [0, -40],
    roads: [{ id: 'harbour-street', name: 'Harbour Street', kind: 'residential', width_m: 8.4, points: [[-50, -24], [50, -24]] }],
    buildings: [{ id: 'corner-shop', center: [0, -5], size: [18, 14, 6], yaw_deg: 0, kind: 'retail', interior: { name: 'Corner Shop', category: 'restaurant', entrance: 'south' } }],
    trees: [], places: [['steps', [0, -50]], ['east', [40, -40]], ['west', [-40, -40]], ['garden', [-30, 44]]].map(([id, position]) => ({ id, name: id, position })),
  };
  const ready = id => page.waitForFunction(id => window.__riverMultiplayer?.()?.connected
    && window.__riverMultiplayer()?.snapshot?.worldId === id && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', id);
  const serverPosition = () => page.evaluate(() => { const town = window.__riverMultiplayer?.(); return town?.snapshot?.players?.find(item => item.id === town.selfId)?.position ?? null; });
  // Walk with the real keyboard controller: turn by dragging, then hold W.
  const move = async target => {
    let held = false, last;
    // The walker has no pose until the world finishes loading.
    await page.waitForFunction(() => window.__riverCarriage?.()?.pose?.position);
    await page.locator('#canvas-host').focus();
    try {
      for (let step = 0; step < 600; step++) {
        last = await page.evaluate(() => window.__riverCarriage?.()?.pose ?? null);
        if (!last) { await page.waitForTimeout(100); continue; }
        const dx = target[0] - last.position[0], dz = -target[1] - last.position[2];
        if (Math.hypot(dx, dz) < 0.6 && last.speed < 0.12) return last;
        const desired = Math.atan2(-dx, -dz), angle = Math.atan2(Math.sin(desired - last.yaw), Math.cos(desired - last.yaw));
        if (Math.abs(angle) > 0.04) {
          if (held) { await page.keyboard.up('KeyW'); held = false; }
          await page.mouse.move(720, 420); await page.mouse.down();
          await page.mouse.move(726, 420); await page.mouse.move(720 + Math.max(-100, Math.min(100, -angle / 0.003)), 420); await page.mouse.up();
          await page.locator('#canvas-host').focus();
        } else if (!held || step % 12 === 0 && last.speed < 0.05) {
          if (held) await page.keyboard.up('KeyW');
          await page.keyboard.down('KeyW'); held = true;
        }
        await page.waitForTimeout(35);
      }
      throw new Error(`The walk stopped at ${JSON.stringify(last.position)} on the way to ${JSON.stringify(target)}`);
    } finally { if (held) await page.keyboard.up('KeyW'); }
  };

  await page.request.get(`${origin}/auth/session`);
  await page.goto(`${origin}/?motion-debug=1`, { waitUntil: 'commit' });
  await ready('river-oaks');
  const published = await page.evaluate(async ({ worldId, region }) => {
    const session = await (await fetch('/auth/session')).json();
    const response = await fetch('/api/worlds', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
      body: JSON.stringify({ id: worldId, title: 'Street Walk', description: '', region }) });
    return { status: response.status, body: await response.json() };
  }, { worldId, region });
  check(published.status === 201, `The owner publishes the street fixture: ${JSON.stringify(published)}`);
  await page.goto(`${origin}/?world=${worldId}&motion-debug=1`, { waitUntil: 'commit' });
  await ready(worldId);
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  const start = await serverPosition();
  check(start && start[1] < -30, `The visitor starts south of Harbour Street: ${JSON.stringify(start)}`);

  // Across the street: over the south sidewalk, the crown and the north sidewalk.
  await move([0, -27]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'output/playwright/creator-street-crossing.png' });
  await move([0, -15]);
  await page.waitForTimeout(800);
  const across = await serverPosition();
  check(across[1] > -16.5, `The server keeps the visitor on the far side of the street: ${JSON.stringify(across)}`);
  // And back again.
  await move([0, -36]);
  await page.waitForTimeout(800);
  const back = await serverPosition();
  check(back[1] < -34.5, `The server keeps the visitor back on the near side: ${JSON.stringify(back)}`);
  const unexpected = errors.filter(message => !/WebSocket|Failed to fetch|NetworkError|aborted/i.test(message));
  check(unexpected.length === 0, `No page errors: ${unexpected.join(' | ')}`);
  return { passed: true, checks, positions: { start, across, back } };
}
