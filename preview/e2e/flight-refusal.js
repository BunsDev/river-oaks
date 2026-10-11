async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  // A refused take-off is announced above the walking console, where the player is looking.
  const checks = [], errors = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 120000 });
  const toggle = page.locator('#panel-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption('osm-node-8172494967');
  await page.locator('#enter-destination').click();
  await page.waitForFunction(() => document.querySelector('#walking-hud').dataset.inside === 'osm-node-8172494967', null, { timeout: 30000 });
  await toggle.click();
  check(await page.locator('#walking-notice').isHidden(), 'No notice before anything is refused');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyB');
  await page.locator('#walking-notice').waitFor({ state: 'visible', timeout: 2000 });
  check(/indoors: step outside/.test(await page.locator('#walking-notice').textContent()), 'Pressing B indoors says why: step outside first');
  check(await page.locator('#walking-hud').evaluate(hud => hud.dataset.flying) === 'false', 'Jevica stays on the ground');
  const box = await page.locator('#walking-notice').boundingBox(), panel = await page.locator('.walking-console').boundingBox();
  check(box.y + box.height <= panel.y && Math.abs(box.x + box.width / 2 - (panel.x + panel.width / 2)) < 4, 'The notice sits centred just above the walking console');
  await page.screenshot({ path: 'output/playwright/flight-refusal.png' });
  await page.locator('#walking-notice').waitFor({ state: 'hidden', timeout: 5000 });
  check(true, 'The notice dismisses itself');
  check(!errors.length, errors.length ? errors.join('; ') : 'No page errors');
  return { checks };
}
