export async function runPlayerBlocking(page, { interfaceOnly = false, origin } = {}) {
  const { openHudSpace } = await import('../hud-navigation.js');
  const checks = [], errors = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); console.log(`Blocking: ${label}`); };
  const ready = async tab => tab.waitForFunction(() => window.__riverMultiplayer?.().connected, null, { timeout: 120000 });
  const join = async (tab, world = '') => { await tab.goto(`${origin}/?motion-debug=1${world ? `&world=${world}` : ''}`, { waitUntil: 'commit' }); await ready(tab); };
  const peerRow = (tab, id) => tab.locator(`.multiplayer-person[data-peer-id="${id}"]`);
  const request = (tab, path, data = {}) => tab.evaluate(async ({ path, data }) => {
    const session = await (await fetch('/auth/session')).json();
    const world = new URL(location.href).searchParams.get('world') ?? 'river-oaks';
    const reply = await fetch(`${path}?world=${encodeURIComponent(world)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify(data) });
    return { status: reply.status, value: await reply.json() };
  }, { path, data });
  const settings = async tab => openHudSpace(tab, 'settings-section', 'Account');
  const notice = tab => tab.locator('.multiplayer-roster > p[role=status]');
  const confirmBlock = async button => {
    if (interfaceOnly) return button.dblclick({ delay: 50 });
    // CPU-rendered frames can consume the four-second confirmation window
    // between driver round trips. Activate the same two real click handlers in
    // one task; the interface-only journey covers native pointer activation.
    return button.evaluate(node => { node.click(); if (node.textContent !== 'Confirm block') throw new Error('Missing block confirmation'); node.click(); });
  };
  const otherContext = await page.context().browser().newContext({ viewport: { width: 1280, height: 850 } });
  const other = await otherContext.newPage();
  if (interfaceOnly) for (const context of [page.context(), otherContext]) await context.route('**/src/main.js', route => route.fulfill({ contentType: 'text/javascript', body: "import '/e2e/fixtures/player-blocking-app.js';" }));
  for (const tab of [page, other]) { tab.setDefaultTimeout(45000); tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message)); }
  await page.context().addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
  await otherContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
  try {
    await join(page); console.log('Blocking: first resident connected');
    await join(other); console.log('Blocking: second resident connected');
    const a = await page.evaluate(() => window.__riverMultiplayer().selfId);
    const b = await other.evaluate(() => window.__riverMultiplayer().selfId);
    const bName = await other.evaluate(() => window.__riverMultiplayer().snapshot.players.find(p => p.id === window.__riverMultiplayer().selfId).name);
    check(a && b && a !== b, 'two authenticated fixture residents joined');
    await openHudSpace(page, 'community-section');
    await peerRow(page, b).waitFor({ state: 'visible' });
    const block = peerRow(page, b).locator('.multiplayer-block');
    await block.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(id => !document.querySelector(`.multiplayer-person[data-peer-id="${id}"] .multiplayer-block`)?.disabled, b);
    check(await block.isEnabled(), 'the real roster offers Block after loading the signed-in list');
    check(await peerRow(page, a).locator('.multiplayer-block').count() === 0, 'no self-block control');
    await page.route('**/api/blocks/add?**', route => route.fulfill({ status: 503, json: { error: 'Fixture block unavailable.' } }));
    await confirmBlock(block);
    await notice(page).filter({ hasText: 'Fixture block unavailable.' }).waitFor();
    check(await block.textContent() === 'Block' && await block.isEnabled(), 'a failed write is announced as failure and the control recovers');
    check((await request(page, '/api/blocks/list')).value.blocked.length === 0, 'a failed write did not persist a block');
    await page.unroute('**/api/blocks/add?**');
    check((await request(page, '/api/profile/view', { peerId: b })).status === 200, 'peer profile is readable before blocking');
    await page.evaluate(() => window.__riverMultiplayerCommand({ type: 'chat', text: 'blocking journey from A' }));
    await other.evaluate(() => window.__riverMultiplayerCommand({ type: 'chat', text: 'blocking journey from B' }));
    await page.waitForFunction(() => window.__riverMultiplayer().snapshot.chat.some(line => line.text === 'blocking journey from B'));
    await other.waitForFunction(() => window.__riverMultiplayer().snapshot.chat.some(line => line.text === 'blocking journey from A'));
    await confirmBlock(block);
    await page.waitForFunction(() => /You blocked/.test(document.querySelector('.multiplayer-roster > p[role=status]')?.textContent));
    await page.waitForFunction(id => !window.__riverMultiplayer().snapshot.chat.some(line => line.authorId === id), b);
    await other.waitForFunction(id => !window.__riverMultiplayer().snapshot.chat.some(line => line.authorId === id), a);
    check((await request(page, '/api/profile/view', { peerId: b })).status === 404
      && (await request(other, '/api/profile/view', { peerId: a })).status === 404, 'the server suppresses chat and profiles in both directions');
    await settings(page);
    await page.locator('.blocked-players-list li').waitFor({ state: 'visible' });
    check((await page.locator('.blocked-players-list').textContent()).includes(bName), 'Settings shows the server-confirmed blocked resident');
    await page.screenshot({ path: 'output/playwright/player-blocking-account.png' });
    const beforeReconnect = await page.evaluate(async () => { const { sharedBlockList } = await import('/src/player-blocks.js'); sharedBlockList().attach(null); return window.__riverConnection.drop(); });
    check(beforeReconnect === true, 'the live socket is dropped for a real reconnect');
    await ready(page); await settings(page);
    await page.locator('.blocked-players-list li').waitFor();
    check((await page.locator('.blocked-players-list').textContent()).includes(bName), 'the persisted block reloads after reconnect');
    if (a !== 'alice') {
      // The standalone development town has a second world; required mode below
      // exercises real sign-out/account switching with its approved cookie fixture.
      await join(page, 'garden-2'); await join(other, 'garden-2');
      await settings(page); await page.locator('.blocked-players-list li').waitFor();
      check((await request(other, '/api/profile/view', { peerId: a })).status === 404, 'the same persisted block follows both residents into another world');
    }
    await page.locator('.blocked-players-list button').click();
    await page.locator('.blocked-players-status').filter({ hasText: `You unblocked ${bName}.` }).waitFor();
    check((await request(page, '/api/profile/view', { peerId: b })).status === 200
      && (await request(other, '/api/profile/view', { peerId: a })).status === 200, 'Settings Unblock restores server profile access in both directions');
    await other.evaluate(() => window.__riverMultiplayerCommand({ type: 'chat', text: 'blocking journey after unblock' }));
    await page.waitForFunction(() => window.__riverMultiplayer().snapshot.chat.some(line => line.text === 'blocking journey after unblock'));
    await openHudSpace(page, 'community-section');
    const liveBlock = peerRow(page, b).locator('.multiplayer-block');
    await confirmBlock(liveBlock);
    await notice(page).filter({ hasText: `You blocked ${bName}.` }).waitFor();
    await peerRow(page, b).locator('.multiplayer-block').filter({ hasText: 'Unblock' }).click();
    await notice(page).filter({ hasText: `You unblocked ${bName}.` }).waitFor();
    check((await request(page, '/api/blocks/list')).value.blocked.length === 0, 'roster Unblock removes the server block');
    if (a === 'alice' && interfaceOnly) {
      // Keep a block while switching to a different approved identity in this same page.
      await confirmBlock(liveBlock);
      await notice(page).filter({ hasText: `You blocked ${bName}.` }).waitFor();
      let releaseLogout, sawLogout;
      const held = new Promise(resolve => { releaseLogout = resolve; }), received = new Promise(resolve => { sawLogout = resolve; });
      await page.route('**/auth/logout', async route => { const response = await route.fetch(); sawLogout(); await held; await route.fulfill({ response, json: { url: '/?motion-debug=1' } }); });
      await page.locator('.multiplayer-roster > button').filter({ hasText: 'Sign out' }).click();
      await received;
      try {
        check(await page.evaluate(async () => { const { sharedBlockList } = await import('/src/player-blocks.js'); const list = sharedBlockList(); return !list.connected && list.entries().length === 0; }), 'sign-out detaches the API and clears the private blocked list before navigating');
      } finally { releaseLogout(); }
      await page.locator('#access-gate').waitFor({ state: 'visible' });
      await page.context().addCookies([{ name: 'fixture_session', value: 'guest', url: origin }]);
      await join(page); await settings(page);
      await page.locator('.blocked-players-empty').filter({ hasText: 'haven’t blocked anyone' }).waitFor();
      check(await page.locator('.blocked-players-list li').count() === 0, 'another account never inherits Alice’s blocked list');
      await page.context().addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
      await join(page); await settings(page); await page.locator('.blocked-players-list li').waitFor();
      check((await page.locator('.blocked-players-list').textContent()).includes(bName), 'returning to the original account reloads its own persisted list');
      await page.locator('.blocked-players-list button').click();
      await page.locator('.blocked-players-status').filter({ hasText: `You unblocked ${bName}.` }).waitFor();
    }
    check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
    return { passed: true, checks, errors, scope: interfaceOnly ? 'Production access entry, community, multiplayer and Settings controls over real HTTP/WS; 3D renderer omitted.' : 'Full rendered game over real HTTP/WS; software fixture, not visual/device acceptance.' };
  } finally { await otherContext.close(); }
}
