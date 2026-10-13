async page => {
  // Checkers at the plaza tables: the same seat and board sheet as chess. Dark moves
  // first, captures are compulsory, the regular answers, and discs stand on the table.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const games = () => page.evaluate(() => window.__riverPlazaGames());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaGames?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-chess-west-0:0';
  check((await page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair)).ok, 'Arrived beside a chess table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.waitForFunction(() => /Play chess, checkers or Connect Four/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyX');
  await page.locator('#table-game-panel[open]').waitFor();

  // One chess move first, so switching games can be shown to keep it.
  await page.locator('[data-square=e2]').click(); await page.locator('[data-square=e4]').click();
  await page.waitForFunction(() => window.__riverPlazaGames().moves.length === 2, null, { timeout: 20000 });

  await page.locator('[data-game=checkers]').click();
  let state = await games();
  check(state.game === 'checkers' && state.player === 'd' && state.moves.length === 0 && state.firstChair === 0, `The table switches to a new checkers game, you as dark (${JSON.stringify(state).slice(0, 140)})`);
  check(await page.locator('#table-game-title').textContent() === 'Checkers at the plaza' && state.status === 'Your move, dark.', 'The sheet names the game and whose move it is');
  check(await page.locator('.table-square .checkers-piece').count() === 24 && await page.locator('[data-side-index="0"]').textContent() === 'Dark', 'Twenty-four discs, and the side choice reads Dark and Light');
  check(state.mirror.filter(letter => letter === 'd').length === 12 && state.mirror.filter(letter => letter === 'l').length === 12, 'The table mirrors the checkers opening');

  // Only real moves are offered: c3 may step to b4 or d4, and a light square is never a target.
  await page.locator('[data-square=c3]').click();
  check(await page.locator('[data-square=b4][data-target=move]').count() === 1 && await page.locator('[data-square=d4][data-target=move]').count() === 1 && await page.locator('[data-target]').count() === 2, 'A chosen man shows its two forward squares');
  await page.locator('[data-square=d4]').click();
  await page.waitForFunction(() => window.__riverPlazaGames().moves.length === 2, null, { timeout: 20000 });
  state = await games();
  check(state.moves[0] === 'c3-d4' && /^[a-h][1-8][-x][a-h][1-8]/.test(state.moves[1]), `The regular answers (${state.moves.join(' ')})`);
  check(state.mirror[27] === 'd' && state.mirror[18] === '', 'The table moves the disc');
  check(/^(A capture is compulsory\. )?Your move, dark\.$/.test(state.status), `It is your move again (${state.status})`);

  // Back to chess: that game resumes where it was left.
  await page.locator('[data-game=chess]').click();
  state = await games();
  check(state.game === 'chess' && state.moves.length === 2 && state.moves[0] === 'e2e4' && state.mirror[28] === 'P', 'Switching back resumes the chess game, on the table too');
  await page.screenshot({ path: 'output/playwright/plaza-games-chess.png' });
  await page.locator('[data-game=checkers]').click();
  await page.screenshot({ path: 'output/playwright/plaza-checkers.png' });
  await page.keyboard.press('Escape');
  check(!await page.locator('#table-game-panel').evaluate(panel => panel.open), 'Escape puts the board away');
  return { checks };
}
