async page => {
  // Darts on the south wall: standing at the throwing line, X opens the board. Held arrow
  // keys move the release across and the acceleration up and down, and a drag on the
  // board places the release under the pointer. Three darts released at the treble 20
  // (held still there by the test hook) land where the hand's seeded error puts them; the
  // real board shows the turn's darts; the regular throws three; Escape and walking away end it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the darts game', page.evaluate(() => { const { steadyAt, steadyOn, landingFor, reset, goTo, ...state } = window.__riverPlazaDarts(); return state; }), 20000);
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
  check(state.scores.join() === '501,501' && state.turn === 0 && state.release.join() === '0,50', `Both on 501, your throw, the hand at the bull's release (${state.release})`);
  check(await page.evaluate(() => document.activeElement?.dataset.dartsAction === 'throw'), 'Focus is on the throw button, so Space throws');
  check(await page.locator('#darts-panel .darts-gauge[role=meter]').getAttribute('aria-valuenow') !== null && /m\/s/.test(await page.locator('#darts-panel .darts-readout').textContent()), 'The acceleration gauge and readout show the throw');

  // Keys: a tap is one step (2 mm across, 0.25 m/s²), a hold keeps moving; the hand sways around it.
  for (let tap = 0; tap < 5; tap++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  state = await game();
  check(state.release[0] >= 10 - 1e-6 && state.release[0] < 16 && state.release[1] >= 50.5 - 1e-6 && state.release[1] < 51.5, `Five taps right and two up step the release (${state.release.map(n => n.toFixed(2))})`);
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(900); await page.keyboard.up('ArrowUp');
  state = await game();
  check(state.release[1] > 52, `Holding up keeps adding acceleration (${state.release[1].toFixed(2)} m/s²)`);
  check(Math.hypot(state.swayed[0] - state.release[0], (state.swayed[1] - state.release[1]) * 8) < 40, `The hand sways a little around it (${state.swayed.map(n => n.toFixed(1))})`);
  check(await page.locator('#darts-panel .darts-target').count() === 1, 'The landing guide shows where the release would land');
  // A drag places the release under the pointer: across directly, height through the acceleration.
  const box = await page.locator('#darts-panel .darts-board').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.mouse.down(); await page.mouse.up();
  state = await game();
  check(Math.abs(state.release[0]) < 3 && Math.abs(state.release[1] - 50) < 0.6, `A press at the centre releases for the bull (${state.release.map(n => n.toFixed(2))})`);

  // Three darts released at the treble 20: each lands at that release plus the hand's seeded error.
  const release = await page.evaluate(() => window.__riverPlazaDarts().steadyOn([0, 103]));
  const expected = await page.evaluate(async release => {
    const { scoreAt } = await import('/src/darts-rules.js');
    return [0, 1, 2].map(dart => { const point = window.__riverPlazaDarts().landingFor(release, dart).map(n => Math.round(n * 10) / 10); return { point, label: scoreAt(point).label, value: scoreAt(point).value }; });
  }, release);
  for (let dart = 0; dart < 3; dart++) { await page.evaluate(() => window.__riverPlazaDarts().steadyOn([0, 103])); await page.keyboard.press('Space'); }
  state = await game();
  const scored = expected.reduce((sum, hit) => sum + hit.value, 0);
  check(state.points.slice(0, 3).map(p => p.join()).join(' ') === expected.map(hit => hit.point.join()).join(' '), `The darts land at the release plus the hand's error (${expected.map(hit => hit.label).join(' ')})`);
  check(state.scores[0] === 501 - scored || state.last?.result === 'bust', `Their score comes off (${scored}, ${state.scores[0]} left)`);
  check(expected.every(hit => Math.abs(hit.point[1] - 103) < 80 && Math.abs(hit.point[0]) < 80), 'A steady hand at the treble 20 stays in the top of the board');
  check(await page.locator('#darts-panel .darts-board [data-darts-hit]').count() === 3, 'The sheet marks the three darts');
  await named('Waiting for the regular', page.waitForFunction(() => { const s = window.__riverPlazaDarts(); return !s.thinking && s.turn === 0 && s.thrown >= 6; }, null, { timeout: 30000 }));
  state = await game();
  check(state.thrown === 6 && state.scores[1] < 501 || state.last?.result === 'bust', `The regular threw three (${state.last?.darts.join(' ')}, ${state.scores[1]} left)`);
  check(state.board === 3, 'The board on the wall shows the last turn’s darts');
  check(await page.evaluate(() => document.querySelector('#darts-panel').contains(document.activeElement)), 'Keyboard focus stays in the sheet through the regular’s turn');
  await page.screenshot({ path: 'output/playwright/plaza-darts.png' });
  // On a phone the gauge and readout stack under the board; the board, gauge and throw stay on screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/plaza-darts-mobile.png' });
  const phone = await page.evaluate(() => {
    const panel = document.querySelector('#darts-panel').getBoundingClientRect(), box = selector => document.querySelector(`#darts-panel ${selector}`)?.getBoundingClientRect();
    const inside = rect => rect && rect.width > 0 && rect.left >= panel.left - 1 && rect.right <= panel.right + 1;
    return { board: inside(box('.darts-board')), gauge: inside(box('.darts-gauge')) && box('.darts-gauge').height >= 90, throwOnScreen: (r => r && r.top >= 0 && r.bottom <= innerHeight)(box('[data-darts-action="throw"]')) };
  });
  check(phone.board && phone.gauge && phone.throwOnScreen, `On a phone the board, the gauge and the throw button fit (${JSON.stringify(phone)})`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#darts-panel [data-darts-action="guide"]').click();
  check(await page.locator('#darts-panel [data-darts-action="guide"]').getAttribute('aria-pressed') === 'false' && await page.locator('#darts-panel .darts-target').count() === 0, 'The landing guide can be turned off');
  await page.locator('#darts-panel [data-darts-action="guide"]').click();

  await page.keyboard.press('Escape');
  check(!await page.locator('#darts-panel').evaluate(panel => panel.open), 'Escape puts the board away');
  check((await bounded('Walking away', page.evaluate(() => window.__riverSeatAndWater().goTo(-2791.0, -1299.6)), 60000))?.ok !== false, 'Walked away from the line');
  await named('Waiting for the line to let go', page.waitForFunction(() => !/darts/i.test(document.querySelector('#walking-play')?.textContent ?? '') || document.querySelector('#walking-play')?.hidden, null, { timeout: 15000 }));
  check(true, 'Away from the line, the board offers nothing');
  return { checks };
}
