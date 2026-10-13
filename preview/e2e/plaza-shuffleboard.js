async page => {
  // Shuffleboard on the long café table: standing at the west end, X opens wine pong and
  // its switch sets out shuffleboard (the glasses put away, the pucks shown); the line is
  // stopped once for the aim and once for the power (held still by the test hook), the
  // puck slides to rest in the far zone on the sheet and the real table; the regular
  // answers; X then reopens shuffleboard, the last game played, and switching back
  // brings the glasses out again.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  // page.evaluate has no timeout of its own: bound each in-page wait so a stall fails with its name.
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the shuffleboard game', page.evaluate(() => { const { hold, reset, ...state } = window.__riverPlazaShuffleboard(); return state; }), 20000);
  const yourTurn = () => named('Waiting for your turn', page.waitForFunction(() => { const s = window.__riverPlazaShuffleboard(); return !s.thinking && !s.sliding && s.turn === 0 && s.winner === null; }, null, { timeout: 30000 }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverPlazaWinePong?.() && window.__riverPlazaShuffleboard?.(), null, { timeout: 90000 });
  check((await bounded('Walking to the west end of the table', page.evaluate(() => window.__riverPlazaWinePong().goTo(0)), 90000)).ok, 'Arrived at the west end of the long table');
  await page.waitForFunction(() => /Play wine pong/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#wine-pong-panel[open]').waitFor();
  await page.locator('#wine-pong-panel [data-long-game="shuffleboard"]').click();
  await page.locator('#shuffleboard-panel[open]').waitFor();
  check(!await page.locator('#wine-pong-panel').evaluate(panel => panel.open), 'The switch puts wine pong away and opens shuffleboard');
  let state = await game();
  check(state.longTableGame === 'shuffleboard' && state.pucksShown === true && state.glassesShown === false, 'The table\'s glasses are put away and its pucks set out');
  check(await page.locator('#shuffleboard-panel').evaluate(panel => !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)), 'The shuffleboard sheet is a frame, never its own scroll container');
  check(await page.locator('#shuffleboard-panel [data-long-game="shuffleboard"]').getAttribute('aria-pressed') === 'true', 'The switch shows Shuffleboard chosen');

  await bounded('Starting a fresh game', page.evaluate(() => window.__riverPlazaShuffleboard().reset()), 20000);
  await yourTurn();
  state = await game();
  check(state.side === 0 && state.round === 1 && state.table === 0 && state.throws === 0, `A fresh game, nothing on the table (${state.table} pucks)`);
  check(await page.evaluate(() => document.activeElement?.dataset.shuffleAction === 'throw'), 'Focus is on the throw button, so Space throws');
  check(/Stop the line for the aim/.test(state.status), `The sheet asks for the aim (${state.status})`);

  // A straight slide to rest at 2.3 m, in the far zone: hold the line on the aim, press; then on its power, press.
  const power = await page.evaluate(async () => { const { powerFor } = await import('/src/shuffleboard-rules.js'); return powerFor(2.3); });
  await page.evaluate(() => window.__riverPlazaShuffleboard().hold(0.5));
  await page.keyboard.press('Space');
  state = await game();
  check(state.phase === 'power' && Math.abs(state.aim - 0.5) < 0.002, 'The first press locks the aim');
  await page.evaluate(value => window.__riverPlazaShuffleboard().hold(value), power);
  await page.keyboard.press('Space');
  await named('Waiting for the puck to slide', page.waitForFunction(() => window.__riverPlazaShuffleboard().sliding, null, { timeout: 5000 }));
  check(true, 'The puck slides on the sheet and the real table');
  await named('Waiting for the first puck to rest', page.waitForFunction(() => window.__riverPlazaShuffleboard().throws >= 1 && !window.__riverPlazaShuffleboard().sliding, null, { timeout: 15000 }));
  state = await game();
  check(state.throws === 1 ? state.last?.player === 0 && !state.last.rest.out && Math.abs(state.last.rest.u - 2.3) < 0.02 && state.table === 1 : state.throws >= 1,
    `The puck rests in the far zone on the sheet and the table (${state.last?.rest?.u?.toFixed(3)} m, ${state.table} on the table)`);
  check(await page.locator('#shuffleboard-panel [data-shuffle-puck].shuffle-puck-0').count() === 1, 'The sheet draws your puck');
  const fits = await page.evaluate(() => {
    const panel = document.querySelector('#shuffleboard-panel').getBoundingClientRect();
    return [...document.querySelectorAll('#shuffleboard-panel .shuffle-scores li, #shuffleboard-panel .shuffle-table, #shuffleboard-panel [data-shuffle-action=throw]')]
      .every(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.left >= panel.left - 1 && box.right <= panel.right + 1; });
  });
  check(fits, 'The scores, the table and the throw button sit inside the sheet');
  await page.screenshot({ path: 'output/playwright/plaza-shuffleboard.png' });

  await yourTurn();
  state = await game();
  check(state.throws === 2 && state.thrown.join() === '1,1', `The regular answered with a puck of its own (${state.thrown.join()})`);
  check(state.table === state.pucks, `The table shows every puck still on (${state.table})`);
  check(await page.evaluate(() => document.activeElement?.dataset.shuffleAction === 'throw'), 'Focus stays on the throw button through both slides');

  // Away and back: X reopens the last game played; the switch brings the glasses out again.
  await page.keyboard.press('Escape');
  check(!await page.locator('#shuffleboard-panel').evaluate(panel => panel.open), 'Escape puts the table away');
  await page.waitForFunction(() => /Play shuffleboard/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#shuffleboard-panel[open]').waitFor();
  check((await game()).throws === 2, 'X reopens shuffleboard, the game where it was');
  await page.locator('#shuffleboard-panel [data-long-game="winePong"]').click();
  await page.locator('#wine-pong-panel[open]').waitFor();
  state = await game();
  check(state.longTableGame === 'winePong' && state.pucksShown === false && state.glassesShown === true, 'Switching back sets the glasses out and puts the pucks away');
  await page.keyboard.press('Escape');
  check((await bounded('Walking away', page.evaluate(() => window.__riverSeatAndWater().goTo(-2800.2, -1298.4)), 60000))?.ok !== false, 'Walked away from the table');
  await page.waitForFunction(() => !/wine pong|shuffleboard/i.test(document.querySelector('#walking-play')?.textContent ?? '') || document.querySelector('#walking-play')?.hidden, null, { timeout: 15000 });
  check(true, 'Away from its ends, the table offers nothing');
  return { checks };
}
