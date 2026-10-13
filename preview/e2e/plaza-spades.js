async page => {
  // Spades at the plaza café table: the café sheet switches from dominoes to Spades;
  // a seeded hand is bid and played to its end with your partner and two regulars
  // through the real controls; the table shows the cards; the partnership scores
  // carry the hand; switching to Hearts keeps the cards on the table for the new game.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const spades = () => bounded('Reading the Spades game', page.evaluate(() => { const { deal, ...state } = window.__riverPlazaSpades(); return state; }), 20000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaSpades?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-round-2:0';
  check((await bounded('Walking to the café table', page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair), 90000)).ok, 'Arrived beside the café table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#dominoes-panel[open]').waitFor();
  await page.locator('#dominoes-panel [data-cafe-game=spades]').click();
  await page.locator('#spades-panel[open]').waitFor();
  check(!await page.locator('#dominoes-panel').evaluate(panel => panel.open), 'Switching to Spades puts the dominoes away');
  // The walking controls relabel X on their next frame: wait for it rather than read it at once.
  const relabelled = await page.waitForFunction(() => /Hide the cards/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 }).then(() => true, () => false);
  check((await spades()).cafeGame === 'spades' && relabelled, 'X now toggles the card table');
  check(await page.locator('#spades-panel [data-cafe-game]').count() === 3, 'The café switch offers dominoes, Hearts and Spades');

  // The first hand: the dealer sits on your right, so you bid first.
  await bounded('Dealing a seeded hand', page.evaluate(() => window.__riverPlazaSpades().deal(21)), 20000);
  let state = await spades();
  check(state.phase === 'bid' && state.turn === 0 && state.cards.length === 13, 'A new hand starts with your bid');
  check(await page.locator('#spades-panel .spades-bids').isVisible() && await page.locator('#spades-panel [data-spades-bid]').count() === 14, 'Bids from nil to thirteen are offered');
  await page.locator('#spades-panel [data-spades-bid="3"]').click();
  await named('Waiting for the regulars to bid', page.waitForFunction(() => { const s = window.__riverPlazaSpades(); return s.phase === 'play' && !s.playing; }, null, { timeout: 30000 }));
  state = await spades();
  check(state.bids[0] === 3 && state.bids.every(bid => Number.isInteger(bid)), `Everyone has bid (${state.bids.join(', ')})`);
  check(!await page.locator('#spades-panel .spades-bids').isVisible(), 'The bids put themselves away once everyone has bid');

  // Play the hand out: always a legal card, through the hand's own buttons.
  let plays = 0;
  for (let turn = 0; turn < 200; turn++) {
    state = await spades();
    if (state.over) break;
    if (state.turn !== 0 || state.playing || !state.legal.length) { await page.waitForTimeout(150); continue; }
    if (plays === 0) check(await page.locator('#spades-panel .hearts-hand [data-legal]').count() === state.legal.length, 'Only legal cards are offered');
    await page.locator(`#spades-panel .hearts-hand [data-card="${state.legal[0]}"]`).click();
    await named('Waiting for the trick to come round', page.waitForFunction(count => { const s = window.__riverPlazaSpades(); return s.over || (s.moves.length > count && s.turn === 0 && !s.playing); }, state.moves.length, { timeout: 30000 }));
    if (++plays === 2) {
      check((await spades()).table.backs > 0, 'The café table shows the hands face down');
      await page.screenshot({ path: 'output/playwright/plaza-spades-play.png' });
    }
  }
  state = await spades();
  check(Boolean(state.over) && plays === 13, `The hand is played to its end (${plays} of your cards)`);
  check(state.taken.reduce((sum, n) => sum + n, 0) === 13, `Thirteen tricks (${state.taken.join(', ')})`);
  check(state.totals[0].score === state.over[0].points && state.totals[1].score === state.over[1].points, `The partnership scores carry the hand (${state.totals.map(team => team.score).join(' to ')})`);
  check(/made|set/.test(state.status), `The status reports the bids (${state.status})`);
  await page.screenshot({ path: 'output/playwright/plaza-spades-hand.png' });
  await page.locator('#spades-panel [data-spades-action=next]').click();
  await named('Waiting for your bid in the next hand', page.waitForFunction(() => { const s = window.__riverPlazaSpades(); return s.phase === 'bid' && s.turn === 0 && !s.playing; }, null, { timeout: 30000 }));
  state = await spades();
  check(state.dealer === 0 && state.bids[0] === null && [1, 2, 3].every(player => Number.isInteger(state.bids[player])), 'The deal moves on: you deal, so the others bid before you');

  // Over to Hearts: the card table stays, showing the Hearts hand instead.
  await page.locator('#spades-panel [data-cafe-game=hearts]').click();
  await page.locator('#hearts-panel[open]').waitFor();
  check(!await page.locator('#spades-panel').evaluate(panel => panel.open), 'Switching to Hearts puts Spades away');
  await page.keyboard.press('Escape');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  check(await page.locator('#walking-play').isHidden(), 'Standing up leaves the café table');
  return { checks };
}
