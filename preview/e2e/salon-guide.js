async page => {
  // The Salon Guide: "How to play" in each game sheet opens an illustrated book on that
  // game; its keys stay in the book, Escape returns to the sheet, and Play & rides
  // opens it too. It fits a phone, and reads in the dark theme.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const book = () => page.evaluate(() => {
    const dialog = document.querySelector('[data-guide-dialog]'), sheet = dialog?.querySelector('[role=tabpanel]');
    return dialog && { open: dialog.open, modal: dialog.matches(':modal'), game: sheet.dataset.guideGame, page: Number(sheet.dataset.guidePage), title: sheet.querySelector('h3')?.textContent,
      figure: Boolean(sheet.querySelector('.salon-guide-figure > :is(svg, .salon-emblem, .salon-keys)')), focus: document.activeElement?.closest('[data-guide-dialog]') ? (document.activeElement.dataset.guideGame ?? document.activeElement.className) : null,
      next: dialog.querySelector('.salon-guide-next').textContent.trim() };
  });
  const header = () => page.evaluate(() => {
    const head = document.querySelector('#table-game-panel .table-game-header'), button = head.querySelector('[data-guide-open]'), title = head.querySelector('h2'), eyebrow = head.querySelector('.table-game-eyebrow');
    const lines = node => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight || '20')) || 1;
    const rect = button.getBoundingClientRect(), close = head.querySelector('.table-game-close').getBoundingClientRect();
    return { label: button.getAttribute('aria-label'), isNew: button.hasAttribute('data-guide-new'), titleHeight: Math.round(title.getBoundingClientRect().height), eyebrowHeight: Math.round(eyebrow.getBoundingClientRect().height),
      inside: rect.right <= close.left + 1 && rect.top >= head.getBoundingClientRect().top, width: Math.round(rect.width), before: button.nextElementSibling?.classList.contains('table-game-close') };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.evaluate(() => { try { localStorage.removeItem('river-oaks-salon-guide-seen'); } catch {} });
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaGames?.(), null, { timeout: 90000 });

  // Every sheet has the button; the café and grove sheets name their own game.
  const labels = await page.evaluate(() => ['#table-game-panel', '#dominoes-panel', '#hearts-panel', '#backgammon-panel'].map(id => document.querySelector(`${id} .table-game-header [data-guide-open]`)?.getAttribute('aria-label') ?? null));
  check(labels.slice(1).join() === 'How to play Dominoes,How to play Hearts,How to play Backgammon', `Every game sheet has How to play in its header (${labels.join(' · ')})`);

  const chair = 'bench:plaza-salon-chess-west-0:0';
  check((await page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair)).ok, 'Arrived beside a chess table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.waitForFunction(() => /Play a table game/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 });
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyX');
  await page.locator('#table-game-panel[open]').waitFor();
  await page.locator('#table-game-panel .table-game-choice [data-game=chess]').click();
  let head = await header();
  check(head.label === 'How to play Chess' && head.isNew && head.before && head.inside, `The sheet offers How to play Chess, marked new, before its close button (${JSON.stringify(head)})`);
  check(head.titleHeight <= 30 && head.eyebrowHeight <= 18, `The sheet's title and eyebrow stay on one line each at 1440 px (${head.titleHeight}/${head.eyebrowHeight} px)`);
  await page.screenshot({ path: 'output/playwright/salon-guide-sheet.png' });

  // The book opens on the sheet's game, modal, with focus on that game.
  await page.locator('#table-game-panel [data-guide-open]').click();
  await page.waitForFunction(() => document.querySelector('[data-guide-dialog]')?.open);
  let state = await book();
  check(state.modal && state.game === 'chess' && state.page === 0 && state.title === 'Taking a seat' && state.focus === 'chess', `How to play opens the book on Chess, page I (${JSON.stringify(state)})`);
  await page.waitForTimeout(350); // the page turn settles
  await page.screenshot({ path: 'output/playwright/salon-guide-chess.png' });
  await page.keyboard.press('ArrowRight');
  state = await book();
  check(state.page === 1 && state.title === 'The aim' && state.figure, 'The right arrow turns to the next page, with its picture');
  await page.waitForTimeout(350); // the page turn settles
  await page.screenshot({ path: 'output/playwright/salon-guide-chess-aim.png' });
  // Its keys stay in the book: X does not put the board away, W does not walk.
  const before = await page.evaluate(() => window.__riverMultiplayer().snapshot.players.find(person => person.id === window.__riverMultiplayer().selfId)?.position);
  await page.keyboard.press('KeyX'); await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__riverMultiplayer().snapshot.players.find(person => person.id === window.__riverMultiplayer().selfId)?.position);
  check(await page.locator('#table-game-panel').evaluate(panel => panel.open) && (await book()).open && JSON.stringify(before) === JSON.stringify(after), 'Keys pressed in the book reach neither the sheet nor the world');
  // Escape closes only the book, and focus returns to How to play.
  await page.keyboard.press('Escape');
  check(!(await book()).open && await page.locator('#table-game-panel').evaluate(panel => panel.open), 'Escape closes the book and leaves the board open');
  check(await page.evaluate(() => document.activeElement?.matches('#table-game-panel [data-guide-open]')), 'Focus returns to How to play');
  check(!(await header()).isNew, 'Chess is no longer marked new once read');

  // Switching the sheet to Connect Four switches the button, and the book follows.
  await page.locator('#table-game-panel .table-game-choice [data-game=connectFour]').click();
  head = await header();
  check(head.label === 'How to play Connect Four' && head.isNew, `The button follows the sheet's game (${head.label})`);
  await page.locator('#table-game-panel [data-guide-open]').click();
  await page.waitForFunction(() => document.querySelector('[data-guide-dialog]')?.open);
  check((await book()).game === 'connectFour', 'The book opens on Connect Four');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playwright/salon-guide-four-aim.png' });
  await page.keyboard.press('ArrowLeft');
  // The game after Connect Four in the index, whichever chapter that is.
  const following = await page.locator('[data-guide-dialog] [role=tab][data-guide-game=connectFour] + [role=tab]').getAttribute('data-guide-game');
  await page.keyboard.press('ArrowDown');
  state = await book();
  check(state.game === following && state.page === 0 && state.focus === following, `Down the index moves to the next game (${following})`);
  await page.locator('[data-guide-dialog] [data-guide-game=backgammon]').click();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playwright/salon-guide-backgammon-turn.png' });
  const unscrolled = await page.evaluate(async () => {
    const dialog = document.querySelector('[data-guide-dialog]'), sheet = dialog.querySelector('[role=tabpanel]'), tight = [];
    for (const tab of dialog.querySelectorAll('[role=tab]')) {
      tab.click();
      for (let index = 0; index < 6; index++) {
        if (sheet.scrollHeight > sheet.clientHeight + 1) tight.push(`${sheet.dataset.guideGame} ${Number(sheet.dataset.guidePage) + 1}`);
        if (dialog.querySelector('.salon-guide-next').textContent.trim() !== 'Next ›') break;
        dialog.querySelector('.salon-guide-next').click();
      }
    }
    // The book ends with the last game in its index, whichever that is.
    [...dialog.querySelectorAll('.salon-guide-index [data-guide-game]')].at(-1).click();
    return tight;
  });
  check(!unscrolled.length, `Every page reads without scrolling at 1440 × 900 (${unscrolled.join(', ') || 'all fit'})`);
  await page.keyboard.press('End');
  state = await book();
  const lastGame = await page.evaluate(() => [...document.querySelectorAll('[data-guide-dialog] .salon-guide-index [data-guide-game]')].at(-1).dataset.guideGame);
  check(state.game === lastGame && state.title === 'At the table' && state.next === 'Back to the table', `The last page of the last game (${lastGame}) offers Back to the table (${state.next})`);
  await page.locator('[data-guide-dialog] .salon-guide-next').click();
  check(!(await book()).open, 'Back to the table closes the book');
  // A click outside the book closes it too.
  await page.locator('#table-game-panel [data-guide-open]').click();
  await page.waitForFunction(() => document.querySelector('[data-guide-dialog]')?.open);
  // Selecting text and dragging out of the book is not a click outside.
  const page3 = await page.locator('[data-guide-dialog] .salon-guide-text p').first().boundingBox();
  await page.mouse.move(page3.x + 20, page3.y + 8); await page.mouse.down(); await page.mouse.move(6, 450, { steps: 6 }); await page.mouse.up();
  check((await book()).open, 'Dragging from inside the book to outside it keeps the book open');
  await page.mouse.click(6, 450);
  check(!(await book()).open, 'A click outside the book closes it');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#table-game-panel').open);

  // Play & rides has the guide beside Photo mode.
  await page.locator('.visit-tools').evaluate(dock => { dock.open = true; });
  await page.locator('[data-guide-entry]').click();
  await page.waitForFunction(() => document.querySelector('[data-guide-dialog]')?.open);
  check((await book()).open, 'Play & rides opens the Salon Guide');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.locator('[data-guide-dialog] [data-guide-game=hearts]').click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playwright/salon-guide-hearts-dark.png' });
  await page.keyboard.press('Escape');

  // On a phone the sheet's How to play is a small medallion, and its header stays compact.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyX');
  await page.locator('#table-game-panel[open]').waitFor();
  head = await header();
  check(head.width <= 40 && head.inside && head.titleHeight <= 50 && head.eyebrowHeight <= 18, `At 390 px How to play is a 36 px medallion and the title takes at most two lines (${JSON.stringify(head)})`);
  await page.screenshot({ path: 'output/playwright/salon-guide-sheet-phone.png' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#table-game-panel').open);
  // On a phone: one column, nothing wider than the screen, the footer in view.
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.locator('[data-guide-entry]').click();
  await page.waitForFunction(() => document.querySelector('[data-guide-dialog]')?.open);
  await page.locator('[data-guide-dialog] [data-guide-game=checkers]').click(); await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(350);
  const fit = await page.evaluate(() => {
    const dialog = document.querySelector('[data-guide-dialog]'), rect = dialog.getBoundingClientRect(), footer = dialog.querySelector('.salon-guide-footer').getBoundingClientRect();
    const tabs = [...dialog.querySelectorAll('[role=tab]')].map(tab => tab.getBoundingClientRect());
    // The index row may scroll sideways when there are many games; everything else must fit.
    const row = dialog.querySelector('.salon-guide-index').getBoundingClientRect(), shown = tab => tab.left >= row.left - 1 && tab.right <= row.right + 1;
    const chosen = dialog.querySelector('[role=tab][aria-selected=true]').getBoundingClientRect();
    return { left: Math.round(rect.left), right: Math.round(rect.right), footerBottom: Math.round(footer.bottom), height: innerHeight, width: innerWidth,
      tabsInRow: new Set(tabs.map(tab => Math.round(tab.top))).size === 1, chosenShown: shown(chosen), targets: tabs.every(tab => tab.width >= 44 - 0.5 && tab.height >= 44 - 0.5),
      overflow: [...dialog.querySelectorAll('*')].filter(node => node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX !== 'visible' && !node.closest('svg') && !node.matches('.salon-guide-status, .salon-guide-index')).map(node => node.className).slice(0, 3) };
  });
  check(fit.left >= 0 && fit.right <= fit.width && fit.footerBottom <= fit.height && fit.tabsInRow && fit.chosenShown && fit.targets && !fit.overflow.length, `The book fits a 390 px phone (${JSON.stringify(fit)})`);
  // The last game, likely off the end of the row, scrolls into view when chosen.
  const lastShown = await page.evaluate(async () => {
    const dialog = document.querySelector('[data-guide-dialog]'), last = [...dialog.querySelectorAll('.salon-guide-index [role=tab]')].at(-1);
    last.click(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const row = dialog.querySelector('.salon-guide-index').getBoundingClientRect(), box = last.getBoundingClientRect();
    return last.getAttribute('aria-selected') === 'true' && box.left >= row.left - 1 && box.right <= row.right + 1;
  });
  check(lastShown, 'On a phone, choosing the last game scrolls its tab into view');
  await page.screenshot({ path: 'output/playwright/salon-guide-phone.png' });
  await page.keyboard.press('Escape');
  return { checks };
}
