async page => {
  // Nine men's morris at the plaza chess tables: the same seat and sheet as the other
  // board games. Pieces are placed with one click, a mill asks on the board which piece
  // to take, the arrow keys step only between points, and a walnut morris board on the
  // table follows the game.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const games = () => page.evaluate(() => window.__riverPlazaGames());
  const cell = name => 'abcdefg'.indexOf(name[0]) + (Number(name[1]) - 1) * 7;
  const click = name => page.locator(`#table-game-panel .table-square[data-square=${name}]`).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaGames?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-chess-west-0:0';
  check((await page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair)).ok, 'Arrived beside a chess table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.waitForFunction(() => /Play a table game/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 });
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyX');
  await page.locator('#table-game-panel[open]').waitFor();
  const choose = game => page.locator(`.table-game-choice [data-game=${game}]`).click();

  check(await page.locator('.table-game-choice [data-game=morris]').textContent() === 'Morris', 'The switch offers Morris');
  await choose('morris');
  let state = await games();
  check(state.game === 'morris' && state.player === 'w' && state.status === 'To place: White 9 · Black 9. Your move, white.', `A new game, you as white (${state.status})`);
  check(await page.locator('#table-game-title').textContent() === "Nine men's morris at the plaza", 'The sheet names the game');
  const cells = await page.locator('#table-game-panel .table-square').evaluateAll(all => ({ points: all.filter(c => !c.disabled).length, void: all.filter(c => c.disabled && c.hasAttribute('data-void')).length, marked: all.filter(c => c.dataset.target === 'move').length }));
  check(cells.points === 24 && cells.void === 25 && cells.marked === 24, `24 points take clicks, the other 25 cells only carry the lines (${JSON.stringify(cells)})`);
  check(state.morris.visible === true && state.morris.pieces === 0 && state.mirror.every(letter => !letter) && state.four.visible === false, 'The table shows its morris board, with the chess pieces put away');

  // One click places; the regular answers, and the table follows.
  await click('d2');
  await page.waitForFunction(() => window.__riverPlazaGames().moves.length === 2, null, { timeout: 20000 });
  state = await games();
  check(state.moves[0] === 'd2' && state.board[cell('d2')] === 'w' && state.morris.pieces === 2 && /^To place: White 8 · Black 8\./.test(state.status), `d2 is placed and the regular answers (${state.moves.join(' ')})`);

  // The arrow keys step only between points: right from d2 goes to f2, past e2.
  await page.locator('#table-game-panel .table-square[data-square=d2]').focus();
  await page.keyboard.press('ArrowRight');
  check(await page.evaluate(() => document.activeElement?.dataset.square) === 'f2', 'The right arrow steps from d2 to the next point, f2');

  // Pass and play to a mill: white a1, d1, g1 takes a black piece chosen on the board.
  await page.locator('[data-action=new]').click();
  await page.locator('#table-game-panel [data-mode=pass]').click();
  for (const name of ['a1', 'a7', 'd1', 'd7']) await click(name);
  await click('g1');
  state = await games();
  const takeable = await page.locator('#table-game-panel .table-square[data-target=capture]').evaluateAll(all => all.map(c => c.dataset.square).sort());
  check(state.status === 'Choose a black piece to take.' && takeable.join() === 'a7,d7' && state.moves.length === 4, `Closing a mill asks which black piece to take (${takeable.join(' ')})`);
  await click('d7');
  state = await games();
  check(state.moves.at(-1) === 'g1xd7' && !state.board[cell('d7')] && state.status === 'To place: White 6 · Black 7. Black to move.' && state.morris.pieces === 4, `The chosen piece is taken (${state.moves.at(-1)})`);
  await page.screenshot({ path: 'output/playwright/plaza-morris.png' });

  // Chess brings back its pieces; morris resumes, on the table too.
  await choose('chess');
  state = await games();
  check(state.game === 'chess' && state.morris.visible === false && state.mirror.filter(Boolean).length === 32, 'Chess puts the morris board away and brings back its pieces');
  await choose('morris');
  state = await games();
  check(state.game === 'morris' && state.moves.length === 5 && state.morris.visible === true && state.morris.pieces === 4, 'Morris resumes where it was');

  // On a phone the five games still fit the switch.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const row = await page.locator('#table-game-panel .table-game-choice').evaluate(choice => {
    const box = choice.getBoundingClientRect(), buttons = [...choice.querySelectorAll('button')].map(button => button.getBoundingClientRect());
    return { inside: buttons.every(b => b.left >= box.left - 1 && b.right <= box.right + 1 && b.bottom <= box.bottom + 1), height: Math.round(Math.min(...buttons.map(b => b.height))), wide: choice.scrollWidth <= choice.clientWidth + 1 };
  });
  check(row.inside && row.wide && row.height >= 36, `At 390 px the game switch fits (${JSON.stringify(row)})`);
  await page.screenshot({ path: 'output/playwright/plaza-morris-phone.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  check(!await page.locator('#table-game-panel').evaluate(panel => panel.open), 'Escape puts the board away');
  // The table keeps its morris board between visits, as it keeps the other games.
  state = await games();
  check(state.morris.visible === true && state.morris.pieces === 4, 'The table keeps the morris position once the sheet is away');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'output/playwright/plaza-morris-table.png' });
  return { checks };
}
