async page => {
  // Darts on the south wall: standing at the throwing line, X opens the board; three darts
  // thrown through the two-stop line (held still on the treble 20 by the test hook) make
  // 180; the real board shows the turn's darts; the regular throws three; Escape and
  // walking away end it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the darts game', page.evaluate(() => { const { hold, holdAt, reset, goTo, ...state } = window.__riverPlazaDarts(); return state; }), 20000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverPlazaDarts?.(), null, { timeout: 90000 });
  check((await bounded('Walking to the throwing line', page.evaluate(() => window.__riverPlazaDarts().goTo()), 90000)).ok, 'Arrived at the throwing line');
  await named('Waiting for Play darts', page.waitForFunction(() => /Play darts/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 15000 }));
  check(await page.locator('#walking-play').evaluate(button => button.parentElement.classList.contains('walking-primary')), 'At the line, Play darts (X) is the primary action');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#darts-panel[open]').waitFor();
  await bounded('Starting afresh', page.evaluate(() => window.__riverPlazaDarts().reset(9)), 20000);
  let state = await game();
  check(state.scores.join() === '501,501' && state.turn === 0 && state.phase === 'x', 'Both on 501, your throw');
  check(await page.evaluate(() => document.activeElement?.dataset.dartsAction === 'throw'), 'Focus is on the throw button, so Space throws');

  // Three darts at the treble 20: across at the centre line, up at the treble ring (103 mm).
  for (let dart = 0; dart < 3; dart++) {
    await page.evaluate(() => window.__riverPlazaDarts().holdAt(0));
    await page.keyboard.press('Space');
    await page.evaluate(() => window.__riverPlazaDarts().holdAt(103));
    await page.keyboard.press('Space');
  }
  state = await game();
  check(state.scores[0] === 321 && state.last?.darts.join() === 'T20,T20,T20', `One hundred and eighty (${state.last?.darts.join(' ')}, ${state.scores[0]} left)`);
  check(await page.locator('#darts-panel .darts-board [data-darts-hit]').count() === 3, 'The sheet marks the three darts');
  await named('Waiting for the regular', page.waitForFunction(() => { const s = window.__riverPlazaDarts(); return !s.thinking && s.turn === 0 && s.thrown >= 6; }, null, { timeout: 30000 }));
  state = await game();
  check(state.thrown === 6 && state.scores[1] < 501 || state.last?.result === 'bust', `The regular threw three (${state.last?.darts.join(' ')}, ${state.scores[1]} left)`);
  check(state.board === 3, 'The board on the wall shows the last turn’s darts');
  check(await page.evaluate(() => document.querySelector('#darts-panel').contains(document.activeElement)), 'Keyboard focus stays in the sheet through the regular’s turn');
  await page.screenshot({ path: 'output/playwright/plaza-darts.png' });

  await page.keyboard.press('Escape');
  check(!await page.locator('#darts-panel').evaluate(panel => panel.open), 'Escape puts the board away');
  check((await bounded('Walking away', page.evaluate(() => window.__riverSeatAndWater().goTo(-2791.0, -1299.6)), 60000))?.ok !== false, 'Walked away from the line');
  await named('Waiting for the line to let go', page.waitForFunction(() => !/darts/i.test(document.querySelector('#walking-play')?.textContent ?? '') || document.querySelector('#walking-play')?.hidden, null, { timeout: 15000 }));
  check(true, 'Away from the line, the board offers nothing');
  return { checks };
}
