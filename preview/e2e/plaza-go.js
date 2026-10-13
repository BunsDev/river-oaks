async page => {
  // Go at the grove table: seated, X opens the table on mancala; the switch sets out the
  // goban and puts the mancala board away; a stone played on the board brings the
  // regular's reply (thought out in a worker); the goban mirrors both; switching back
  // restores the mancala board; Escape and standing up end it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the Go game', page.evaluate(() => { const { reset, ...state } = window.__riverPlazaGo(); return state; }), 20000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaGo?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-grove-1:0';
  check((await bounded('Walking to the grove table', page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair), 90000)).ok, 'Arrived beside the grove table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#mancala-panel[open]').waitFor();
  await page.locator('#mancala-panel [data-grove-game=go]').click();
  await page.locator('#go-panel[open]').waitFor();
  let state = await game();
  check(!await page.locator('#mancala-panel').evaluate(panel => panel.open) && state.groveGame === 'go', 'The switch puts mancala away and opens Go');
  check(state.goban === true && state.mancalaBoard === false, 'The table sets out the goban and puts the mancala board away');
  await named('Waiting for X to relabel', page.waitForFunction(() => /Hide the Go board/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 }));

  await bounded('Starting afresh', page.evaluate(() => window.__riverPlazaGo().reset()), 20000);
  state = await game();
  check(state.you === 'b' && state.turn === 'b' && state.stones === 0 && state.table === 0, 'An empty board, and you play black');
  await page.locator('#go-panel [data-go-point="e5"]').click();
  await named('Waiting for the regular to reply', page.waitForFunction(() => { const s = window.__riverPlazaGo(); return s.moves.length >= 2 && !s.thinking; }, null, { timeout: 90000 }));
  state = await game();
  check(state.moves[0] === 'e5' && state.stones >= 2 && state.table === state.stones, `The regular replied (${state.moves.join(' ')}), and the goban shows both stones`);
  check(await page.evaluate(() => document.querySelector('#go-panel').contains(document.activeElement)), 'Keyboard focus stays in the sheet through the regular\'s turn');
  check(!await page.locator('#go-panel [data-go-point="e5"][data-open]').count(), 'An occupied point is not offered');
  await page.screenshot({ path: 'output/playwright/plaza-go.png' });

  // Back to mancala: the goban goes, the mancala board returns.
  await page.locator('#go-panel [data-grove-game=mancala]').click();
  await page.locator('#mancala-panel[open]').waitFor();
  state = await game();
  check(state.goban === false && state.mancalaBoard === true && state.groveGame === 'mancala', 'Switching back sets the mancala board out again');
  await page.keyboard.press('Escape');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  // Standing up can land at the darts line, which rightly offers darts: what matters is
  // that the grove table itself no longer offers its games.
  const offer = await page.locator('#walking-play').isVisible() ? (await page.locator('#walking-play').textContent()).trim() : '';
  check(!/mancala|\bGo\b|Chinese checkers|xiangqi/i.test(offer), `Standing up leaves the grove table (${offer || 'nothing offered'})`);
  return { checks };
}
