async page => {
  const { watchCartierErrors, assertCartierRender } = await import('./cartier-pilot-checks.js');
  const errors = watchCartierErrors(page);
  await page.goto('http://127.0.0.1:5173/e2e/fixtures/cartier-pilot.html');
  await page.waitForFunction(() => Boolean(window.cartierReview));
  const captures = [], performance = [];
  for (const hour of [15, 19]) for (const view of ['entrance', 'display']) for (const pilot of [false, true]) {
    const stats = await page.evaluate(options => window.cartierReview.show(options), { pilot, view, hour });
    assertCartierRender(errors, stats.glError);
    if (stats.names.some(name => name.startsWith('cartier-')) !== pilot) throw new Error('Finish selection must match the comparison mode');
    const path = `output/playwright/cartier-${pilot ? 'pilot' : 'baseline'}-${view}-${hour}.png`;
    await page.locator('canvas').screenshot({ path }); captures.push({ ...stats, path });
    if (hour === 15 && view === 'entrance') performance.push({ pilot, ...await page.evaluate(() => window.cartierReview.sample()) });
  }
  // Reverse order to expose shader/cache or ordering effects in the local comparison.
  for (const pilot of [true, false]) {
    await page.evaluate(pilot => window.cartierReview.show({ pilot }), pilot);
    performance.push({ pilot, ...await page.evaluate(() => window.cartierReview.sample()) });
  }
  await page.evaluate(() => window.cartierReview.dispose());
  assertCartierRender(errors, 0);
  return { captures, performance, performanceScope: 'Isolated single-room 1600x1000 local Chromium frame intervals and CPU submission, not whole-world or target-GPU acceptance', absoluteP95TargetMs: 18.5, performanceAccepted: performance.filter(item => item.pilot).every(item => item.p95_ms <= 18.5), night: '19:00 dusk only; true night is outside the current world clock', errors };
}
