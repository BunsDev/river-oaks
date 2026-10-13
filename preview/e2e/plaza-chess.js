async page => {
  // Plaza chess: seated at a chess chair, X opens a board; a move is answered by the
  // plaza regular and mirrored on the table's pieces; standing up puts the board away.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const chess = () => page.evaluate(() => window.__riverPlazaGames());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaGames?.(), null, { timeout: 90000 });
  check(await page.locator('#walking-play').isHidden(), 'Play is not offered away from a game table');

  // The east table's west chair: white sits on chair 1, so the board's mirror turns round.
  const chair = 'bench:plaza-salon-chess-east-1:0';
  check((await page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair)).ok, 'Arrived beside a chess table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('#walking-play').hidden, null, { timeout: 5000 });
  check(await page.locator('#walking-play').evaluate(button => button.parentElement.classList.contains('walking-primary') && /Play chess/.test(button.textContent) && button.getAttribute('aria-keyshortcuts') === 'X'),
    'Seated at a chess table, Play chess (X) is the primary action');

  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#table-game-panel[open]').waitFor();
  let state = await chess();
  check(state.tableId === 'chess-east' && state.player === 'w' && state.firstChair === 1 && state.moves.length === 0, `X opens a new game at this table (${JSON.stringify(state).slice(0, 160)})`);
  check(await page.locator('[data-square=e2]').evaluate(cell => cell === document.activeElement), 'The board opens with focus on the king’s pawn');
  check(await page.locator('#table-game-panel').evaluate(panel => !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)), 'The game sheet is a frame, never its own scroll container');

  // Keyboard play: Enter picks e2, two steps up reach e4, Enter moves; the regular replies.
  await page.keyboard.press('Enter');
  check(await page.locator('[data-square=e4][data-target=move]').count() === 1 && await page.locator('[data-square=e3][data-target=move]').count() === 1, 'A chosen pawn shows its legal squares');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__riverPlazaGames().moves.length === 2, null, { timeout: 20000 });
  state = await chess();
  check(state.moves[0] === 'e2e4' && /^[a-h][1-8][a-h][1-8]$/.test(state.moves[1]), `The regular answers the opening move (${state.moves.join(' ')})`);
  check(state.mirror[28] === 'P' && state.mirror[12] === '' && state.mirror.filter(Boolean).length === 32, 'The table’s pieces mirror the game');
  check(await page.locator('.table-game-moves li').first().textContent().then(text => text.startsWith('e4')), 'The move list reads in algebraic notation');

  // A pawn cannot move backwards; a take-back returns to the opening for you.
  await page.locator('[data-square=e4]').click(); await page.locator('[data-square=e3]').click();
  check((await chess()).moves.length === 2, 'An illegal move is refused');
  await page.locator('[data-action=undo]').click();
  state = await chess();
  check(state.moves.length === 0 && state.mirror[12] === 'P', 'Take back returns to your own turn, on the table too');

  // Pass and play: both sides by hand, through to a mate.
  await page.locator('[data-mode=pass]').click();
  for (const move of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']) {
    await page.locator(`[data-square=${move.slice(0, 2)}]`).click(); await page.locator(`[data-square=${move.slice(2, 4)}]`).click();
  }
  state = await chess();
  check(state.moves.length === 7 && state.status === 'Checkmate. White wins.', `Pass and play reaches mate (${state.status})`);
  check(await page.locator('[data-square=e8][data-check]').count() === 1, 'The mated king is marked');
  await page.screenshot({ path: 'output/playwright/plaza-chess-mate.png' });

  // Escape puts the board away and returns to the world; the game is kept for this table.
  await page.keyboard.press('Escape');
  check(!await page.locator('#table-game-panel').evaluate(panel => panel.open) && await page.locator('#canvas-host').evaluate(host => host === document.activeElement), 'Escape closes the board and returns to the world');
  await page.keyboard.press('KeyX');
  await page.locator('#table-game-panel[open]').waitFor();
  check((await chess()).moves.length === 7, 'Reopening the board resumes the game at this table');

  // A phone-sized window stacks the board over its controls without overflowing.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const narrow = await page.locator('#table-game-panel').evaluate(panel => { const board = panel.querySelector('.table-game-board').getBoundingClientRect(), box = panel.getBoundingClientRect();
    return { board: board.width, fits: box.left >= 0 && box.right <= innerWidth, overflow: document.documentElement.scrollWidth > innerWidth }; });
  check(narrow.board >= 240 && narrow.fits && !narrow.overflow, `The board stays playable on a narrow screen (${JSON.stringify(narrow)})`);
  await page.screenshot({ path: 'output/playwright/plaza-chess-narrow.png' });
  await page.setViewportSize({ width: 1440, height: 900 });

  // Standing up puts the board away.
  await page.locator('#table-game-panel .table-game-close').click();
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverSeatAndWater().seated, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  check(!await page.locator('#table-game-panel').evaluate(panel => panel.open) && await page.locator('#walking-play').isHidden(), 'Standing up leaves the game table');
  return { checks };
}
