async page => {
  // Liar's dice at the café: the switch from dominoes sets out four cups; you open the
  // bidding through the count and face buttons; the regulars raise; when the bidding comes
  // back you call liar: the cups lift, the dice are counted and someone loses a die; the
  // next round begins; switching back to dominoes clears the cups.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the dice game', page.evaluate(() => { const { deal, ...state } = window.__riverPlazaDice(); return state; }), 20000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaDice?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-round-2:0';
  check((await bounded('Walking to the café table', page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair), 90000)).ok, 'Arrived beside the café table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#dominoes-panel[open]').waitFor();
  check(await page.locator('#dominoes-panel [data-cafe-game]').count() === 4, 'The café switch offers four games');
  await page.locator('#dominoes-panel [data-cafe-game=dice]').click();
  await page.locator('#liars-dice-panel[open]').waitFor();
  await bounded('Dealing a seeded game', page.evaluate(() => window.__riverPlazaDice().deal(4)), 20000);
  let state = await game();
  check(state.cafeGame === 'dice' && state.turn === 0 && state.cup.length === 5 && state.table.cups === 4, `Five dice under your cup, four cups on the table (${state.cup.join(' ')})`);

  // Open: two of the face you hold most of, through the stepper and the face buttons.
  const best = [2, 3, 4, 5, 6].sort((a, b) => state.cup.filter(d => d === b || d === 1).length - state.cup.filter(d => d === a || d === 1).length)[0];
  await page.locator(`#liars-dice-panel [data-dice-face="${best}"]`).click();
  while ((await game()).quantity < 2) await page.locator('#liars-dice-panel [data-dice-step="1"]').click();
  await page.locator('#liars-dice-panel [data-dice-action=bid]').click();
  state = await game();
  check(state.bids === 1 && state.bid?.quantity === 2 && state.bid.face === best, `You open with two ${best}s`);
  // The regulars raise or call; when it is yours again with a bid standing, call liar.
  await named('Waiting for the regulars', page.waitForFunction(() => { const s = window.__riverPlazaDice(); return !s.playing && (s.turn === 0 || s.winner !== null); }, null, { timeout: 60000 }));
  state = await game();
  if (state.bid && state.turn === 0) {
    const before = state.counts.reduce((a, b) => a + b, 0);
    await page.locator('#liars-dice-panel [data-dice-action=liar]').click();
    state = await game();
    check(state.reveal && state.counts.reduce((a, b) => a + b, 0) === before - 1, `You call liar: the cups lift and someone loses a die (${state.reveal?.actual} counted)`);
  }
  check(await page.locator('#liars-dice-panel .dice-reveal').isVisible() || (await game()).reveal, 'A call lifts the cups on the sheet');
  check((await game()).table.dice > 0, 'The café table shows the dice from the lifted cups');
  await page.screenshot({ path: 'output/playwright/plaza-liars-dice.png' });

  await page.locator('#liars-dice-panel [data-cafe-game=dominoes]').click();
  await page.locator('#dominoes-panel[open]').waitFor();
  state = await game();
  check(state.table.cups === 0 && state.table.dice === 0, 'Switching back clears the cups and dice from the table');
  await page.keyboard.press('Escape');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  check(await page.locator('#walking-play').isHidden(), 'Standing up leaves the café table');
  return { checks };
}
