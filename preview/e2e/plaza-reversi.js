async page => {
  // Reversi at the plaza chess tables: the same seat and sheet as chess, checkers and
  // Connect Four. One click places a disc where it outflanks a line, the outflanked
  // discs turn, the regular answers, and the table's own discs follow the game.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const games = () => page.evaluate(() => window.__riverPlazaGames());
  const square = name => 'abcdefgh'.indexOf(name[0]) + (Number(name[1]) - 1) * 8;
  const discs = board => board.filter(disc => disc === 'd' || disc === 'l').length;
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

  await choose('reversi');
  const switchFits = () => page.locator('#table-game-panel .table-game-choice').evaluate(choice => {
    const box = choice.getBoundingClientRect(), buttons = [...choice.querySelectorAll('button')].map(button => button.getBoundingClientRect());
    return { inside: buttons.every(b => b.left >= box.left - 1 && b.right <= box.right + 1 && b.bottom <= box.bottom + 1), height: Math.round(Math.min(...buttons.map(b => b.height))), rows: new Set(buttons.map(b => Math.round(b.top))).size, wide: choice.scrollWidth <= choice.clientWidth + 1 };
  });
  const wide = await switchFits();
  check(wide.inside && wide.wide && wide.height >= 36, `At 1440 px every game in the switch fits its column (${JSON.stringify(wide)})`);
  let state = await games();
  check(state.game === 'reversi' && state.player === 'd' && state.moves.length === 0 && state.status === 'Black 2 · White 2. Your move, black.', `A new Reversi game, you as black (${state.status})`);
  check(await page.locator('#table-game-title').textContent() === 'Reversi at the plaza', 'The sheet names the game');
  const marked = await page.locator('#table-game-panel .table-square[data-target=move]').evaluateAll(cells => cells.map(cell => cell.dataset.square).sort());
  check(marked.join() === 'c4,d3,e6,f5', `Black's four opening squares are marked (${marked.join(' ')})`);
  check(discs(state.mirror) === 4 && state.mirror[square('d4')] === 'l' && state.mirror[square('e4')] === 'd' && state.four.visible === false, 'The table shows the four centre discs, with the chess pieces put away');

  // A click on d3 places the disc and turns d4; the regular answers.
  await page.locator('#table-game-panel [data-square=d3]').click();
  await page.waitForFunction(() => window.__riverPlazaGames().moves.length === 2, null, { timeout: 20000 });
  state = await games();
  check(state.moves[0] === 'd3' && /^[a-h][1-8]$/.test(state.moves[1]) && discs(state.board) === 6, `d3 turns d4, and the regular answers (${state.moves.join(' ')})`);
  check(discs(state.mirror) === 6 && state.mirror.join() === state.board.join() && /^Black \d+ · White \d+\. Your move, black\.$/.test(state.status), `The table follows, and the count is kept (${state.status})`);

  // Chess returns its pieces; Reversi resumes where it was.
  await choose('chess');
  state = await games();
  check(state.game === 'chess' && state.mirror.filter(Boolean).length === 32, 'Chess brings back its pieces');
  await choose('reversi');
  state = await games();
  check(state.game === 'reversi' && state.moves.length === 2 && discs(state.mirror) === 6, 'Reversi resumes, on the table too');
  await page.screenshot({ path: 'output/playwright/plaza-reversi.png' });

  // Pass and play through the shortest game there is: white is wiped out in nine moves.
  await page.locator('[data-action=new]').click();
  await page.locator('#table-game-panel [data-mode=pass]').click();
  for (const name of ['e6', 'f4', 'e3', 'f6', 'g5', 'd6', 'e7', 'f5', 'c5']) await page.locator(`#table-game-panel [data-square=${name}]`).click();
  state = await games();
  check(state.status === 'No moves left, 13 to 0. Black wins.' && await page.locator('#table-game-panel [data-target]').count() === 0, `Nine moves wipe white out and end the game (${state.status})`);
  await page.screenshot({ path: 'output/playwright/plaza-reversi-end.png' });

  // On a phone the four games still fit the sheet's switch.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const row = await switchFits();
  check(row.inside && row.wide && row.height >= 36, `At 390 px the game switch fits with full-size buttons (${JSON.stringify(row)})`);
  await page.screenshot({ path: 'output/playwright/plaza-reversi-phone.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  check(!await page.locator('#table-game-panel').evaluate(panel => panel.open), 'Escape puts the board away');
  return { checks };
}
