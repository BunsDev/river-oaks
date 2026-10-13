async page => {
  // Guided first games at the plaza tables: Lesson mode plays a short scripted game of each
  // kind. Each step marks its move, which is the only one allowed; the regular answers from
  // the script; a square off the script points back to the marks; and the practice game
  // waits, untouched, for your return.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const games = () => page.evaluate(() => window.__riverPlazaGames());
  const click = name => page.locator(`#table-game-panel .table-square[data-square=${name}]`).click();
  const choose = game => page.locator(`.table-game-choice [data-game=${game}]`).click();
  const hints = () => page.locator('#table-game-panel .table-square[data-lesson-hint]').evaluateAll(cells => Object.fromEntries(cells.map(cell => [cell.dataset.square, cell.dataset.lessonHint])));
  const targets = () => page.locator('#table-game-panel .table-square[data-target]').evaluateAll(cells => cells.map(cell => cell.dataset.square));
  const same = (actual, expected) => JSON.stringify(Object.entries(actual).sort()) === JSON.stringify(Object.entries(expected).sort());
  // The regular's scripted answer has landed and it is your move again (or the lesson is over).
  const settled = count => page.waitForFunction(n => { const state = window.__riverPlazaGames(); return state.moves.length === n && !state.thinking; }, count, { timeout: 15000 });
  // Play a lesson through: [from, to] for a moved piece, or one square for a placement.
  const playLesson = async (steps, plies) => {
    for (const [index, squares] of steps.entries()) {
      for (const square of squares) await click(square);
      await settled(plies[index]);
    }
  };

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

  // A practice move first, so the lessons can be seen to leave it alone.
  await click('e2'); await click('e4');
  await settled(2);
  const practice = (await games()).moves;
  check(practice[0] === 'e2e4' && practice.length === 2, `A practice game against the regular is under way (${practice.join(' ')})`);

  // Chess: the lesson opens on its first step, with the move marked.
  check(await page.locator('[data-mode=lesson]').textContent() === 'Lesson', 'The sheet offers a Lesson');
  await page.locator('[data-mode=lesson]').click();
  let state = await games();
  check(state.mode === 'lesson' && state.game === 'chess' && state.moves.length === 0 && state.lesson === '1' && state.player === 'w', `A chess lesson starts from the opening, you as white (${JSON.stringify({ mode: state.mode, lesson: state.lesson, moves: state.moves })})`);
  check(state.status.startsWith('Step 1 of 4. Pawns move straight ahead'), `The first step says what it teaches (${state.status})`);
  check(same(await hints(), { e2: 'from', e4: 'to' }), `The lesson marks the pawn and its square (${JSON.stringify(await hints())})`);
  check(await page.locator('#table-game-eyebrow').textContent() === 'Plaza games · lesson' && await page.locator('[data-mode=lesson]').getAttribute('aria-pressed') === 'true'
    && await page.locator('[data-action=new]').textContent() === 'Start again' && await page.locator('[data-side-index="1"]').isDisabled(), 'The sheet reads as a lesson: its eyebrow, the pressed mode, Start again, and no side to choose');
  check(state.mirror[28] === '' && state.mirror[12] === 'P', 'The table shows the lesson’s board, not the practice game');

  // Off the script: another pawn is not this step's move, and the status points back.
  await click('d2');
  state = await games();
  check(state.moves.length === 0 && /^Play the marked move\. Step 1 of 4\./.test(state.status) && await page.locator('#table-game-panel [data-selected]').count() === 0, `A square off the script is refused, pointing back to the marks (${state.status})`);
  // The marked pawn may go only to its marked square.
  await click('e2');
  check(JSON.stringify(await targets()) === '["e4"]', `The lesson allows only its move (${JSON.stringify(await targets())})`);
  await click('e4');
  await settled(2);
  state = await games();
  check(state.moves.join(' ') === 'e2e4 e7e5' && state.lesson === '2' && state.status.startsWith('Step 2 of 4. Bishops slide diagonally') && same(await hints(), { f1: 'from', c4: 'to' }), `The regular answers from the script and the next step is marked (${state.moves.join(' ')})`);
  await page.screenshot({ path: 'output/playwright/plaza-table-lessons-step.png' });
  await playLesson([['f1', 'c4'], ['d1', 'h5'], ['h5', 'f7']], [4, 6, 7]);
  state = await games();
  check(state.lesson === 'done' && /^Checkmate: the king is attacked/.test(state.status) && /Lesson done/.test(state.status) && Object.keys(await hints()).length === 0, `The lesson ends in checkmate (${state.status})`);
  check(state.mirror[53] === 'Q' && await page.locator('#table-game-panel').getAttribute('data-state') === 'over', 'The table’s pieces show the mate');
  await page.screenshot({ path: 'output/playwright/plaza-table-lessons-mate.png' });

  // Take back returns to the step; Start again returns to the first.
  await page.locator('[data-action=undo]').click();
  state = await games();
  check(state.moves.length === 6 && state.lesson === '4' && state.status.startsWith('Step 4 of 4.'), `Take back returns to the last step (${state.lesson})`);
  await page.locator('[data-action=new]').click();
  state = await games();
  check(state.moves.length === 0 && state.lesson === '1' && state.mode === 'lesson', 'Start again returns to the first step');

  // Connect Four: choosing another game keeps to lessons. Any cell of the marked column drops.
  await choose('connectFour');
  state = await games();
  check(state.game === 'connectFour' && state.mode === 'lesson' && state.lesson === '1' && same(await hints(), { d1: 'to' }), `Choosing Connect Four opens its lesson (${JSON.stringify(await hints())})`);
  await click('a1');
  check((await games()).moves.length === 0 && /^Play the marked move\./.test((await games()).status), 'A drop in another column is refused');
  await playLesson([['d6'], ['e1'], ['c1'], ['b1']], [2, 4, 6, 7]);
  state = await games();
  check(state.moves.join(' ') === 'd d e e c f b' && state.lesson === 'done' && /^Four in a row\. Lesson done/.test(state.status), `The Connect Four lesson ends with four in a row (${state.status})`);
  check(await page.locator('#table-game-panel .table-square[data-win]').count() === 4, 'The four are marked');

  // Morris: the mill's piece is taken on the board, and only the marked one.
  await choose('morris');
  await playLesson([['a1'], ['d1']], [2, 4]);
  await click('g1');
  state = await games();
  check(state.moves.length === 4 && same(await hints(), { a7: 'take' }) && state.status === 'A mill takes one of the regular’s pieces. Take a7.', `Closing the mill asks for the marked piece (${state.status})`);
  await click('d7');
  check((await games()).moves.length === 4, 'Another of the regular’s pieces is not this lesson’s take');
  await click('a7');
  await settled(6);
  await playLesson([['a7']], [7]);
  state = await games();
  check(state.moves.join(' ') === 'a1 a7 d1 d7 g1xa7 g7 a7' && state.lesson === 'done' && /^Mill made and mill blocked/.test(state.status), `The morris lesson makes a mill and blocks one (${state.status})`);

  // Checkers: a trade, then give one to take two with a double jump.
  await choose('checkers');
  check(same(await hints(), { c3: 'from', d4: 'to' }), 'The checkers lesson marks its first man');
  await playLesson([['c3', 'd4'], ['d4', 'f6'], ['d2', 'c3'], ['e3', 'd4'], ['f2', 'f6']], [2, 4, 6, 8, 9]);
  state = await games();
  check(state.moves.at(-1) === 'f2xd4xf6' && state.lesson === 'done' && /^Two for one/.test(state.status), `The checkers lesson ends with a double jump (${state.moves.join(' ')})`);

  // Reversi: trapping lines of discs, then a corner.
  await choose('reversi');
  await playLesson([['d3'], ['f5'], ['b3'], ['a1']], [2, 4, 6, 7]);
  state = await games();
  const diagonal = await page.locator('#table-game-panel').evaluate(panel => ['a1', 'b2', 'c3', 'd4', 'e5'].map(name => panel.querySelector(`[data-square=${name}] .table-piece`)?.dataset.side));
  check(state.lesson === 'done' && /^Corners are worth waiting for/.test(state.status) && diagonal.every(side => side === 'd'), `The Reversi corner turns the diagonal (${diagonal.join('')})`);

  // Back to practice: the chess game is exactly as it was left.
  await choose('chess');
  await page.locator('[data-mode=regular]').click();
  await settled(2);
  state = await games();
  check(state.mode === 'regular' && state.moves.join(' ') === practice.join(' ') && state.lesson === null && state.mirror[28] === 'P', `The practice game resumes where it was (${state.moves.join(' ')})`);
  check(await page.locator('#table-game-eyebrow').textContent() === 'Plaza games · practice game' && await page.locator('[data-action=new]').textContent() === 'New game', 'The sheet reads as practice again');

  // Lesson has its own row of the mode switch, on one line, beside the board and on a
  // phone-sized window; no mode label is clipped.
  await page.locator('[data-mode=lesson]').click();
  const modes = () => page.locator('#table-game-panel').evaluate(panel => {
    const box = panel.getBoundingClientRect(), group = panel.querySelector('.table-game-mode').getBoundingClientRect();
    const lesson = panel.querySelector('[data-mode=lesson]').getBoundingClientRect(), regular = panel.querySelector('[data-mode=regular]').getBoundingClientRect();
    return { fits: box.left >= 0 && box.right <= innerWidth && group.right <= box.right, overflow: document.documentElement.scrollWidth > innerWidth,
      clipped: [...panel.querySelectorAll('.table-game-mode button:not([hidden])')].some(button => button.scrollWidth > button.clientWidth + 1),
      ownRow: lesson.top >= regular.bottom - 1 && lesson.width > group.width * 0.9, lessonHeight: Math.round(lesson.height) };
  });
  const oneLine = layout => layout.fits && !layout.overflow && !layout.clipped && layout.ownRow && layout.lessonHeight <= 44;
  const wide = await modes();
  await page.screenshot({ path: 'output/playwright/plaza-table-lessons-wide.png' });
  check(oneLine(wide), `Lesson has its own row beside the board (${JSON.stringify(wide)})`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const narrow = await modes();
  check(oneLine(narrow), `Lesson keeps its row on a narrow screen (${JSON.stringify(narrow)})`);
  await page.screenshot({ path: 'output/playwright/plaza-table-lessons-narrow.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  return { checks };
}
