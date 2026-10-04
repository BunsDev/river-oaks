async page => {
  // A player standing on the street regularly sees one of Jev's birds: over
  // 60 s at the default view, a bird is inside the frame, unobstructed by
  // buildings, with a readable wingspan in a good share of samples.
  const checks = [], errors = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 120000 });
  await page.waitForFunction(() => window.__riverBirds?.()?.started, null, { timeout: 30000 });
  const samples = [];
  let shot = false;
  for (let i = 0; i < 120; i++) {
    const state = await page.evaluate(() => window.__riverBirds());
    const seen = state.birds.filter(bird => bird.visible && bird.wingspanPx >= 24);
    samples.push({ seen: seen.map(bird => bird.id), companion: state.companion, best: Math.max(0, ...seen.map(bird => bird.wingspanPx)) });
    if (seen.length && !shot) { await page.screenshot({ path: 'output/playwright/birds-visible.png' }); shot = true; }
    await page.waitForTimeout(500);
  }
  const share = samples.filter(sample => sample.seen.length).length / samples.length;
  const companionShare = samples.filter(sample => sample.companion).length / samples.length;
  check(companionShare > .9, `a bird keeps the player company (${Math.round(companionShare * 100)}% of samples)`);
  check(share >= .3, `a bird is in view at 24 px or more in ${Math.round(share * 100)}% of 60 s (need 30%)`);
  check(!errors.length, `No uncaught errors: ${errors.join('; ')}`);
  return { checks, share: +share.toFixed(2), largestWingspanPx: Math.max(...samples.map(sample => sample.best)), errors };
}
