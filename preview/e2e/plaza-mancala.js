async page => {
  // Mancala at the grove table: seated, X opens the board; pit 3 sows into the store
  // for another turn, then pit 6 hands the move to the regular, who answers; the
  // table's beads mirror every seed; Escape and standing up end it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the mancala game', page.evaluate(() => { const { reset, ...state } = window.__riverPlazaMancala(); return state; }), 20000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaMancala?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-grove-0:0';
  check((await bounded('Walking to the grove table', page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair), 90000)).ok, 'Arrived beside the grove table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await named('Waiting for Play mancala', page.waitForFunction(() => /Play mancala/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 }));
  check(await page.locator('#walking-play').evaluate(button => button.parentElement.classList.contains('walking-primary')), 'At the grove table, Play mancala (X) is the primary action');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#mancala-panel[open]').waitFor();
  check(await page.locator('#mancala-panel').evaluate(panel => !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)), 'The mancala sheet is a frame, never its own scroll container');
  await bounded('Starting afresh', page.evaluate(() => window.__riverPlazaMancala().reset()), 20000);
  let state = await game();
  check(state.you === 0 && state.turn === 0 && state.table === 48 && state.legal.length === 6, `Four seeds in every pit, and you move first (${state.table} beads)`);

  // Pit 3 ends in the store: another turn.
  await page.locator('#mancala-panel [data-mancala-pit="3"]').click();
  state = await game();
  check(state.board[6] === 1 && state.turn === 0 && state.last?.again, 'Sowing pit 3 ends in your store: another turn');
  check(/another turn/.test(state.status), `The sheet says so (${state.status})`);
  check(await page.locator('#mancala-panel [data-mancala-place][data-last]').count() === 4, 'The four places sown are marked');
  // Pit 6 hands the move to the regular, who answers.
  await page.locator('#mancala-panel [data-mancala-pit="6"]').click();
  await named('Waiting for the regular', page.waitForFunction(() => { const s = window.__riverPlazaMancala(); return s.over || (s.turn === 0 && !s.thinking && s.moves.length >= 3); }, null, { timeout: 30000 }));
  state = await game();
  check(state.moves.length >= 3 && state.table === 48, `The regular sowed, and the table still shows all 48 seeds (${state.moves.join(' ')})`);
  check(await page.evaluate(() => document.querySelector('#mancala-panel').contains(document.activeElement)), 'Keyboard focus stays in the sheet through the regular\'s turn');
  await page.screenshot({ path: 'output/playwright/plaza-mancala.png' });

  await page.keyboard.press('Escape');
  check(!await page.locator('#mancala-panel').evaluate(panel => panel.open), 'Escape puts the board away');
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
