async page => {
  // The Dior-Toulouse plaza salon in the running town: its seats are shared
  // bench places, its tables are solid, and it reads at afternoon and dusk.
  const origin = 'http://127.0.0.1:5173', check = (ok, message) => { if (!ok) throw new Error(message); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0, null, { timeout: 90000 });
  const salon = await page.evaluate(() => window.__riverSeatAndWater().seats.filter(seat => seat.id.startsWith('bench:plaza-salon-')).map(seat => seat.id));
  check(salon.length === 15, `The town lists the salon's fifteen seats (${salon.length})`);

  const hour = async value => { await page.evaluate(value => { const input = document.querySelector('#sun-hour'); input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, value); await page.waitForTimeout(1200); };
  check((await page.evaluate(() => window.__riverSeatAndWater().goTo(-2777.6, -1296.4)))?.ok, 'Walked to the plaza edge from arrival');
  await page.evaluate(() => window.__riverSeatAndWater().face(-2797, -1299.5));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'output/playwright/plaza-salon-arrival.png' });
  await hour(19);
  await page.screenshot({ path: 'output/playwright/plaza-salon-dusk.png' });
  await hour(17.5);

  // The round table is furniture, not paving: asked to stand on it, the town
  // stops the traveller beside it (travel snaps to the nearest free spot).
  await page.evaluate(() => window.__riverSeatAndWater().goTo(-2797.0, -1299.2));
  await page.waitForTimeout(1500);
  const stood = await page.evaluate(() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(player => player.id === m.selfId)?.position; });
  check(stood && Math.hypot(stood[0] + 2797.0, stood[1] + 1299.2) >= 0.8 + 0.3, `The round table is solid (stood at ${JSON.stringify(stood)})`);

  // A chess chair is a seat like any storefront bench place.
  const chair = 'bench:plaza-salon-chess-west-0:0';
  check((await page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair)).ok, 'Arrived beside the chess table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.waitForFunction(id => [...document.querySelectorAll('#nearby-seat option')].some(option => option.value === id && option.textContent.startsWith('Chess table')), chair, { timeout: 10000 });
  await page.locator('#nearby-seat').selectOption(chair).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('#walking-interact').hidden);
  if (!await page.locator('.walking-more').evaluate(more => more.open || more.hidden)) await page.locator('.walking-more summary').click();
  await page.locator('#walking-interact').click();
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.evaluate(() => window.__riverSeatAndWater().face(-2797.0, -1299.2));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'output/playwright/plaza-salon-seated.png' });
  return { seats: salon.length, seated: chair };
}
