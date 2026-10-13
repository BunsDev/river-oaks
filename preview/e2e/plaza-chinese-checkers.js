async page => {
  // Chinese checkers at the grove table: seated, X opens the table on mancala; the switch
  // sets out the star board and puts the mancala board away; choosing a marble from the
  // keyboard marks the holes it can reach, and a hop is played by clicking its hole; the
  // regular answers; the table's marbles follow; X reopens Chinese checkers, the last
  // game played; switching back restores the mancala board; standing up ends it.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const named = (label, promise) => promise.catch(error => { throw new Error(`${label}: ${String(error.message).split('\n')[0]}`); });
  const bounded = (label, promise, ms = 60000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not finish in ${ms / 1000} s`)), ms))]);
  const game = () => bounded('Reading the Chinese checkers game', page.evaluate(() => { const { reset, ...state } = window.__riverPlazaChineseCheckers(); return state; }), 20000);
  const yourTurn = () => named('Waiting for your turn', page.waitForFunction(() => { const s = window.__riverPlazaChineseCheckers(); return !s.thinking && !s.moving && s.turn === 0 && s.winner === null; }, null, { timeout: 30000 }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaChineseCheckers?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-grove-1:0';
  check((await bounded('Walking to the grove table', page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair), 90000)).ok, 'Arrived beside the grove table');
  await named('Waiting to be offered a seat', page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 }));
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await named('Waiting to sit', page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 }));
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#mancala-panel[open]').waitFor();
  await page.locator('#mancala-panel [data-grove-game=chineseCheckers]').click();
  await page.locator('#chinese-checkers-panel[open]').waitFor();
  let state = await game();
  check(!await page.locator('#mancala-panel').evaluate(panel => panel.open) && state.groveGame === 'chineseCheckers', 'The switch puts mancala away and opens Chinese checkers');
  check(state.starShown === true && state.mancalaShown === false && state.gobanShown === false && state.xiangqiShown === false && state.table === 20, `The table sets out the star board with twenty marbles (${state.table})`);
  check(await page.locator('#chinese-checkers-panel').evaluate(panel => !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)), 'The sheet is a frame, never its own scroll container');
  await named('Waiting for X to relabel', page.waitForFunction(() => /Hide the Chinese checkers board/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 }));

  await bounded('Starting afresh', page.evaluate(() => window.__riverPlazaChineseCheckers().reset()), 20000);
  await yourTurn();
  state = await game();
  check(state.chair === 1 && state.plies === 0 && state.home.join() === '0,0' && /Choose a marble/.test(state.status), `A fresh game from your chair (${state.status})`);
  // The holes: the marble two rows back, the one in front of it, and the hole beyond.
  const holes = await page.evaluate(async () => { const { holeAt } = await import('/src/chinese-checkers-rules.js'); return { back: holeAt(-2, 6), front: holeAt(-2, 5), beyond: holeAt(-2, 4), ahead: holeAt(-1, 4) }; });
  check(await page.evaluate(back => document.activeElement?.dataset.ccHole === String(back), holes.back), 'Focus starts on a marble of yours in the board');
  await page.keyboard.press('Enter');
  state = await game();
  check(state.selected === holes.back && state.reach.includes(holes.beyond), `Enter chooses the marble and marks the hop over its neighbour (${state.reach.length} holes)`);
  check(await page.locator(`#chinese-checkers-panel [data-cc-hole="${holes.beyond}"][data-open]`).count() === 1, 'The reachable hole is marked on the board');
  await page.keyboard.press('ArrowLeft');
  check(await page.evaluate(() => document.activeElement?.dataset.ccHole !== undefined), 'Arrow keys move between holes');
  await page.locator(`#chinese-checkers-panel [data-cc-hole="${holes.beyond}"]`).click();
  await named('Waiting for the hop to land', page.waitForFunction(() => window.__riverPlazaChineseCheckers().plies >= 1, null, { timeout: 10000 }));
  state = await game();
  check(state.moves[0] === `${holes.back}-${holes.beyond}` && state.table === 20, `The hop is played on the sheet and the table (${state.moves[0]})`);
  const fits = await page.evaluate(() => {
    const panel = document.querySelector('#chinese-checkers-panel').getBoundingClientRect();
    return [...document.querySelectorAll('#chinese-checkers-panel .cc-scores li, #chinese-checkers-panel .cc-board')]
      .every(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.left >= panel.left - 1 && box.right <= panel.right + 1; });
  });
  check(fits, 'The tally and the board sit inside the sheet');
  await page.screenshot({ path: 'output/playwright/plaza-chinese-checkers.png' });
  await yourTurn();
  state = await game();
  check(state.plies === 2 && state.table === 20, `The regular answered (${state.moves[1]})`);
  check(await page.evaluate(() => document.querySelector('#chinese-checkers-panel').contains(document.activeElement)), 'Focus stays in the board through both moves');

  // Away and back: X reopens the last game played; the switch brings mancala back.
  await page.keyboard.press('Escape');
  check(!await page.locator('#chinese-checkers-panel').evaluate(panel => panel.open), 'Escape puts the board away');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#chinese-checkers-panel[open]').waitFor();
  check((await game()).plies === 2, 'X reopens Chinese checkers, the game where it was');
  await page.locator('#chinese-checkers-panel [data-grove-game=mancala]').click();
  await page.locator('#mancala-panel[open]').waitFor();
  state = await game();
  check(state.starShown === false && state.mancalaShown === true && state.groveGame === 'mancala', 'Switching back sets the mancala board out again');
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
