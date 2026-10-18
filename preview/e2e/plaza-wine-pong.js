async page => {
  // Wine pong at the long café table: standing at the west end, X opens the table; the
  // reticle is stopped once for the aim and once for the power (held still by the test
  // hook at a sure sink), the glass goes down on the sheet and the real table; the
  // regular throws twice from the far end; an overthrow misses; Escape and walking
  // away end it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  // page.evaluate has no timeout of its own: bound each in-page wait so a stall fails with its name.
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the wine pong game', page.evaluate(() => { const { hold, deal, goTo, ...state } = window.__riverPlazaWinePong(); return state; }), 20000);
  const yourTurn = () => named('Waiting for your turn', page.waitForFunction(() => { const s = window.__riverPlazaWinePong(); return !s.thinking && !s.flying && s.turn === s.side && s.winner === null; }, null, { timeout: 30000 }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverPlazaWinePong?.(), null, { timeout: 90000 });
  check((await bounded('Walking to the west end of the table', page.evaluate(() => window.__riverPlazaWinePong().goTo(0)), 90000)).ok, 'Arrived at the west end of the wine pong table');
  await page.waitForFunction(() => /Play wine pong/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 15000 });
  check(await page.locator('#walking-play').evaluate(button => button.parentElement.classList.contains('walking-primary')), `Standing at the table, Play wine pong (X) is the primary action; pose ${JSON.stringify((await game()).standing)}`);
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#wine-pong-panel[open]').waitFor();
  check(await page.locator('#wine-pong-panel').evaluate(panel => !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)), 'The wine pong sheet is a frame, never its own scroll container');

  await bounded('Dealing a seeded game', page.evaluate(() => window.__riverPlazaWinePong().deal(4)), 20000);
  await yourTurn();
  let state = await game();
  check(state.side === 0 && state.table === 12 && state.glasses.join() === '6,6', `Two full racks on the table (${state.table} glasses)`);
  check(await page.evaluate(() => document.activeElement?.dataset.pongAction === 'throw'), 'Focus is on the throw button, so Space throws');
  check(/Stop the reticle to aim/.test(state.status), `The sheet asks for the aim (${state.status})`);

  // A sure sink at the apex glass: hold the reticle on its aim, press; then on its power, press.
  const sure = await page.evaluate(async () => { const { aimAt, glassAt } = await import('/src/wine-pong-rules.js'); return aimAt(0, glassAt(1, 5), window.__riverPlazaWinePong().origin); });
  await page.evaluate(value => window.__riverPlazaWinePong().hold(value), sure.aim);
  await page.keyboard.press('Space');
  state = await game();
  check(state.phase === 'power' && Math.abs(state.aim - sure.aim) < 0.002, 'The first press locks the aim');
  await page.evaluate(value => window.__riverPlazaWinePong().hold(value), sure.power);
  await page.keyboard.press('Space');
  await named('Waiting for the ball in flight', page.waitForFunction(() => window.__riverPlazaWinePong().ball, null, { timeout: 5000 }));
  check(true, 'The ball flies over the real table');
  await named('Waiting for the first throw to land', page.waitForFunction(() => window.__riverPlazaWinePong().throws.length === 1 && !window.__riverPlazaWinePong().flying, null, { timeout: 10000 }));
  state = await game();
  check(await page.evaluate(() => document.activeElement?.dataset.pongAction === 'throw'), 'Focus stays on the throw button through the flight');
  check(state.last?.result === 'in' && state.glasses[1] === 5 && state.table === 11, `In! The apex glass goes down on the sheet and the table (${state.last?.result}, ${state.table})`);
  check(state.throws[0].split(',').length === 4, 'The throw records its physical release point for replay');
  check(await page.locator('#wine-pong-panel .wine-pong-zoom').isHidden(), 'The rack close-up stays out of the throwing view until requested');
  await page.locator('#wine-pong-panel [data-pong-action="inspect"]').click();
  check(await page.locator('#wine-pong-panel .wine-pong-zoom').isVisible(), `Inspect rack reveals the temporary close-up: ${JSON.stringify(await page.locator('#wine-pong-panel .wine-pong-zoom').evaluate(node => ({ hidden: node.hidden, rect: node.getBoundingClientRect().toJSON(), display: getComputedStyle(node).display, pressed: document.querySelector('[data-pong-action=inspect]').getAttribute('aria-pressed') })))}`);
  check(await page.locator('#wine-pong-panel .wine-pong-zoom [data-pong-zoom-glass]:not(.pong-glass-down)').count() === 5, 'The close-up shows the far rack, one glass down');
  const fits = await page.evaluate(() => {
    const panel = document.querySelector('#wine-pong-panel').getBoundingClientRect();
    return [...document.querySelectorAll('#wine-pong-panel .wine-pong-scores li, #wine-pong-panel .wine-pong-table, #wine-pong-panel .wine-pong-zoom, #wine-pong-panel [data-pong-action=throw]')]
      .every(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.left >= panel.left - 1 && box.right <= panel.right + 1; });
  });
  check(fits, 'The tally, both views and the throw button sit inside the sheet');
  await page.screenshot({ path: 'output/playwright/plaza-wine-pong.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/plaza-wine-pong-mobile.png' });
  check(await page.locator('#wine-pong-panel [data-pong-action="throw"]').evaluate(button => { const box = button.getBoundingClientRect(); return box.width > 0 && box.top >= 0 && box.bottom <= innerHeight; }), 'The phone throw control remains on screen');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#wine-pong-panel [data-pong-action="inspect"]').click();
  check(await page.locator('#wine-pong-panel .wine-pong-zoom').isHidden(), 'Inspect rack returns to the unobstructed table view');

  // Reposition physically at the same end. The game and first hit remain, while the
  // next throw starts from the visitor's new lateral standing point.
  await page.locator('#wine-pong-panel [data-pong-action="reposition"]').click();
  check(!await page.locator('#wine-pong-panel').evaluate(panel => panel.open), 'Reposition returns to walking without ending the game');
  check((await bounded('Walking sideways along the west end', page.evaluate(() => window.__riverSeatAndWater().goTo(-2798.9, -1295.5)), 60000))?.ok !== false, 'Walked to a lateral release point');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#wine-pong-panel[open]').waitFor();
  state = await game();
  check(state.throws.length === 1 && state.glasses[1] === 5 && state.origin[1] > 0.4, `Game resumes from the new physical stance (${state.origin})`);

  // Second throw: an overthrow off the far end misses, then the regular throws twice.
  await page.evaluate(() => window.__riverPlazaWinePong().hold(0.5));
  await page.keyboard.press('Space');
  await page.evaluate(() => window.__riverPlazaWinePong().hold(1));
  await page.keyboard.press('Space');
  await named('Waiting for the overthrow to land', page.waitForFunction(() => window.__riverPlazaWinePong().throws.length >= 2, null, { timeout: 10000 }));
  state = await game();
  check((state.last?.result === 'miss' || state.throws.length > 2) && state.throws[1].split(',').length === 4, 'An overthrow from the new stance misses and records that origin');
  await yourTurn();
  state = await game();
  check(state.throws.length === 4, `The regular threw twice from the far end (${state.throws.length} throws)`);
  check(state.table === state.glasses[0] + state.glasses[1], 'The table shows every standing glass');

  await page.keyboard.press('Escape');
  check(!await page.locator('#wine-pong-panel').evaluate(panel => panel.open), 'Escape puts the table away');
  check((await bounded('Walking away', page.evaluate(() => window.__riverSeatAndWater().goTo(-2800.2, -1298.4)), 60000))?.ok !== false, 'Walked away from the table');
  await page.waitForFunction(() => !/wine pong/i.test(document.querySelector('#walking-play')?.textContent ?? '') || document.querySelector('#walking-play')?.hidden, null, { timeout: 15000 });
  check(true, 'Away from its ends, the table offers nothing');
  return { checks };
}
