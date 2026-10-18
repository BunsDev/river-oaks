async page => {
  // Wine pong at the long café table: standing at the west end, X opens the table. Held
  // arrows aim (left is to the thrower's left) and set the distance; a click on a glass
  // aims at it; held still on a sure sink by the test hook, Space throws and the glass
  // goes down on the sheet and the real table. Reposition keeps the game open while the
  // visitor walks along the end (and off it), and X carries on from the new stance; the
  // regular throws twice; an overthrow misses; Escape and walking away end it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  // page.evaluate has no timeout of its own: bound each in-page wait so a stall fails with its name.
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the wine pong game', page.evaluate(() => { const { steadyAt, deal, goTo, reposition, resume, pointAt, ...state } = window.__riverPlazaWinePong(); return state; }), 20000);
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
  check(/Aim and set the distance/.test(state.status), `The sheet asks for the throw (${state.status})`);

  // Held keys: left aims to the thrower's left (screen left), up carries the ball further.
  const mark = () => page.locator('#wine-pong-panel .wine-pong-table .pong-target').evaluate(node => [Number(node.getAttribute('cx')), Number(node.getAttribute('cy'))]);
  await page.evaluate(() => window.__riverPlazaWinePong().steadyAt(0.5, 0.5));
  const centred = await mark();
  for (let tap = 0; tap < 5; tap++) await page.keyboard.press('ArrowLeft');
  state = await game();
  check(state.aim >= 0.55 - 1e-6 && state.aim < 0.6, `Five taps left step the aim (${state.aim.toFixed(3)})`);
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(700); await page.keyboard.up('ArrowUp');
  state = await game();
  const moved = await mark();
  check(state.power > 0.55 && moved[0] < centred[0] - 5 && moved[1] < centred[1] - 5, `Left and a held up move the landing mark left and further (${state.aim.toFixed(2)}, ${state.power.toFixed(2)})`);
  // A click on the apex glass aims at it.
  const sure = await page.evaluate(async () => { const { aimAt, glassAt } = await import('/src/wine-pong-rules.js'); return aimAt(0, glassAt(1, 5), window.__riverPlazaWinePong().origin); });
  await page.locator('#wine-pong-panel .wine-pong-table [data-pong-glass="1-5"]').click();
  state = await game();
  check(Math.abs(state.aim - sure.aim) < 0.01 && Math.abs(state.power - sure.power) < 0.01, `A click on a glass aims there (${state.aim.toFixed(3)}, ${state.power.toFixed(3)} for ${sure.aim.toFixed(3)}, ${sure.power.toFixed(3)})`);
  check(await page.evaluate(() => document.activeElement?.dataset.pongAction === 'throw'), 'The throw button keeps focus after the click');

  // A sure sink at the apex glass: the hand held still on it, Space throws.
  await page.evaluate(([aim, power]) => window.__riverPlazaWinePong().steadyAt(aim, power), [sure.aim, sure.power]);
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

  // Reposition: the sheet stays open and the world takes the keys. The launch follows the
  // visitor along the end; stepping off it waits for them instead of ending the game.
  await page.locator('#wine-pong-panel [data-pong-action="reposition"]').click();
  state = await game();
  check(await page.locator('#wine-pong-panel').evaluate(panel => panel.open) && state.repositioning && /Walk along your end/.test(state.status), `Reposition keeps the game open (${state.status})`);
  check(await page.evaluate(() => !document.querySelector('#wine-pong-panel').contains(document.activeElement)), 'The world has the keys to walk');
  await named('Waiting for X to offer Resume', page.waitForFunction(() => /Resume wine pong/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 10000 }));
  check(true, 'X now resumes the game');
  // Travel is the town's to grant and has a short cooldown, so a refused walk waits and tries once more.
  let refusal = null;
  const walkTo = async (label, [u, v]) => {
    const point = await page.evaluate(([a, b]) => window.__riverPlazaWinePong().pointAt(a, b), [u, v]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await bounded(label, page.evaluate(([x, n]) => window.__riverSeatAndWater().goTo(x, n), point), 60000);
      if (result?.ok !== false) return true;
      refusal = result?.message ?? result?.error ?? 'refused'; await page.waitForTimeout(1300);
    }
    return false;
  };
  check(await walkTo('Walking sideways along the west end', [-1.7, 0.6]), 'Walked to a lateral release point');
  await named('Waiting for the launch to follow', page.waitForFunction(() => (window.__riverPlazaWinePong().origin?.[1] ?? 0) > 0.4, null, { timeout: 10000 }));
  check(true, 'The launch on the sheet follows the visitor while repositioning');
  // Off the throwing end but still at the table: the first of these spots a walk reaches.
  let stepped = null;
  for (const spot of [[-2.85, 0], [-2.8, -0.5], [-1.7, -1.45], [-1.7, 1.45]]) if (await walkTo('Stepping off the end', spot)) { stepped = spot; break; }
  check(stepped, `Stepped off the end of the table (${stepped ?? refusal})`);
  await named('Waiting for the walk-back prompt', page.waitForFunction(() => window.__riverPlazaWinePong().away, null, { timeout: 10000 }));
  state = await game();
  check(state.open && state.throws.length === 1 && /Walk back to the west end/.test(state.status), `Off the end, the game waits instead of closing (${state.status})`);
  check(await walkTo('Walking back to the lateral point', [-1.7, 0.6]), 'Walked back to the end');
  await named('Waiting to be back at the end', page.waitForFunction(() => !window.__riverPlazaWinePong().away, null, { timeout: 10000 }));
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await named('Waiting to resume', page.waitForFunction(() => !window.__riverPlazaWinePong().repositioning, null, { timeout: 5000 }));
  state = await game();
  check(state.open && state.throws.length === 1 && state.glasses[1] === 5 && state.origin[1] > 0.4, `X resumes the same game from the new physical stance (${state.origin})`);
  check(await page.evaluate(() => document.activeElement?.dataset.pongAction === 'throw'), 'Resuming puts the keys back on the throw');

  // Second throw: an overthrow off the far end misses, then the regular throws twice.
  await page.evaluate(() => window.__riverPlazaWinePong().steadyAt(0.5, 1));
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
