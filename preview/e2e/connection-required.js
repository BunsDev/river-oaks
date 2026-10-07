async page => {
  const origin = 'http://127.0.0.1:5180', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  await page.context().addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
  await page.addInitScript(() => {
    localStorage.setItem('river-oaks-play-mode', 'solo');
    localStorage.setItem('river-oaks-character', 'midnight-host-hybrid');
    localStorage.setItem('river-oaks-landmarks', JSON.stringify([{ id: 'old-device-place', name: 'Offline legacy place', position: [0, 0, 0] }]));
  });
  // Deny the join request while still serving the application and authenticated session.
  await page.route('**/api/multiplayer/ticket?**', route => route.abort('internetdisconnected'));
  await page.goto(origin + '/?play=solo&motion-debug=1');
  await page.locator('.multiplayer-gate').waitFor({ state: 'visible' });
  check(await page.locator('.app-shell').evaluate(node => node.inert), 'Legacy solo preferences cannot unlock an offline game');
  check(await page.evaluate(() => !window.__riverMultiplayer?.().connected), 'An unavailable town never creates a private session');
  const blockedPosition = await page.locator('#walking-hud').getAttribute('data-position');
  await page.keyboard.press('KeyW');
  check(await page.locator('#walking-hud').getAttribute('data-position') === blockedPosition, 'Offline keyboard input cannot move the player');
  check(await page.locator('[data-play-mode], #play-mode, .play-mode').count() === 0, 'There is no alternate play-mode control');
  await page.getByRole('button', { name: 'Try again', exact: true }).waitFor({ state: 'visible' });
  await page.unroute('**/api/multiplayer/ticket?**');
  // Automatic reconnect may win the race after restoring network access.
  await page.evaluate(() => [...document.querySelectorAll('.multiplayer-gate button')].find(button => button.textContent === 'Try again' && !button.hidden)?.click());
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host').dataset.playerReady === 'true');
  check(!await page.locator('.app-shell').evaluate(node => node.inert), 'Connection recovery unlocks the authenticated town');
  check(await page.evaluate(() => window.__riverMultiplayer().snapshot.players.some(player => player.id === 'bob')), 'The recovered player belongs to the server snapshot');
  check(!await page.locator('#landmarks-list').textContent().then(text => text.includes('Offline legacy place')), 'Device landmarks do not become account landmarks');
  const before = await page.locator('#walking-hud').getAttribute('data-position');
  await page.locator('#canvas-host').focus(); await page.keyboard.down('KeyW');
  try { await page.waitForFunction(before => document.querySelector('#walking-hud').dataset.position !== before, before); }
  finally { await page.keyboard.up('KeyW'); }
  check(true, 'Movement resumes after a successful authenticated connection');
  return { checks };
}
