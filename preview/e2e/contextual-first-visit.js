async initialPage => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const visit = async (page, { touch = false } = {}) => {
  const checks = [], errors = [], replies = [];
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => { try { const data = JSON.parse(String(payload)); if (data.type === 'result') replies.push({ ok: data.ok, error: data.error, message: data.message }); } catch {} }));
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); console.log(`${touch ? 'Touch' : 'Desktop'}: ${message}`); };
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: touch ? 390 : 1280, height: touch ? 844 : 900 });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true');
  const host = page.locator('#canvas-host'), more = page.locator('.walking-more');
  const readyActions = () => page.waitForFunction(() => document.querySelectorAll('.walking-primary > button:not([hidden]):not(:disabled)').length === 1);
  // Open More only when it is shown and closed: actions move between the primary
  // slot and More as context changes, and a second summary click would close it.
  const reveal = async selector => {
    if (!await more.evaluate(node => node.open || node.hidden)) await more.locator('summary').click();
    await page.locator(selector).waitFor({ state: 'visible' });
  };
  if (touch) {
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').tap();
    await openHudSpace(page, 'explore-section');
  } else { await host.focus(); await page.keyboard.press('/'); }
  await page.locator('#store-search').fill('Herm');
  const destination = await page.locator('#destination').inputValue();
  check(Boolean(destination), 'First visit: search selects a destination');
  await page.locator('#visit-destination').click();
  await page.waitForFunction(() => document.querySelector('#walking-hud').dataset.primaryAction === 'enter');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  if (await page.locator('.visit-tools').evaluate(node => node.open)) await page.locator('.visit-tools-toggle').click();
  await readyActions();
  check(await page.locator('.walking-primary > #walking-enter').isVisible(), 'Arrival gives the doorway a single primary prompt');
  if (touch) await page.locator('#walking-enter').tap();
  else { await page.locator('#walking-enter').focus(); await page.keyboard.press('Enter'); }
  await page.waitForFunction(id => document.querySelector('#walking-hud').dataset.inside === id || !document.querySelector('#walking-notice').hidden, destination, { timeout: 10000 });
  if (!await page.locator('#walking-hud').getAttribute('data-inside')) {
    check((await page.locator('#walking-notice').textContent()).includes('Wait a moment'), 'Rapid arrival/entry explains the authoritative cooldown at the action');
    // Retry after the visible refusal dismisses; do not weaken the server cooldown.
    await page.locator('#walking-notice').waitFor({ state: 'hidden' });
    await page.locator('#walking-enter').click();
  }
  await page.waitForFunction(id => document.querySelector('#walking-hud').dataset.inside === id, destination, { timeout: 10000 });
  await readyActions();
  // The town owns indoor residents. E uses their actual reach, without fixtures
  // changing collision, identities or movement authority.
  if (await page.locator('#walking-talk').isDisabled()) {
    await host.focus(); await page.keyboard.down('KeyD');
    try { await page.waitForFunction(() => !document.querySelector('#walking-talk').disabled, null, { timeout: 5000 }); }
    finally { await page.keyboard.up('KeyD'); }
  }
  // A keyboard-focused action stays put until focus leaves it; a tap leaves focus on
  // Step outside too, but must not pin it, so the touch run keeps that focus here.
  if (!touch) await host.focus();
  await page.waitForFunction(() => document.querySelector('#walking-hud').dataset.primaryAction === 'talk');
  check(await page.locator('.walking-primary > #walking-talk').isVisible(), 'Inside, the reachable conversation becomes primary');
  await page.screenshot({ path: `output/playwright/contextual-indoor-${touch ? 'touch' : 'desktop'}.png` });
  if (touch) await page.locator('#walking-talk').tap();
  else { await page.locator('#walking-talk').focus(); await page.keyboard.press('Enter'); }
  await page.locator('#community-dialogue').waitFor({ state: 'visible' });
  check(true, 'The primary action opens the actual conversation');
  await page.locator('#community-close').focus(); await page.keyboard.press('Escape');
  check(await host.evaluate(node => node === document.activeElement), 'Conversation dismissal restores world focus');
  await reveal('#walking-enter');
  check(await more.locator('#walking-enter').isVisible(), 'Leaving remains reachable as a secondary action');
  await page.locator('#walking-enter').click();
  await page.waitForFunction(() => !document.querySelector('#walking-hud').dataset.inside || !document.querySelector('#walking-notice').hidden, null, { timeout: 10000 });
  if (await page.locator('#walking-hud').getAttribute('data-inside')) {
    check((await page.locator('#walking-notice').textContent()).includes('Wait a moment'), 'Leaving immediately after a conversation explains the travel cooldown');
    await page.locator('#walking-notice').waitFor({ state: 'hidden' });
    await reveal('#walking-enter'); await page.locator('#walking-enter').click();
  }
  await page.waitForFunction(() => !document.querySelector('#walking-hud').dataset.inside, null, { timeout: 10000 }).catch(error => { throw new Error(`${error.message}; town replies ${JSON.stringify(replies.slice(-5))}`); });
  check(true, 'Secondary doorway action returns to the street');
  await page.locator('.commands-toggle').click();
  await page.locator('#rail-command-search').fill('camera');
  await page.locator('.rail-commands').getByRole('button', { name: 'Camera · Photo mode', exact: true }).click();
  await page.locator('.photo-capture').click();
  await page.locator('.photo-result').waitFor({ state: 'visible' });
  const retained = await page.locator('.photo-download').getAttribute('href');
  await page.keyboard.press('Escape');
  await page.locator('.photo-mode').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !document.body.classList.contains('photographing'));
  await host.focus();
  const before = await page.locator('#walking-hud').getAttribute('data-position');
  await page.keyboard.down('KeyA');
  try { await page.waitForFunction(before => document.querySelector('#walking-hud').dataset.position !== before, before, { timeout: 5000 }); }
  catch (error) { throw new Error(`${error.message}; movement state ${JSON.stringify(await page.evaluate(() => ({ focus: document.activeElement.id, classes: document.body.className, hud: {...document.querySelector('#walking-hud').dataset} })))}`); }
  finally { await page.keyboard.up('KeyA'); }
  check(true, 'First visit ends with walking restored after taking a photo');
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.locator('.town-chat-dock').evaluate(node => node.open)) await page.locator('.town-chat-toggle').click();
  if (await more.evaluate(node => node.open)) await more.locator('summary').click();
  if (await page.locator('#walking-movement').isHidden()) await page.locator('#walking-controls-toggle').click();
  check(await page.locator('[data-walk-key=KeyW]').isVisible(), 'Narrow viewport exposes the on-screen movement pad');
  const start = await page.locator('#walking-hud').getAttribute('data-position');
  const right = page.locator('[data-walk-key=ArrowRight]');
  const yaw = await page.locator('#walking-hud').getAttribute('data-yaw');
  if (touch) {
    const rect = await right.boundingBox(), cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }] });
    try { await page.waitForFunction(yaw => document.querySelector('#walking-hud').dataset.yaw !== yaw, yaw); }
    finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); }
    check(!await right.evaluate(node => node.classList.contains('held')), 'Releasing real touch input clears the held movement state');
    check(await page.evaluate(() => matchMedia('(pointer:coarse)').matches), 'Touch test uses a coarse-pointer device context');
  } else {
    await right.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(yaw => document.querySelector('#walking-hud').dataset.yaw !== yaw, yaw);
  }
  check(true, touch ? 'Touch press turns the player using the on-screen pad' : 'On-screen movement buttons also work from the keyboard');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Narrow layout has no horizontal overflow');
  await page.screenshot({ path: 'output/playwright/contextual-mobile.png' });
  await page.locator('.commands-toggle').click();
  await page.locator('.rail-commands').getByRole('button', { name: 'Camera · Photo mode', exact: true }).click();
  check(await page.locator('.photo-download').getAttribute('href') === retained, 'Photo survives returning to walking and reopening on a narrow screen');
  await page.keyboard.press('Escape');
  await page.locator('.photo-mode').waitFor({ state: 'hidden' });
  check(errors.length === 0, `No page errors: ${errors.join('; ')}`);
  return { checks, destination, start, errors };

  };
  const desktop = await visit(initialPage);
  const cookies = await initialPage.context().cookies();
  await initialPage.goto('about:blank');
  const context = await initialPage.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    await context.addCookies(cookies);
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const touch = await visit(page, { touch: true }).catch(async error => { await page.screenshot({ path: 'output/playwright/contextual-touch-failure.png' }); throw error; });
    return { desktop, touch };
  } finally { await context.close(); }
}
