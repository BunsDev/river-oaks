async page => {
  // Hearts at the plaza café table: the café sheet switches from dominoes to Hearts; a
  // seeded hand is passed and played to its end against three regulars through the
  // real controls; the table shows the cards; switching back clears them.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const hearts = () => page.evaluate(() => { const { deal, ...state } = window.__riverPlazaHearts(); return state; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaHearts?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-round-2:0';
  check((await page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair)).ok, 'Arrived beside the café table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.waitForFunction(() => /Play dominoes/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#dominoes-panel[open]').waitFor();
  await page.locator('#dominoes-panel [data-cafe-game=hearts]').click();
  await page.locator('#hearts-panel[open]').waitFor();
  check(!await page.locator('#dominoes-panel').evaluate(panel => panel.open), 'Switching to Hearts puts the dominoes away');
  check((await hearts()).cafeGame === 'hearts' && await page.locator('#walking-play').textContent().then(text => /Hide the cards/.test(text)), 'X now toggles the card table');

  // Hand 0 passes left: choose three cards, pass, and the 2♣ holder leads.
  await page.evaluate(() => window.__riverPlazaHearts().deal(17, 0));
  let state = await hearts();
  check(state.phase === 'pass' && state.direction === 'left' && state.cards.length === 13, 'A new hand starts with passing to the left');
  check(await page.locator('#hearts-panel [data-action=pass]').isDisabled(), 'Passing waits for three chosen cards');
  for (const card of state.cards.slice(-3)) await page.locator(`.hearts-hand [data-card="${card}"]`).click();
  check(await page.locator('#hearts-panel [data-action=pass]').isEnabled() && await page.locator('.hearts-hand [data-selected]').count() === 3, 'Three chosen cards can be passed');
  const given = state.cards.slice(-3);
  await page.locator('#hearts-panel [data-action=pass]').click();
  await page.waitForFunction(() => window.__riverPlazaHearts().phase === 'play', null, { timeout: 15000 });
  state = await hearts();
  check(given.every(card => !state.cards.includes(card)) && state.sizes.every(size => size <= 13), 'The passed cards have left your hand');

  // Play the hand out: always a legal card, through the hand's own buttons.
  let plays = 0;
  for (let turn = 0; turn < 200; turn++) {
    state = await hearts();
    if (state.over) break;
    if (state.turn !== 0 || state.playing || !state.legal.length) { await page.waitForTimeout(150); continue; }
    if (plays === 2) check(await page.locator('.hearts-hand [data-legal]').count() === state.legal.length, 'Only legal cards are offered');
    await page.locator(`.hearts-hand [data-card="${state.legal[0]}"]`).click();
    await page.waitForFunction(count => { const s = window.__riverPlazaHearts(); return s.over || (s.moves.length > count && s.turn === 0 && !s.playing); }, state.moves.length, { timeout: 30000 });
    if (++plays === 2) {
      const table = (await hearts()).table;
      check(table.backs > 0, `The café table shows the hands face down (${JSON.stringify(table)})`);
      await page.screenshot({ path: 'output/playwright/plaza-hearts-play.png' });
    }
  }
  state = await hearts();
  check(Boolean(state.over) && plays >= 2, `The hand is played to its end (${plays} of your cards)`);
  const total = state.over.points.reduce((sum, value) => sum + value, 0);
  check(total === 26 || (state.over.moon !== null && total === 78), `Thirteen hearts and the queen: ${state.over.points.join(', ')}`);
  check(state.scores.join() === state.over.points.join(), 'The game scores carry the hand');
  check(/point|moon/.test(state.status), `The status reports your points (${state.status})`);
  await page.screenshot({ path: 'output/playwright/plaza-hearts-hand.png' });
  await page.locator('#hearts-panel [data-action=next]').click();
  state = await hearts();
  check(state.hand === 1 && state.direction === 'right' && state.phase === 'pass', 'The next hand passes to the right');

  // Back to dominoes: the cards leave the table.
  await page.locator('#hearts-panel [data-cafe-game=dominoes]').click();
  await page.locator('#dominoes-panel[open]').waitFor();
  check((await hearts()).table.backs === 0 && !await page.locator('#hearts-panel').evaluate(panel => panel.open), 'Switching back clears the cards from the table');
  await page.keyboard.press('Escape');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  check(await page.locator('#walking-play').isHidden(), 'Standing up leaves the café table');
  return { checks };
}
