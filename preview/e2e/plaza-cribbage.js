async page => {
  // Cribbage at the walnut table: the switch sets out the pegging board and puts the
  // checkers away; a seeded hand is laid away and played to the show through the real
  // buttons; the pegs follow the scores; Next hand deals again; switching back restores
  // the checkers; Escape and standing up end it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the cribbage game', page.evaluate(() => { const { deal, ...state } = window.__riverPlazaCribbage(); return state; }), 20000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaCribbage?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-backgammon-0:0';
  check((await bounded('Walking to the walnut table', page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair), 90000)).ok, 'Arrived beside the walnut table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#backgammon-panel[open]').waitFor();
  await page.locator('#backgammon-panel [data-walnut-game=cribbage]').click();
  await page.locator('#cribbage-panel[open]').waitFor();
  let state = await game();
  check(!await page.locator('#backgammon-panel').evaluate(panel => panel.open) && state.walnutGame === 'cribbage', 'The switch puts backgammon away and opens cribbage');
  check(state.board === true && state.checkers === false, 'The table sets out the pegging board and puts the checkers away');

  await bounded('Dealing a seeded game', page.evaluate(() => window.__riverPlazaCribbage().deal(12)), 20000);
  state = await game();
  check(state.phase === 'discard' && state.turn === 0 && state.cards.length === 6 && state.dealer === 1, 'Six cards to you, and the regular deals: you lay away first');
  check(await page.locator('#cribbage-panel [data-cribbage-action=discard]').isDisabled(), 'Laying away waits for two chosen cards');
  for (const code of state.cards.slice(-2)) await page.locator(`#cribbage-panel .cribbage-hand [data-card="${code}"]`).click();
  await page.locator('#cribbage-panel [data-cribbage-action=discard]').click();
  await named('Waiting for the play to begin', page.waitForFunction(() => { const s = window.__riverPlazaCribbage(); return s.phase !== 'discard' && !s.playing; }, null, { timeout: 30000 }));
  state = await game();
  check(state.crib === 4 && state.starter, `Four cards in the crib, and the starter cut (${state.starter})`);

  // Play the hand through the hand's own buttons until the show.
  let plays = 0;
  for (let step = 0; step < 60; step++) {
    state = await game();
    if (state.phase !== 'play' || state.winner !== null) break;
    if (state.turn !== 0 || state.playing || !state.legal.length) { await page.waitForTimeout(150); continue; }
    if (!plays) check(await page.locator('#cribbage-panel .cribbage-hand [data-legal]').count() === state.legal.length, 'Only the cards that keep the count to 31 are offered');
    await page.locator(`#cribbage-panel .cribbage-hand [data-card="${state.legal[0]}"]`).click();
    plays++;
    await named('Waiting for the regular', page.waitForFunction(count => { const s = window.__riverPlazaCribbage(); return s.phase !== 'play' || (!s.playing && s.moves > count); }, state.moves, { timeout: 30000 }));
  }
  state = await game();
  check(state.phase === 'show' || state.winner !== null, `The play ends in the show (${plays} of your cards)`);
  check(state.show?.length === 3 && await page.locator('#cribbage-panel .cribbage-show li').count() === 3, 'The show counts your hand, the regular’s and the crib');
  check(state.pegs === 2 && state.scores.some(score => score > 0), `The pegs stand at the scores (${state.scores.join(' to ')})`);
  await page.screenshot({ path: 'output/playwright/plaza-cribbage.png' });
  await page.locator('#cribbage-panel [data-cribbage-action=next]').click();
  await named('Waiting for the next deal', page.waitForFunction(() => { const s = window.__riverPlazaCribbage(); return s.phase === 'discard' && s.hand === 1; }, null, { timeout: 15000 }));
  state = await game();
  check(state.dealer === 0, 'The deal passes to you');

  await page.locator('#cribbage-panel [data-walnut-game=backgammon]').click();
  await page.locator('#backgammon-panel[open]').waitFor();
  state = await game();
  check(state.board === false && state.checkers === true && state.walnutGame === 'backgammon', 'Switching back sets the checkers out again');
  await page.keyboard.press('Escape');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  check(await page.locator('#walking-play').isHidden(), 'Standing up leaves the walnut table');
  return { checks };
}
