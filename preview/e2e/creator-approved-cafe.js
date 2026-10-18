async page => {
  // #420: two loopback fixture clients publish, enter, walk, reconnect and leave the approved
  // Corner Café in an owned, disposable creator region; an older client is refused there;
  // the owner rolls the region back and both clients reload the plain world.
  const { openHudSpace } = await import('./hud-navigation.js');
  const { readFile } = await import('node:fs/promises');
  const origin = 'http://127.0.0.1:5173', worldId = 'harbour-cafe', store = 'venue-corner-cafe', level = 'corner-cafe/l0';
  const errors = [], checks = [], captures = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  const fixture = await readFile('server/tests/fixtures/cafe-pilot-region.json');
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const ready = (tab, id = worldId) => tab.waitForFunction(id => window.__riverMultiplayer?.().connected
    && window.__riverMultiplayer().snapshot.worldId === id && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', id);
  const levelOf = (tab, playerId) => tab.evaluate(id => window.__riverMultiplayer().snapshot.players.find(item => item.id === id)?.levelId ?? null, playerId);
  const waitLevel = (tab, playerId, levelId) => tab.waitForFunction(({ playerId, levelId }) => {
    const player = window.__riverMultiplayer?.()?.snapshot?.players?.find(item => item.id === playerId);
    return Boolean(player) && (player.levelId ?? null) === levelId; }, { playerId, levelId });
  // Arrive by the store's travel point, as other creator journeys do: walking across a
  // creator street is refused by the server today, because the client stands on the drawn
  // curb and sidewalk while the server walks on bare terrain (recorded in the #420 ledger).
  const arrive = async tab => {
    if (await tab.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await tab.locator('#panel-toggle').click();
    await openHudSpace(tab, 'explore-section');
    await tab.locator('#destination').selectOption(store);
    await tab.locator('#visit-destination').click();
    await tab.waitForFunction(id => { const town = window.__riverMultiplayer?.(), self = town?.snapshot?.players?.find(item => item.id === town.selfId);
      return Boolean(town?.connected && self) && Math.hypot(self.position[0] - id[0], self.position[1] - id[1]) < 4; }, data.world.stores.find(item => item.id === store).visit);
    await tab.waitForTimeout(800);
  };
  const capture = async (tab, name) => { const path = `output/playwright/cafe-420-${name}.png`; await tab.screenshot({ path }); captures.push(path); };
  const tidy = async tab => {
    if (await tab.locator('.store-intro').isVisible()) await tab.locator('.store-intro button').first().click();
    if (await tab.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await tab.locator('#panel-toggle').click();
    if (await tab.locator('.visit-tools[open] > .visit-tools-toggle').count()) await tab.locator('.visit-tools[open] > .visit-tools-toggle').click();
  };
  // Walk with the real keyboard controller: turn by dragging, then hold W.
  const move = async (tab, target, reach = 0.6) => {
    let held = false, last;
    await tab.locator('#canvas-host').focus();
    try {
      for (let step = 0; step < 420; step++) {
        last = await tab.evaluate(() => window.__riverCarriage().pose);
        const dx = target[0] - last.position[0], dz = -target[1] - last.position[2];
        if (Math.hypot(dx, dz) < reach && last.speed < 0.12) return last;
        const desired = Math.atan2(-dx, -dz), angle = Math.atan2(Math.sin(desired - last.yaw), Math.cos(desired - last.yaw));
        if (Math.abs(angle) > 0.04) {
          if (held) { await tab.keyboard.up('KeyW'); held = false; }
          const drag = Math.max(-100, Math.min(100, -angle / 0.003));
          await tab.mouse.move(720, 420); await tab.mouse.down();
          await tab.mouse.move(726, 420); await tab.mouse.move(720 + drag, 420); await tab.mouse.up();
          await tab.locator('#canvas-host').focus();
        } else if (!held || step % 12 === 0 && last.speed < 0.05) {
          if (held) await tab.keyboard.up('KeyW');
          await tab.keyboard.down('KeyW'); held = true;
        }
        await tab.waitForTimeout(35);
      }
      throw new Error(`Café route did not reach ${JSON.stringify(target)}: ${JSON.stringify(last)}`);
    } finally { if (held) await tab.keyboard.up('KeyW'); }
  };
  // Face a point without moving, for a station capture.
  const face = async (tab, point) => {
    for (let step = 0; step < 30; step++) {
      const pose = await tab.evaluate(() => window.__riverCarriage().pose);
      const desired = Math.atan2(-(point[0] - pose.position[0]), point[1] + pose.position[2]);
      const angle = Math.atan2(Math.sin(desired - pose.yaw), Math.cos(desired - pose.yaw));
      if (Math.abs(angle) < 0.03) return;
      await tab.mouse.move(720, 420); await tab.mouse.down();
      await tab.mouse.move(726, 420); await tab.mouse.move(720 + Math.max(-100, Math.min(100, -angle / 0.003)), 420); await tab.mouse.up();
      await tab.waitForTimeout(60);
    }
  };

  await page.request.get(`${origin}/auth/session`);
  await page.goto(`${origin}/?motion-debug=1`, { waitUntil: 'commit' });
  await ready(page, 'river-oaks');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  await page.locator('.world-portal-form input[name=title]').fill('Harbour Café');
  await page.locator('.world-portal-form input[name=id]').fill(worldId);
  await page.locator('.world-portal-form input[name=region]').setInputFiles({ name: 'cafe-pilot-region.json', mimeType: 'application/json', buffer: fixture });
  // The region editor shows the reference as an approved layout choice, not geometry.
  await page.locator('.world-portal-design').click();
  await page.locator('.region-editor').waitFor({ state: 'visible' });
  await page.locator('.region-editor-chooser').selectOption('buildings:corner-cafe');
  const layout = page.locator('.region-editor-fields label').filter({ hasText: 'Furnished layout' }).locator('select');
  check(await layout.inputValue() === 'corner-cafe@1', 'The editor shows the approved Corner Café revision on the restaurant building');
  check((await layout.locator('option').allTextContents()).join('|') === 'Built-in layout|Corner Café, approved revision 1', 'Only reviewed revisions are offered');
  await page.locator('.region-editor [data-action=done]').click();
  await page.locator('.world-portal-form button[type=submit]').click();
  await page.locator('.world-portal-list a').filter({ hasText: 'Harbour Café' }).waitFor({ state: 'visible', timeout: 20000 }).catch(async () => {
    throw new Error(`Publish result: ${await page.locator('.world-portal-status').textContent()}`);
  });
  const data = await (await page.request.get(`${origin}/api/world-data?world=${worldId}`)).json();
  const plan = data.world.buildingInteriors.find(item => item.kind === 'approved-space');
  check(plan?.source.documentSha256 === JSON.parse(fixture).buildings[0].interior.space.sha256, 'The server resolved the reviewed revision from its own record');
  const url = `${origin}/?world=${worldId}&motion-debug=1`;
  await page.goto(url, { waitUntil: 'commit' }); await ready(page);
  const ownerId = await page.evaluate(() => window.__riverMultiplayer().selfId);
  check(await page.evaluate(() => window.__riverMultiplayer().snapshot.protocolVersion) === 4, 'The Café world asks for protocol 4');

  const browser = page.context().browser();
  const peerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), peer = await peerContext.newPage();
  const oldContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), old = await oldContext.newPage();
  peer.on('pageerror', error => errors.push(error.message));
  // The runner sets 60 s for its own page only; the original district loads slowly under load.
  page.setDefaultTimeout(90000); peer.setDefaultTimeout(90000); old.setDefaultTimeout(150000);
  try {
    await peer.goto(url, { waitUntil: 'commit' }); await ready(peer);
    const guestId = await peer.evaluate(() => window.__riverMultiplayer().selfId);
    const peerData = await (await peer.request.get(`${origin}/api/world-data?world=${worldId}`)).json();
    check(JSON.stringify(peerData.world.buildingInteriors) === JSON.stringify(data.world.buildingInteriors), 'Both clients receive the identical approved plan');
    const denied = await peer.evaluate(async region => {
      const session = await (await fetch('/auth/session')).json();
      return (await fetch('/api/worlds', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: JSON.stringify({ id: 'guest-cafe', title: 'Guest Café', description: '', region }) })).status;
    }, JSON.parse(fixture));
    check(denied === 403, 'A guest cannot publish the Café');

    // An older client (its highest protocol is 3) is refused here with the refresh prompt.
    await oldContext.route('**/src/world-contract.js*', async route => {
      const response = await route.fetch(), body = await response.text();
      await route.fulfill({ response, body: body.replace('export const MAX_WORLD_PROTOCOL_VERSION = 4;', 'export const MAX_WORLD_PROTOCOL_VERSION = 3;') });
    });
    await old.goto(url, { waitUntil: 'commit' });
    await old.waitForFunction(() => document.querySelector('#multiplayer-status')?.textContent === 'Refresh to join the improved world.');
    check(await old.locator('.multiplayer-gate').getByRole('button', { name: 'Refresh', exact: true }).isVisible(), 'An older client gets Refresh, not a guessed fallback');
    await old.goto(`${origin}/?motion-debug=1`, { waitUntil: 'commit' }); await ready(old, 'river-oaks');
    check(await old.evaluate(() => window.__riverMultiplayer().snapshot.protocolVersion) === 3, 'The same older client still joins the original district');
    await capture(old, 'older-client-district');

    // Outside: arrive at the Café, walk to its reviewed arrival and face the doorway.
    await arrive(page); await tidy(page);
    await move(page, plan.routes.arrival);
    await face(page, plan.placement.door);
    await page.waitForTimeout(1500);
    await capture(page, 'owner-arrival');
    const terrace = plan.routes.targets.find(target => target.label === 'terrace');
    // Stand back from the terrace and face its table.
    const table = plan.space.objects.find(item => item.id === 'terrace-table');
    await move(page, [plan.routes.arrival[0] - 1.5, plan.routes.arrival[1] - 0.3]);
    await face(page, [table.east, table.north]);
    await page.waitForTimeout(800);
    await capture(page, 'owner-terrace');
    await move(page, plan.routes.arrival);
    // Through the door with the walking controller, onto the approved floor.
    await move(page, [plan.placement.door[0], plan.placement.door[1] + 1.4]);
    await waitLevel(page, ownerId, level); await waitLevel(peer, ownerId, level);
    check(true, 'The owner walks through the Café door and both clients agree on the level');
    await tidy(page);
    for (const target of plan.routes.targets.filter(item => item.label !== 'terrace')) {
      await move(page, target.position);
      const object = plan.space.objects.find(item => item.id === target.objectId);
      await face(page, [object.east, object.north]);
      await page.waitForTimeout(1200);
      await capture(page, `owner-${target.label}`);
      check(await levelOf(page, ownerId) === level, `The owner reaches ${target.label} on the Café floor`);
    }

    // The guest enters by the door too and sees the owner where the server put them.
    await arrive(peer); await tidy(peer);
    await move(peer, plan.routes.arrival);
    await move(peer, [plan.placement.door[0], plan.placement.door[1] + 1.4]);
    await waitLevel(peer, guestId, level); await waitLevel(page, guestId, level);
    const seating = plan.routes.targets[0];
    await move(peer, seating.position);
    const ownerPose = await page.evaluate(() => window.__riverCarriage().pose.position);
    await face(peer, [ownerPose[0], -ownerPose[2]]);
    await peer.waitForTimeout(1500);
    await capture(peer, 'guest-sees-owner');
    const seen = await peer.evaluate(id => window.__riverMultiplayer().snapshot.players.find(item => item.id === id), ownerId);
    check(seen.levelId === level && Math.hypot(seen.position[0] - ownerPose[0], seen.position[1] + ownerPose[2]) < 0.6, 'The guest sees the owner inside the Café');

    // Reconnect: a reload inside the grace period returns the guest to the Café floor.
    const before = await peer.evaluate(() => window.__riverCarriage().pose.position);
    await peer.reload(); await ready(peer);
    await waitLevel(peer, guestId, level);
    const after = await peer.evaluate(() => window.__riverCarriage().pose.position);
    check(Math.hypot(after[0] - before[0], after[2] - before[2]) < 0.6, 'The guest reconnects where they stood on the Café floor');

    // Exit by the door with the walking controller.
    await tidy(peer);
    await move(peer, [plan.placement.door[0], plan.placement.door[1] + 1.4]);
    await move(peer, plan.routes.arrival);
    await waitLevel(peer, guestId, null); await waitLevel(page, guestId, null);
    await face(peer, plan.placement.door);
    await peer.waitForTimeout(800);
    await capture(peer, 'guest-departed');
    check(true, 'The guest walks out of the Café to its arrival');

    // Rollback: the owner restores the plain region. Both clients are moved out explicitly.
    const rollback = await page.evaluate(async worldId => {
      const session = await (await fetch('/auth/session')).json();
      const post = (action, body) => fetch(`/api/world-draft/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify(body) });
      const editable = await (await post('load', { id: worldId })).json();
      const region = structuredClone(editable.publishedRegion); delete region.buildings[0].interior.space;
      const saved = await post('save', { id: worldId, baseRegionSha256: editable.world.regionSha256, expectedDraftVersion: editable.draft?.version ?? 0, region });
      if (!saved.ok) return { saved: saved.status };
      const applied = await post('apply', { id: worldId, expectedDraftVersion: (editable.draft?.version ?? 0) + 1 });
      return { status: applied.status, body: await applied.json() };
    }, worldId);
    check(rollback.status === 200 && rollback.body.disconnectedPlayers === 2, `The owner rolls back with both visitors disconnected: ${JSON.stringify(rollback)}`);
    await ready(page); await ready(peer);
    await page.waitForFunction(() => window.__riverMultiplayer().snapshot.protocolVersion === 3);
    const plain = await (await page.request.get(`${origin}/api/world-data?world=${worldId}`)).json();
    check(plain.world.buildingInteriors === undefined, 'After rollback the region has no approved plan');
    check(await levelOf(peer, guestId) === null && await levelOf(page, ownerId) === null, 'Nobody is left on the replaced Café floor');
    await tidy(page); await face(page, plan.placement.door); await page.waitForTimeout(1200);
    await capture(page, 'owner-after-rollback');
    const unexpected = errors.filter(message => !/WebSocket|Failed to fetch|NetworkError|aborted/i.test(message));
    check(unexpected.length === 0, `No page errors: ${unexpected.join(' | ')}`);
    return { passed: true, checks, captures, plan: { approvedSha256: plan.approvedSha256, source: plan.source, door: plan.placement.door } };
  } finally {
    await peerContext.close(); await oldContext.close();
  }
}
