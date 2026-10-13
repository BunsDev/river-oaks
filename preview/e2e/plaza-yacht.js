async page => {
  // Yacht on the curved bench: seated, X opens Jenga and its switch sets out Yacht (the
  // tower put away, five dice on the drum); Roll, keep two dice and roll again (the kept
  // ones stay), then score the dice in a box; the two regulars take their turns; X then
  // reopens Yacht, the last game played, and switching back stands the tower up again.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  // page.evaluate has no timeout of its own: bound each in-page wait so a stall fails with its name.
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the Yacht game', page.evaluate(() => { const { deal, ...state } = window.__riverPlazaYacht(); return state; }), 20000);
  const yourTurn = () => named('Waiting for your turn', page.waitForFunction(() => { const s = window.__riverPlazaYacht(); return !s.thinking && s.turn === 0 && !s.winners; }, null, { timeout: 30000 }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaYacht?.(), null, { timeout: 90000 });
  const seat = 'bench:plaza-salon-bench:1';
  check((await bounded('Walking to the curved bench', page.evaluate(id => window.__riverSeatAndWater().goNear(id), seat), 90000)).ok, 'Arrived beside the curved bench');
  await named('Waiting to be offered a seat', page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 }));
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await named('Waiting to sit', page.waitForFunction(() => /^bench:plaza-salon-bench:/.test(window.__riverSeatAndWater().seated ?? ''), null, { timeout: 15000 }));
  await named('Waiting for Play Jenga', page.waitForFunction(() => /Play Jenga/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 }));
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#jenga-panel[open]').waitFor();
  await page.locator('#jenga-panel [data-bench-game="yacht"]').click();
  await page.locator('#yacht-panel[open]').waitFor();
  check(!await page.locator('#jenga-panel').evaluate(panel => panel.open), 'The switch puts Jenga away and opens Yacht');
  let state = await game();
  check(state.benchGame === 'yacht' && state.diceShown === true && state.towerShown === false && state.table === 5, `The tower is put away and five dice come out on the drum (${state.table})`);
  check(await page.locator('#yacht-panel').evaluate(panel => !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)), 'The Yacht sheet is a frame, never its own scroll container');
  check(await page.locator('#yacht-panel [data-bench-game="yacht"]').getAttribute('aria-pressed') === 'true', 'The switch shows Yacht chosen');

  await bounded('Dealing a seeded game', page.evaluate(() => window.__riverPlazaYacht().deal(11)), 20000);
  await yourTurn();
  state = await game();
  check(state.players === 3 && state.rolls === 0 && state.dice === null && /Roll the dice/.test(state.status), `You play two regulars, and the turn starts with a roll (${state.status})`);
  check(await page.evaluate(() => document.activeElement?.dataset.yachtAction === 'roll'), 'Focus is on Roll, so Space rolls');
  await page.keyboard.press('Space');
  state = await game();
  check(state.rolls === 1 && state.dice?.length === 5 && state.dice.every(die => die >= 1 && die <= 6), `Five dice rolled (${state.dice})`);
  check(await page.locator('#yacht-panel [data-yacht-box]:not([hidden])').count() === 12, 'Every open box offers what the dice would score');

  // Keep the first two dice and roll again: they stay as they were.
  const first = state.dice.slice();
  await page.locator('#yacht-panel [data-yacht-die="0"]').click();
  await page.locator('#yacht-panel [data-yacht-die="1"]').click();
  state = await game();
  check(state.held.join() === 'true,true,false,false,false' && await page.locator('#yacht-panel [data-yacht-die="0"]').getAttribute('aria-pressed') === 'true', 'Choosing a die keeps it');
  await page.locator('#yacht-panel [data-yacht-action="roll"]').click();
  state = await game();
  check(state.rolls === 2 && state.dice[0] === first[0] && state.dice[1] === first[1] && state.held.join() === 'true,true,false,false,false', `The kept dice stay through the second roll (${first} → ${state.dice})`);

  // Score them in choice: all five dice.
  const sum = state.dice.reduce((a, b) => a + b, 0);
  check(await page.locator('#yacht-panel [data-yacht-box="choice"]').textContent() === `+${sum}`, `Choice offers the sum (${sum})`);
  const fits = await page.evaluate(() => {
    const panel = document.querySelector('#yacht-panel').getBoundingClientRect();
    return [...document.querySelectorAll('#yacht-panel .yacht-die, #yacht-panel [data-yacht-action=roll], #yacht-panel .yacht-card')]
      .every(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.left >= panel.left - 1 && box.right <= panel.right + 1; });
  });
  check(fits, 'The dice, Roll and the score card sit inside the sheet');
  await page.screenshot({ path: 'output/playwright/plaza-yacht.png' });
  await page.locator('#yacht-panel [data-yacht-box="choice"]').click();
  state = await game();
  check(state.totals[0] === sum && state.filled[0] === 1, `Choice scored ${state.totals[0]}`);
  check(await page.evaluate(() => document.activeElement?.dataset.yachtAction === 'roll'), 'Focus returns to Roll after scoring');
  await yourTurn();
  state = await game();
  check(state.filled.join() === '1,1,1' && state.turns === 3, `Both regulars took a turn (${state.filled})`);
  check(await page.locator('#yacht-panel tbody tr[data-yacht-row="choice"] td[data-yacht-player="0"]').textContent() === String(sum), 'The card shows your choice score');

  // Away and back: X reopens the last game played; the switch brings the tower back.
  await page.keyboard.press('Escape');
  check(!await page.locator('#yacht-panel').evaluate(panel => panel.open), 'Escape puts the dice away');
  await named('Waiting for Play Yacht', page.waitForFunction(() => /Play Yacht/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 15000 }));
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#yacht-panel[open]').waitFor();
  check((await game()).turns === 3, 'X reopens Yacht, the game where it was');
  await page.locator('#yacht-panel [data-bench-game="jenga"]').click();
  await page.locator('#jenga-panel[open]').waitFor();
  state = await game();
  check(state.benchGame === 'jenga' && state.diceShown === false && state.towerShown === true, 'Switching back stands the tower up and puts the dice away');
  await page.keyboard.press('Escape');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await named('Waiting to stand', page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 }));
  await page.waitForTimeout(400);
  check(await page.locator('#walking-play').isHidden(), 'Standing up leaves the bench');
  return { checks };
}
