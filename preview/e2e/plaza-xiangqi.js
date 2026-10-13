async page => {
  // Xiangqi at the grove table: seated, X opens the table on mancala; the switch sets out
  // the xiangqi board and puts the mancala board away; Enter chooses a cannon from the
  // keyboard and marks where it can go, and a click plays the central cannon; the regular
  // answers from the worker; the table's pieces follow; X reopens xiangqi, the last game
  // played; switching back restores the mancala board; standing up ends it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the xiangqi game', page.evaluate(() => { const { reset, ...state } = window.__riverPlazaXiangqi(); return state; }), 20000);
  const yourTurn = () => named('Waiting for your turn', page.waitForFunction(() => { const s = window.__riverPlazaXiangqi(); return !s.thinking && s.turn === s.you && !s.winner && !s.draw; }, null, { timeout: 30000 }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaXiangqi?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-grove-1:0';
  check((await bounded('Walking to the grove table', page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair), 90000)).ok, 'Arrived beside the grove table');
  await named('Waiting to be offered a seat', page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 }));
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await named('Waiting to sit', page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 }));
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#mancala-panel[open]').waitFor();
  await page.locator('#mancala-panel [data-grove-game=xiangqi]').click();
  await page.locator('#xiangqi-panel[open]').waitFor();
  let state = await game();
  check(!await page.locator('#mancala-panel').evaluate(panel => panel.open) && state.groveGame === 'xiangqi', 'The switch puts mancala away and opens xiangqi');
  check(state.boardShown === true && state.mancalaShown === false && state.gobanShown === false && state.table === 32, `The table sets out the xiangqi board and its 32 pieces (${state.table})`);
  check(await page.locator('#xiangqi-panel').evaluate(panel => !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)), 'The sheet is a frame, never its own scroll container');
  await named('Waiting for X to relabel', page.waitForFunction(() => /Hide the xiangqi board/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 }));

  await bounded('Starting afresh', page.evaluate(() => window.__riverPlazaXiangqi().reset()), 20000);
  await yourTurn();
  state = await game();
  check(state.you === 'r' && state.plies === 0 && /Choose a piece/.test(state.status), `You play red, first (${state.status})`);
  check(await page.evaluate(() => document.activeElement?.dataset.xqPoint === 'b2'), 'Focus starts on your cannon');
  await page.keyboard.press('Enter');
  state = await game();
  check(state.selected === 'b2' && state.reach.includes('e2') && state.reach.includes('b9'), `Enter chooses the cannon and marks its moves, the capture over the screen too (${state.reach.length})`);
  await page.keyboard.press('ArrowRight');
  check(await page.evaluate(() => document.activeElement?.dataset.xqPoint === 'c2'), 'Arrow keys move between points');
  // Choose the other cannon and play it to the centre.
  await page.locator('#xiangqi-panel [data-xq-point="h2"]').click();
  state = await game();
  check(state.selected === 'h2', 'Clicking another piece chooses it instead');
  await page.locator('#xiangqi-panel [data-xq-point="e2"]').click();
  state = await game();
  check(state.moves[0] === 'h2e2' && state.table === 32, `The central cannon is played on the sheet and the table (${state.moves[0]})`);
  const fits = await page.evaluate(() => {
    const panel = document.querySelector('#xiangqi-panel').getBoundingClientRect(), box = document.querySelector('#xiangqi-panel .xq-board').getBoundingClientRect();
    return box.width > 0 && box.left >= panel.left - 1 && box.right <= panel.right + 1;
  });
  check(fits, 'The board sits inside the sheet');
  await yourTurn();
  state = await game();
  check(state.plies === 2 && state.table === 32, `The regular answered (${state.moves[1]})`);
  await page.screenshot({ path: 'output/playwright/plaza-xiangqi.png' });
  check(await page.evaluate(() => document.querySelector('#xiangqi-panel').contains(document.activeElement)), 'Focus stays in the board through the reply');

  // Away and back: X reopens the last game played; the switch brings mancala back.
  await page.keyboard.press('Escape');
  check(!await page.locator('#xiangqi-panel').evaluate(panel => panel.open), 'Escape puts the board away');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#xiangqi-panel[open]').waitFor();
  check((await game()).plies === 2, 'X reopens xiangqi, the game where it was');
  await page.locator('#xiangqi-panel [data-grove-game=mancala]').click();
  await page.locator('#mancala-panel[open]').waitFor();
  state = await game();
  check(state.boardShown === false && state.mancalaShown === true && state.groveGame === 'mancala', 'Switching back sets the mancala board out again');
  await page.keyboard.press('Escape');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await named('Waiting to stand', page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 }));
  await page.waitForTimeout(400);
  // Standing up can land at the darts line, which rightly offers darts: what matters is
  // that the grove table itself no longer offers its games.
  const offer = await page.locator('#walking-play').isVisible() ? (await page.locator('#walking-play').textContent()).trim() : '';
  check(!/mancala|\bGo\b|Chinese checkers|xiangqi/i.test(offer), `Standing up leaves the grove table (${offer || 'nothing offered'})`);
  return { checks };
}
