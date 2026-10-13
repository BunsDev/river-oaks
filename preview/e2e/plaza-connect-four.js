async page => {
  // Connect Four at the plaza chess tables: the same seat and sheet as chess and
  // checkers. A click anywhere in a column drops a disc, the regular answers, and a
  // standing frame on the table mirrors the game while the chess pieces are put away.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const games = () => page.evaluate(() => window.__riverPlazaGames());
  const cell = name => 'abcdefg'.indexOf(name[0]) + (Number(name[1]) - 1) * 7;
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

  await page.locator('[data-game=connectFour]').click();
  let state = await games();
  check(state.game === 'connectFour' && state.player === 'r' && state.moves.length === 0 && state.status === 'Your move, red.', `A new Connect Four game, you as red (${JSON.stringify(state).slice(0, 160)})`);
  check(await page.locator('#table-game-title').textContent() === 'Connect Four at the plaza', 'The sheet names the game');
  check(await page.locator('.table-square').count() === 42 && await page.locator('[data-target=move]').count() === 7, 'Seven columns of six, each with its landing slot marked');
  check(state.four.visible === true && state.four.discs === 0 && state.mirror.every(letter => !letter), 'The table shows the empty frame and puts the chess pieces away');

  // A click high in a column drops to its foot; the regular answers.
  await page.locator('[data-square=d6]').click();
  await page.waitForFunction(() => window.__riverPlazaGames().moves.length === 2, null, { timeout: 20000 });
  state = await games();
  check(state.moves[0] === 'd' && state.board[cell('d1')] === 'r' && /^[a-g]$/.test(state.moves[1]), `The disc lands on d1 and the regular answers (${state.moves.join(' ')})`);
  check(state.four.discs === 2 && state.status === 'Your move, red.', 'The frame shows both discs and it is your move again');

  // Chess resumes its own game with its pieces; Connect Four returns where it was.
  await page.locator('[data-game=chess]').click();
  state = await games();
  check(state.game === 'chess' && state.four.visible === false && state.mirror.filter(Boolean).length === 32, 'Chess brings back its pieces and puts the frame away');
  await page.locator('[data-game=connectFour]').click();
  state = await games();
  check(state.game === 'connectFour' && state.moves.length === 2 && state.four.visible === true && state.four.discs === 2, 'Connect Four resumes, on the table too');
  await page.screenshot({ path: 'output/playwright/plaza-connect-four.png' });

  // Pass and play to a win: red takes the bottom row a to d.
  await page.locator('[data-action=new]').click();
  await page.locator('[data-mode=pass]').click();
  for (const column of ['a', 'a', 'b', 'b', 'c', 'c', 'd']) await page.locator(`[data-square=${column}6]`).click();
  state = await games();
  check(state.status === 'Four in a row. Red wins.' && await page.locator('[data-win]').count() === 4 && await page.locator('[data-target]').count() === 0, `Four in a row ends the game and lights the line (${state.status})`);
  await page.screenshot({ path: 'output/playwright/plaza-connect-four-win.png' });
  await page.keyboard.press('Escape');
  check(!await page.locator('#table-game-panel').evaluate(panel => panel.open), 'Escape puts the board away');
  return { checks };
}
