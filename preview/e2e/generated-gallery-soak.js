async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const minutes = Number(process.env.RIVER_OAKS_GALLERY_SOAK_MINUTES ?? 5);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10) throw new Error('Choose 1–10 gallery soak minutes');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1&render-audit=1');
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
  if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  if (await page.locator('.visit-tools[open] > .visit-tools-toggle').count()) await page.locator('.visit-tools[open] > .visit-tools-toggle').click();
  await page.evaluate(() => document.querySelector('[data-quality="sharp"]').click());
  await page.waitForTimeout(3000);
  const initialCull = await page.evaluate(() => window.__riverExteriorCull());
  if (!initialCull.cull) throw new Error(`Soak camera does not face an opaque generated room wall: ${JSON.stringify(initialCull)}`);
  await page.screenshot({ path: 'output/playwright/generated-gallery-soak.png' });

  const samples = [];
  for (let minute = 1; minute <= minutes; minute++) {
    await page.evaluate(() => window.__riverRenderAudit.start());
    await page.waitForTimeout(60000);
    const sample = await page.evaluate(() => {
      const { frames, overflow } = window.__riverRenderAudit.stop();
      const percentile = (values, fraction) => {
        const ordered = values.toSorted((a, b) => a - b);
        return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))];
      };
      const intervals = frames.map(frame => frame.intervalMs);
      const cpu = frames.map(frame => frame.cpuMs);
      const multiplayer = window.__riverMultiplayer();
      const self = multiplayer.snapshot.players.find(player => player.id === multiplayer.selfId);
      return { frames: frames.length, overflow,
        intervalMs: { p50: percentile(intervals, .5), p95: percentile(intervals, .95), p99: percentile(intervals, .99) },
        mainThreadMs: { p95: percentile(cpu, .95), p99: percentile(cpu, .99) },
        graphics: window.__riverRenderAudit.graphics(), heapBytes: performance.memory?.usedJSHeapSize ?? null,
        levelId: self?.levelId, inside: document.querySelector('#walking-hud')?.dataset.inside,
        cull: window.__riverExteriorCull().cull };
    });
    if (sample.overflow || sample.frames < 100 || !sample.inside || !sample.cull || !sample.levelId)
      throw new Error(`Incomplete minute ${minute} of gallery soak: ${JSON.stringify(sample)}`);
    samples.push({ minute, ...sample });
  }
  if (errors.length) throw new Error(errors.join('; '));
  return { passed: true, samples,
    scope: `${minutes} one-minute local Chromium samples at 1440x900 Sharpest, one authenticated stationary ground-floor client facing the opaque gallery wall. Records p95/p99 and resource counters; no host-sensitive threshold, physical GPU memory, moving-camera, target-device, or human visual acceptance.` };
}
