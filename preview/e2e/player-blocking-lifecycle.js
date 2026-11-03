async page => {
  const origin = 'http://127.0.0.1:5180', checks = [], errors = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.context().addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
  await page.goto(`${origin}/e2e/fixtures/player-blocking-client.html`);
  const ready = () => page.waitForFunction(() => window.blockingFixture?.client.connected && window.blockingFixture.blocks.loaded);
  await ready();
  check(true, 'the real multiplayer client attaches and loads its signed-in block list');

  let releaseRead, sawRead;
  const readHeld = new Promise(resolve => { releaseRead = resolve; }), readSeen = new Promise(resolve => { sawRead = resolve; });
  await page.route('**/api/character?**', async route => { sawRead(); await readHeld; await route.fulfill({ status: 401, json: { error: 'Old fixture session ended.' } }); });
  await page.evaluate(() => { window.blockingFixture.oldRead = window.blockingFixture.client.characterRequest('read').catch(error => error.message); });
  await readSeen;
  await page.evaluate(() => { const f = window.blockingFixture; f.blocks.attach(null); window.__riverConnection.drop(); window.dispatchEvent(new Event('online')); });
  await ready();
  releaseRead();
  check(await page.evaluate(async () => { const f = window.blockingFixture; await f.oldRead; return f.blocks.connected && f.blocks.loaded; }), 'a stale HTTP 401 cannot detach a newer block session');
  await page.unroute('**/api/character?**');

  // A replacement client takes ownership; disposing the old one cannot clear it.
  await page.evaluate(() => { const f = window.blockingFixture; f.old = f.client; f.client = f.create(); });
  await ready();
  await page.evaluate(() => window.blockingFixture.old.dispose());
  check(await page.evaluate(() => window.blockingFixture.blocks.connected && window.blockingFixture.blocks.loaded), 'old client disposal preserves the replacement client’s block session');

  // Hold a reconnect's authenticated session reply before pressing Sign out.
  let releaseSession, sawSession;
  const sessionHeld = new Promise(resolve => { releaseSession = resolve; }), sessionSeen = new Promise(resolve => { sawSession = resolve; });
  await page.route('**/auth/session', async route => { const response = await route.fetch(); sawSession(); await sessionHeld; await route.fulfill({ response }); });
  await page.evaluate(() => { window.__riverConnection.drop(); window.dispatchEvent(new Event('online')); });
  await sessionSeen;
  let releaseLogout, sawLogout;
  const logoutHeld = new Promise(resolve => { releaseLogout = resolve; }), logoutSeen = new Promise(resolve => { sawLogout = resolve; });
  await page.route('**/auth/logout', async route => { sawLogout(); await logoutHeld; await route.fulfill({ status: 503, json: { error: 'Fixture logout unavailable.' } }); });
  await page.locator('.multiplayer-gate').getByRole('button', { name: 'Sign out', exact: true }).click();
  await logoutSeen;
  const deliveredSession = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/session');
  releaseSession(); await (await deliveredSession).finished(); await page.unroute('**/auth/session');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  check(await page.evaluate(() => { const f = window.blockingFixture; return !f.blocks.connected && !f.blocks.loaded && f.blocks.entries().length === 0; }), 'an in-flight reconnect cannot restore private blocks during pending sign-out');
  releaseLogout();
  await ready();
  check(await page.evaluate(() => window.blockingFixture.blocks.connected), 'failed sign-out recovers only after a fresh authenticated session');
  await page.unroute('**/auth/logout');
  await page.evaluate(() => window.blockingFixture.client.dispose());
  check(await page.evaluate(() => !window.blockingFixture.blocks.connected && window.blockingFixture.blocks.entries().length === 0), 'final client disposal detaches and clears the list');
  check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
  return { passed: true, checks, errors, scope: 'Real multiplayer client controls and HTTP/WS over approved fixture identities; renderer omitted to isolate auth races.' };
}
