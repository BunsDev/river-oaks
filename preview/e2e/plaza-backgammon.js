async page => {
  // Backgammon at the plaza's backgammon table: seated, X opens the board; a seeded game
  // is played through the board itself (pick a checker, then its point), with Undo, until
  // the turn passes; the table's checkers mirror the game; Escape and standing up end it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  // page.evaluate has no timeout of its own: bound each in-page wait so a stall fails with its name.
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the backgammon game', page.evaluate(() => { const { deal, ...state } = window.__riverPlazaBackgammon(); return state; }), 20000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaBackgammon?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-backgammon-0:0';
  check((await bounded('Walking to the backgammon table', page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair), 90000)).ok, 'Arrived beside the backgammon table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.waitForFunction(() => /Play backgammon/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 });
  check(await page.locator('#walking-play').evaluate(button => button.parentElement.classList.contains('walking-primary')), 'At the backgammon table, Play backgammon (X) is the primary action');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#backgammon-panel[open]').waitFor();
  check(await page.locator('#backgammon-panel').evaluate(panel => !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)), 'The backgammon sheet is a frame, never its own scroll container');

  await bounded('Dealing a seeded game', page.evaluate(() => window.__riverPlazaBackgammon().deal(8)), 20000);
  await page.waitForFunction(() => { const s = window.__riverPlazaBackgammon(); return !s.thinking && s.turn === s.player && s.legal.length > 0; }, null, { timeout: 30000 });
  let state = await game();
  check(state.table === 30 && state.player === 0, `The table shows all thirty checkers, and you play white (${state.table})`);
  check(/You rolled/.test(state.status), `The status reads your roll (${state.status})`);

  // One move, undone: the board returns to the start of the turn.
  const before = state.points.join();
  let [from, to] = state.legal[0].split('-');
  await page.locator(`#backgammon-panel [data-point="${from === 'bar' ? 'bar-0' : from}"]`).click();
  check(await page.locator('#backgammon-panel [data-target]').count() >= 1, 'A chosen checker shows where it can go');
  await page.locator(`#backgammon-panel [data-point="${to}"]`).click();
  state = await game();
  check(state.moves.length >= 1 && state.points.join() !== before, 'The checker moves');
  if (state.turn === 0 && !state.thinking && state.moves.length) {
    await page.locator('#backgammon-panel [data-action=undo]').click();
    state = await game();
    check(state.points.join() === before, 'Undo takes the move back');
  }

  // Play the rest of the turn through the board, until the regular has the dice.
  for (let step = 0; step < 6; step++) {
    state = await game();
    if (state.turn !== 0 || state.thinking || !state.legal.length) break;
    [from, to] = state.legal[0].split('-');
    await page.locator(`#backgammon-panel [data-point="${from === 'bar' ? 'bar-0' : from}"]`).click();
    await page.locator(`#backgammon-panel [data-point="${to}"]`).click();
  }
  await page.waitForFunction(() => { const s = window.__riverPlazaBackgammon(); return s.over || s.turn === 1 || s.thinking; }, null, { timeout: 10000 });
  await page.waitForFunction(() => { const s = window.__riverPlazaBackgammon(); return s.over || (s.turn === 0 && !s.thinking); }, null, { timeout: 30000 });
  state = await game();
  check(state.moves.length >= 3, `The regular answered with its roll (${state.moves.length} moves so far)`);
  check(state.table === 30, 'The table still shows every checker');
  await page.screenshot({ path: 'output/playwright/plaza-backgammon.png' });

  await page.keyboard.press('Escape');
  check(!await page.locator('#backgammon-panel').evaluate(panel => panel.open), 'Escape puts the board away');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  check(await page.locator('#walking-play').isHidden(), 'Standing up leaves the backgammon table');
  return { checks };
}
