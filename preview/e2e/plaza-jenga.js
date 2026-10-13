async page => {
  // Jenga on the curved bench: seated, X opens the tower; a block is chosen on the tower
  // itself and pulled by stopping the steady-hand meter in its safe zone; the two plaza
  // regulars take their turns; a wobble brings the tower down on the drum and the
  // paving; New tower stands it up again; Escape and standing up end it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  // page.evaluate has no timeout of its own: bound each in-page wait so a stall fails with its name.
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the Jenga game', page.evaluate(() => { const { aim, deal, ...state } = window.__riverPlazaJenga(); return state; }), 20000);
  const yourTurn = () => page.waitForFunction(() => { const s = window.__riverPlazaJenga(); return !s.thinking && s.turn === 0 && s.legal.length > 0; }, null, { timeout: 30000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaJenga?.(), null, { timeout: 90000 });
  const seat = 'bench:plaza-salon-bench:1';
  check((await bounded('Walking to the curved bench', page.evaluate(id => window.__riverSeatAndWater().goNear(id), seat), 90000)).ok, 'Arrived beside the curved bench');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => /^bench:plaza-salon-bench:/.test(window.__riverSeatAndWater().seated ?? ''), null, { timeout: 15000 });
  await page.waitForFunction(() => /Play Jenga/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 });
  check(await page.locator('#walking-play').evaluate(button => button.parentElement.classList.contains('walking-primary')), 'On the bench, Play Jenga (X) is the primary action');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#jenga-panel[open]').waitFor();
  check(await page.locator('#jenga-panel').evaluate(panel => !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)), 'The Jenga sheet is a frame, never its own scroll container');

  await bounded('Dealing a seeded game', page.evaluate(() => window.__riverPlazaJenga().deal(5)), 20000);
  await yourTurn();
  let state = await game();
  check(state.table === 54 && !state.towerFallen && state.levels === 18, `The drum shows the full tower (${state.table} blocks)`);
  check(state.players === 3 && /Your turn/.test(state.status), `You play with two regulars (${state.status})`);
  check(!state.legal.some(option => /^18/.test(option.block)), 'The top level cannot be pulled');

  // A steady pull, through the tower and the meter.
  const first = state.legal.find(option => !option.fatal).block;
  await page.locator(`#jenga-panel [data-jenga-block="${first}"]`).click();
  await page.locator('#jenga-panel .jenga-meter:not([hidden])').waitFor();
  state = await game();
  check(state.selected === first && state.meter && state.meter.width > 0.1, `Choosing a block starts the steady-hand meter (zone ${state.meter?.width})`);
  check(await page.evaluate(() => document.activeElement?.dataset.jengaAction === 'pull'), 'Focus moves to Pull, so Space or Enter pulls');
  await page.evaluate(([lo, hi]) => window.__riverPlazaJenga().aim((lo + hi) / 2), [state.meter.lo, state.meter.hi]);
  await page.locator('#jenga-panel [data-jenga-action=pull]').click();
  state = await game();
  check(state.moves.length === 1 && !state.fallen && state.levels === 19 && state.table === 54, `The block slides out and goes on top (${state.moves.join(' ')})`);

  // Both regulars take their turns, then it is yours again.
  await yourTurn();
  state = await game();
  check(state.moves.length >= 3, `The regulars took their turns (${state.moves.join(' ')})`);
  if (state.fallen) throw new Error(`A regular toppled the tower too soon for this seed: ${state.moves.join(' ')}`);
  await page.screenshot({ path: 'output/playwright/plaza-jenga.png' });

  // A wobble: stop the marker outside the zone, and the tower falls on you.
  const second = state.legal.find(option => !option.fatal).block;
  await page.locator(`#jenga-panel [data-jenga-block="${second}"]`).click();
  await page.locator('#jenga-panel .jenga-meter:not([hidden])').waitFor();
  state = await game();
  await page.evaluate(at => window.__riverPlazaJenga().aim(at), state.meter.lo > 0.1 ? 0.02 : 0.98);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__riverPlazaJenga().fallen, null, { timeout: 10000 });
  state = await game();
  check(state.towerFallen && state.table === 54 && state.losses[0] === 1, `The tower falls on the drum and paving, and it counts against you (${state.losses.join('/')})`);
  check(/The tower falls!/.test(state.status) && await page.locator('#jenga-panel [data-jenga-action=new]').isVisible(), 'The sheet says so and offers a new tower');
  // Everything the sheet shows fits inside it: the tally and the New tower button are not pushed off its edge.
  const inside = await page.evaluate(() => {
    const panel = document.querySelector('#jenga-panel').getBoundingClientRect();
    return [...document.querySelectorAll('#jenga-panel .jenga-scores li, #jenga-panel [data-jenga-action=new], #jenga-panel .jenga-tower')].every(node => {
      const box = node.getBoundingClientRect(); return box.width > 0 && box.left >= panel.left - 1 && box.right <= panel.right + 1 && node.scrollWidth <= node.clientWidth + 1;
    });
  });
  check(inside, 'The tally, the tower and New tower all sit inside the sheet');
  await page.screenshot({ path: 'output/playwright/plaza-jenga-fallen.png' });
  await page.locator('#jenga-panel [data-jenga-action=new]').click();
  await yourTurn();
  state = await game();
  check(!state.towerFallen && state.levels === 18 && state.losses[0] === 1, 'New tower stands it up again, and the tally stays');

  await page.keyboard.press('Escape');
  check(!await page.locator('#jenga-panel').evaluate(panel => panel.open), 'Escape puts the tower away');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  check(await page.locator('#walking-play').isHidden(), 'Standing up leaves the bench');
  return { checks };
}
