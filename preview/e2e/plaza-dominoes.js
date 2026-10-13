async page => {
  // Dominoes at the plaza café table: seated in a café armchair, X opens the table; a
  // seeded round is played to its end against the regular through the real controls,
  // the round table mirrors the tiles, and four players switch to the block game.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const game = () => page.evaluate(() => { const { deal, ...state } = window.__riverPlazaDominoes(); return state; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaDominoes?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-round-0:0';
  check((await page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair)).ok, 'Arrived beside the café table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.waitForFunction(() => /Play dominoes/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 });
  check(await page.locator('#walking-play').evaluate(button => button.parentElement.classList.contains('walking-primary') && button.getAttribute('aria-keyshortcuts') === 'X'), 'At the café table, Play dominoes (X) is the primary action');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#dominoes-panel[open]').waitFor();
  check(await page.locator('#dominoes-title').textContent() === 'Dominoes at the café', 'X opens the café table');
  check(await page.locator('#dominoes-panel').evaluate(panel => !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)), 'The dominoes sheet is a frame, never its own scroll container');

  // A seeded round where you hold the lead, so the opening is yours to play.
  const seed = await page.evaluate(() => { for (let seed = 1; seed < 400; seed++) { window.__riverPlazaDominoes().deal(seed, 2); if (window.__riverPlazaDominoes().turn === 0) return seed; } return null; });
  check(seed !== null, 'A dealt round where you lead');
  let state = await game();
  check(state.players === 2 && state.hand.length === 7 && state.sizes[1] === 7 && state.boneyard === 14, `Two players: seven tiles each and a fourteen-tile boneyard (${JSON.stringify(state.sizes)}, ${state.boneyard})`);
  check(state.legal.length === 1 && state.legal[0] === `R:${state.lead}` && state.status === `Your lead: play the ${state.lead.replace('-', '\u2013')}.`, 'Your only move is to lead the highest double');
  check(await page.locator('.dominoes-hand [data-fits]').count() === 1 && await page.locator(`.dominoes-hand [data-tile="${state.lead}"]`).isEnabled(), 'Only the lead tile can be played');
  await page.locator(`.dominoes-hand [data-tile="${state.lead}"]`).click();
  await page.waitForFunction(() => { const s = window.__riverPlazaDominoes(); return s.over || (s.turn === 0 && !s.playing && s.moves.length >= 2); }, null, { timeout: 20000 });
  state = await game();
  check(state.line.length >= 1 && state.moves[0] === `R:${state.lead}`, `The lead is on the table and the regular has answered (${state.moves.join(' ')})`);
  check(state.table.tiles === state.line.length + state.sizes.reduce((sum, size) => sum + size, 0), 'The café table shows the line and both hands');
  await page.screenshot({ path: 'output/playwright/plaza-dominoes-play.png' });

  // Play the round out with the real controls: fitting tiles, the end choice, Draw and Pass.
  for (let turn = 0; turn < 60; turn++) {
    state = await game();
    if (state.over) break;
    if (state.turn !== 0 || state.playing) { await page.waitForTimeout(150); continue; }
    const move = state.legal[0];
    if (move === 'draw') await page.locator('[data-action=draw]').click();
    else if (move === 'pass') await page.locator('[data-action=pass]').click();
    else {
      await page.locator(`.dominoes-hand [data-tile="${move.slice(2)}"]`).click();
      if (await page.locator('.dominoes-choice').isVisible()) await page.locator(`.dominoes-choice [data-end=${move.startsWith('L') ? 'left' : 'right'}]`).click();
    }
    await page.waitForFunction(count => { const s = window.__riverPlazaDominoes(); return s.over || (s.moves.length > count && s.turn === 0 && !s.playing); }, state.moves.length, { timeout: 20000 });
  }
  state = await game();
  check(Boolean(state.over), 'The round is played to its end');
  check(state.over.winner === null ? /no points/.test(state.status) : /points/.test(state.status), `The status reports the result (${state.status})`);
  check(state.scores.reduce((sum, score) => sum + score, 0) === (state.over.winner === null ? 0 : state.over.points), 'The winner is credited with the round');
  check(await page.locator('[data-action=next]').isVisible(), 'Next round is offered');
  await page.screenshot({ path: 'output/playwright/plaza-dominoes-round.png' });

  // Four players: the block game, seven each and no boneyard.
  await page.locator('[data-players="4"]').click();
  await page.waitForFunction(() => window.__riverPlazaDominoes().players === 4, null, { timeout: 5000 });
  state = await game();
  check(state.sizes.length === 4 && state.boneyard === 0 && state.scores.every(score => score === 0), `Four players start a block-game match (${JSON.stringify(state.sizes)})`);
  check(await page.locator('.dominoes-others li').count() === 3, 'The three regulars\u2019 hands are shown as counts');

  await page.keyboard.press('Escape');
  check(!await page.locator('#dominoes-panel').evaluate(panel => panel.open), 'Escape puts the table away');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  check(await page.locator('#walking-play').isHidden(), 'Standing up leaves the café table');
  return { checks };
}
