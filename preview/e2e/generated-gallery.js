async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1&render-audit=1');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined');
  const state = () => page.evaluate(() => window.__riverGeneratedInteriors?.()[0] ?? null);
  const initial = await state();
  if (!initial || initial.ready || !initial.shellVisible) throw new Error(`Gallery must begin with its ready shell: ${JSON.stringify(initial)}`);
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption({ label: 'Laura Rathe Fine Art' });
  const coldStart = performance.now();
  await page.locator('#visit-destination').click();
  await page.waitForFunction(() => window.__riverGeneratedInteriors?.()[0]?.ready, null, { timeout: 30000 });
  const coldMs = performance.now() - coldStart;
  await page.screenshot({ path: 'output/playwright/generated-gallery-street.png' });
  await page.waitForTimeout(1500);
  await page.locator('#enter-destination').click();
  await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside, null, { timeout: 10000 });
  const name = await page.locator('#walking-place').textContent();
  if (!name.startsWith('Inside Laura Rathe Fine Art')) throw new Error(`Wrong interior: ${name}`);
  const inside = await page.evaluate(() => {
    const multiplayer = window.__riverMultiplayer();
    const player = multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId);
    return { player: player?.position, stream: window.__riverGeneratedInteriors()[0] };
  });
  if (!inside.player || !inside.stream.ready || inside.stream.shellVisible) throw new Error(`Interior was not ready: ${JSON.stringify(inside)}`);
  await page.screenshot({ path: 'output/playwright/generated-gallery-inside.png' });
  if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
  const render = await page.evaluate(async () => {
    const audit = window.__riverRenderAudit;
    audit.start();
    for (let index = 0; index < 150; index++) await new Promise(resolve => requestAnimationFrame(resolve));
    const sample = audit.stop();
    const percentile = (values, fraction) => {
      const ordered = values.toSorted((a, b) => a - b);
      return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))];
    };
    const graphics = audit.graphics();
    return { frames: sample.frames.length, overflow: sample.overflow,
      frameIntervalMs: { p50: percentile(sample.frames.map(frame => frame.intervalMs), 0.5),
        p95: percentile(sample.frames.map(frame => frame.intervalMs), 0.95) },
      mainThreadMs: { p50: percentile(sample.frames.map(frame => frame.cpuMs), 0.5),
        p95: percentile(sample.frames.map(frame => frame.cpuMs), 0.95) },
      graphics, heapBytes: performance.memory?.usedJSHeapSize ?? null };
  });
  if (render.overflow || render.frames < 120) throw new Error(`Incomplete gallery render sample: ${JSON.stringify(render)}`);
  await page.locator('#canvas-host').focus();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1700); await page.keyboard.up('KeyW');
  await page.waitForTimeout(250);
  if (!(await page.locator('#walking-hud').getAttribute('data-inside'))) throw new Error('Walking left the approved gallery room');
  if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  if (await page.locator('#walking-hud').getAttribute('data-inside')) {
    const detail = await page.evaluate(() => {
      const multiplayer = window.__riverMultiplayer();
      return { hud: document.querySelector('#walking-hud')?.dataset.inside,
        place: document.querySelector('#walking-place')?.textContent,
        player: multiplayer.snapshot?.players.find(item => item.id === multiplayer.selfId)?.position,
        pose: window.__riverCarriage().pose.position,
        notices: [...document.querySelectorAll('[role="alert"]')].map(item => item.textContent),
      };
    });
    throw new Error(`Could not leave generated gallery: ${JSON.stringify(detail)}`);
  }
  await page.locator('#destination').selectOption({ label: 'Cartier' });
  await page.locator('#visit-destination').click();
  await page.waitForTimeout(12500);
  const evicted = await state();
  if (evicted.ready || !evicted.shellVisible) throw new Error(`Gallery did not evict its detail: ${JSON.stringify(evicted)}`);
  const afterEviction = await page.evaluate(() => window.__riverRenderAudit.graphics().memory);
  await page.locator('#destination').selectOption({ label: 'Laura Rathe Fine Art' });
  const returnStart = performance.now();
  await page.locator('#visit-destination').click();
  await page.waitForFunction(() => window.__riverGeneratedInteriors?.()[0]?.ready, null, { timeout: 30000 });
  const returnMs = performance.now() - returnStart;
  const afterReturn = await page.evaluate(() => window.__riverRenderAudit.graphics().memory);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption({ label: 'Laura Rathe Fine Art' });
  await page.locator('#visit-destination').click();
  await page.waitForFunction(() => window.__riverGeneratedInteriors?.()[0]?.ready, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator('#enter-destination').click();
  await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside, null, { timeout: 10000 });
  await page.screenshot({ path: 'output/playwright/generated-gallery-reduced-motion.png' });
  if (errors.length) throw new Error(errors.join('; '));
  return { passed: true, coldMs, returnMs, initial, evicted, render, afterEviction, afterReturn,
    hardware: 'Local Chromium on this Mac', scope: 'One local authenticated client; frame intervals and main-thread update/render cost include host load. GPU memory and target-hardware acceptance remain open.' };
}
