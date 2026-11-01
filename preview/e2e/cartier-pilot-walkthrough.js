async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const { watchCartierErrors, assertCartierRender, assertCartierWalk } = await import('./cartier-pilot-checks.js');
  const errors = watchCartierErrors(page);
  // Optional provider settings use the existing fixture's unconfigured contract.
  for (const provider of ['jev', 'elevenlabs']) await page.route(`**/v1/settings/${provider}`, route => route.fulfill({ json: { source: 'none', configured: false } }));
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption({ label: 'Cartier' });
  const introClaim = page.waitForResponse(response => response.url().includes('/api/profile/claim-intro'));
  await page.locator('#enter-destination').click();
  await page.waitForFunction(() => document.querySelector('#walking-place')?.textContent.startsWith('Inside Cartier'));
  // A fresh fixture makes this a first visit: the modal intro halts walking and holds
  // focus for up to 6 s. Skip it as a visitor would before measuring the walk.
  const firstVisit = Boolean((await (await introClaim).json()).firstVisit);
  if (firstVisit) { await page.locator('.store-intro button').click(); await page.locator('.store-intro').waitFor({ state: 'hidden' }); }
  await page.screenshot({ path: 'output/playwright/cartier-walkthrough-entry.png' });
  await page.locator('#canvas-host').focus();
  const walkState = () => page.locator('#walking-hud').evaluate(hud => ({ inside: hud.dataset.inside, position: JSON.parse(hud.dataset.position) }));
  const before = await walkState();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1800); await page.keyboard.up('KeyW');
  const after = await walkState(), distance = assertCartierWalk(before, after);
  await page.screenshot({ path: 'output/playwright/cartier-walkthrough-display.png' });
  // Return along the same aisle to the doorway before requesting an exit.
  await page.keyboard.down('KeyS');
  try { await page.waitForFunction(() => { const button = document.querySelector('#walking-enter'); return button && !button.hidden && button.textContent.includes('Step outside'); }, null, { timeout: 10000 }); } finally { await page.keyboard.up('KeyS'); }
  // Server travel admission is 1000 ms. Wait for visible state, then allow that real cooldown.
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => !document.querySelector('#walking-hud')?.dataset.inside);
  await page.waitForTimeout(1100);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => Boolean(document.querySelector('#walking-hud')?.dataset.inside));
  const place = await page.locator('#walking-place').textContent();
  if (!place.startsWith('Inside Cartier')) throw new Error(`Wrong re-entry room: ${place}`);
  const frames = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let previous;
    const frame = now => { if (previous !== undefined) samples.push(now - previous); previous = now; if (samples.length < 120) requestAnimationFrame(frame); else { samples.sort((a, b) => a - b); resolve({ median_ms: samples[60], p95_ms: samples[114], samples: samples.length }); } }; requestAnimationFrame(frame);
  }));
  const glError = await page.locator('#canvas-host canvas').evaluate(canvas => canvas.getContext('webgl2').getError());
  assertCartierRender(errors, glError);
  return { place, firstVisit, before, after, distance, frames, glError, errors, scope: 'Local authenticated fixture walking/re-entry and world rendering; no live auth or human acceptance' };
}
