async (page, { worldMapEnabled = false } = {}) => {
  const checks = [], errors = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true');
  const host = page.locator('#canvas-host'), trigger = page.locator('#panel-toggle'), dock = page.locator('.visit-tools'), menu = page.locator('.rail-commands'), search = page.locator('#rail-command-search');
  const expanded = () => trigger.getAttribute('aria-expanded');
  const selected = () => page.locator('[role=tab][aria-selected=true]').getAttribute('id');
  const focus = () => page.evaluate(() => document.activeElement.id);
  const exposed = () => page.evaluate(() => {
    const node = document.activeElement, rect = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  });
  await host.focus();
  const flight = await page.locator('#player-flight').getAttribute('aria-pressed');
  check(await page.locator('.clear-view-toggle').count() === 0, 'Commands replaces the standalone Clear view button');
  check(await page.locator('.world-map').count() === (worldMapEnabled ? 1 : 0), 'World map creation respects the environment flag');
  check(await page.locator('.world-portal').count() === (worldMapEnabled ? 1 : 0), 'Worlds directory and publishing controls respect the environment flag');
  await page.keyboard.press('Control+b');
  check(await expanded() === 'true' && await focus() === 'rail-tab-0', 'Ctrl+B opens the left rail and focuses its selected tab');
  await page.keyboard.press('Meta+b');
  check(await expanded() === 'false' && await focus() === 'canvas-host', 'Cmd+B closes the rail and returns to the world');
  check(await page.locator('#player-flight').getAttribute('aria-pressed') === flight, 'Rail modifier chords never trigger B flight');
  await host.evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', key: 'b', ctrlKey: true, repeat: true, bubbles: true })));
  check(await expanded() === 'false', 'Held shortcut repeats do not retrigger the rail');
  await host.evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', key: 'b', ctrlKey: true, isComposing: true, bubbles: true })));
  check(await expanded() === 'false', 'IME composition does not toggle a rail');
  const camera = await page.locator('#player-camera').getAttribute('aria-pressed');
  await page.keyboard.press('Meta+v');
  check(await page.locator('#player-camera').getAttribute('aria-pressed') === camera, 'Paste chord does not switch gameplay camera');

  await page.keyboard.press('Alt+2');
  check(await selected() === 'rail-tab-1', 'Alt+2 opens Places directly');
  await host.focus(); await page.keyboard.press('/');
  check(await focus() === 'store-search', '/ focuses destination search');
  await page.locator('#store-search').fill('h');
  await page.keyboard.press('Meta+b'); await page.keyboard.press('Control+Shift+b'); await page.keyboard.press('?');
  check(await expanded() === 'true' && !await menu.isVisible() && await focus() === 'store-search', 'Text fields retain rail chords and help characters');
  await page.locator('#store-search').evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', {code:'Escape',key:'Escape',isComposing:true,bubbles:true})));
  check(await expanded() === 'true' && await focus() === 'store-search', 'Composing Escape leaves the exploration rail and text focus intact');
  await page.keyboard.press('Escape');
  check(await expanded() === 'false' && await focus() === 'canvas-host', 'Escape from the left rail returns to the world');

  await page.keyboard.press('Control+k');
  check(await menu.isVisible() && await focus() === 'rail-command-search', 'Commands open as a focused modal dialog');
  check(await menu.getByRole('button', { name: 'World map', exact: true }).count() === (worldMapEnabled ? 1 : 0), 'Commands offers World map only when enabled');
  if (!worldMapEnabled) check(await menu.getByRole('button', { name: 'Browse shared worlds', exact: true }).count() === 0, 'Commands omits shared worlds when disabled');
  check(await menu.getByRole('button', { name: 'Build & decorate', exact: true }).count() === 0, 'Solo command list omits unavailable shared building');
  await search.fill('no such activity');
  check((await menu.locator('.commands-count').textContent()).startsWith('No matching'), 'Command search explains an empty result');
  await search.fill('rides'); await page.keyboard.press('ArrowDown');
  check(await page.evaluate(() => document.activeElement.textContent === 'Rides & camera'), 'Arrow keys navigate filtered command actions');
  await page.keyboard.press('Enter');
  check(!await menu.isVisible() && await dock.evaluate(node => node.open) && await page.locator('.player-settings').evaluate(node => node.open), 'Executing a command reveals the play rail and nested rides controls');
  check(await focus() === 'player-camera', 'Play command focuses the revealed control');
  await page.locator('#player-camera').evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', {code:'Escape',key:'Escape',isComposing:true,bubbles:true})));
  check(await dock.evaluate(node => node.open) && await focus() === 'player-camera', 'Composing Escape leaves the play rail and focus intact');
  check(await exposed(), 'Nested play controls are exposed below the persistent activity navigation');
  await page.keyboard.press('Escape');
  check(!await dock.evaluate(node => node.open) && await focus() === 'canvas-host', 'Escape closes the play rail with a safe focus handoff');
  await page.keyboard.press('Meta+Shift+b');
  check(await dock.evaluate(node => node.open), 'Cmd+Shift+B opens the play rail');
  await host.focus(); await page.keyboard.press('Control+Shift+b');
  check(!await dock.evaluate(node => node.open), 'Ctrl+Shift+B closes the play rail');
  await page.keyboard.press('?'); await page.keyboard.press('Escape');
  check(!await menu.isVisible() && await focus() === 'canvas-host', 'Help can be dismissed without losing previous focus');
  await page.evaluate(() => {
    const modal = document.createElement('dialog'); modal.id = 'test-modal'; modal.innerHTML = '<button>Modal control</button>'; document.body.append(modal); modal.showModal(); modal.querySelector('button').focus();
  });
  await page.keyboard.press('Control+b'); await page.keyboard.press('Control+k');
  check(await expanded() === 'false' && !await menu.isVisible(), 'Other modal dialogs retain exclusive keyboard ownership');
  const clearViewBefore = await page.evaluate(() => document.body.classList.contains('clear-view'));
  await page.keyboard.press('h');
  check(await page.evaluate(() => document.body.classList.contains('clear-view')) === clearViewBefore, 'Plain modal keys do not toggle clear view');
  await page.evaluate(() => { document.querySelector('#test-modal').close(); document.querySelector('#test-modal').remove(); });

  await host.focus(); await page.keyboard.press('Alt+3');
  await page.locator('.panel-scroll').evaluate(node => { node.scrollTop = 180; });
  const scroll = await page.locator('.panel-scroll').evaluate(node => node.scrollTop);
  check(scroll > 100, 'Settings has real scrollable content for navigation acceptance');
  await page.keyboard.press('Alt+1'); await page.keyboard.press('Alt+3');
  check(await page.locator('.panel-scroll').evaluate(node => node.scrollTop) === scroll, 'Each tab restores its reading position');
  await page.keyboard.press('Home'); check(await selected() === 'rail-tab-0', 'Home selects the first tab');
  await page.keyboard.press('End'); check(await selected() === 'rail-tab-2', 'End selects the last tab');
  await page.keyboard.press('ArrowRight'); check(await selected() === 'rail-tab-0', 'Linear tab navigation wraps predictably');
  await page.keyboard.press('Alt+3');
  await page.locator('[data-theme-preference=dark]').click();
  await page.screenshot({ path: 'output/playwright/rails-desktop-dark.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('h');
  check(await page.evaluate(() => document.body.classList.contains('clear-view')), 'Clear view remains available');
  await page.keyboard.press('Control+Shift+b');
  check(!await page.evaluate(() => document.body.classList.contains('clear-view')) && await dock.evaluate(node => node.open), 'Requesting hidden play controls recovers clear view');
  await page.locator('.commands-toggle').click();
  await menu.getByRole('button', { name: /^Clear view/ }).click();
  check(await page.evaluate(() => document.body.classList.contains('clear-view')), 'Commands can hide the visit controls');
  await page.locator('.commands-toggle').click();
  await menu.getByRole('button', { name: /^Show controls/ }).click();
  check(!await page.evaluate(() => document.body.classList.contains('clear-view')), 'Commands can restore the visit controls');
  await dock.getByRole('button', { name: 'Rides', exact: true }).focus(); await page.keyboard.press('h');
  check(await page.evaluate(() => document.activeElement.classList.contains('commands-toggle')), 'H hands focus to Commands before hiding a focused card');
  await page.keyboard.press('h');
  check(!await dock.getByRole('button', { name: 'Build', exact: true }).isVisible(), 'Play navigation omits unavailable activities');
  check(await page.evaluate(() => Boolean(document.querySelector('.bird-cams').compareDocumentPosition(document.querySelector('.invasion-controls')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Play card order follows its stable activity navigation');
  await dock.getByRole('button', { name: 'Birds', exact: true }).click();
  check(await page.evaluate(() => document.activeElement.closest('.bird-cams') !== null), 'Play activity jump reveals and focuses its destination');
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true');
  check(await selected() === 'rail-tab-2' && await expanded() === 'false' && !await dock.evaluate(node => node.open), 'Tab and both rail preferences survive reload');

  for (const [width, height] of [[390, 844], [844, 390], [1024, 600]]) {
    await page.setViewportSize({ width, height });
    await host.focus(); await page.keyboard.press('Control+b');
    check(await expanded() === 'true', `${width}×${height}: left rail opens`);
    await host.focus(); await page.keyboard.press('Control+Shift+b');
    check(await expanded() === 'false' && await dock.evaluate(node => node.open), `${width}×${height}: play rail has room without competing left rail`);
    await page.screenshot({ path: `output/playwright/rails-${width}x${height}.png` });
    await dock.getByRole('button', { name: 'Rides', exact: true }).click();
    check(await focus() === 'player-camera' && await exposed(), `${width}×${height}: activity jump leaves its focused control exposed`);
    const fixedNav = await dock.locator('.play-rail-nav').evaluate(node => {
      const nav = node.getBoundingClientRect(), cards = document.querySelector('.visit-tools-content').getBoundingClientRect();
      return nav.bottom <= cards.top && nav.top >= 0;
    });
    check(fixedNav, `${width}×${height}: activity navigation remains above the scrolling cards`);
    await dock.locator('summary').first().focus(); await page.keyboard.press('Escape');
    await page.locator('.commands-toggle').click();
    check(await menu.isVisible(), width+'×'+height+': Commands remains pointer-reachable');
    if (worldMapEnabled) {
      await search.fill('world map'); await page.keyboard.press('Enter');
      check(await focus() === '' && await page.evaluate(() => document.activeElement.classList.contains('world-map-surface')), `${width}×${height}: command opens the map with keyboard focus`);
    } else {
      await search.fill('world map');
      check((await menu.locator('.commands-count').textContent()).startsWith('No matching'), `${width}×${height}: disabled World map is unavailable`);
      await page.keyboard.press('Escape');
      await host.focus(); await page.keyboard.press('Alt+2');
    }
    check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${width}×${height}: no page overflow`);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await host.focus(); await page.keyboard.press('Alt+1');
  await page.locator('#community-local').selectOption('local-00'); await page.locator('#community-meet').click();
  await page.locator('#community-dialogue').waitFor({ state: 'visible' });
  await host.focus(); await page.keyboard.press('Control+Shift+b');
  check(!await page.locator('#community-dialogue').isVisible() && await dock.isVisible(), 'Requesting play controls dismisses a competing compact conversation');
  await dock.locator('summary').first().focus(); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 800 });
  await host.focus(); await page.keyboard.press('Control+Shift+b');
  await dock.getByRole('button', { name: 'Birds', exact: true }).click();
  await page.locator('.bird-cams-row[data-bird=dove] button').click();
  await page.waitForFunction(() => document.body.classList.contains('bird-riding'));
  const birdBeforeModal = await page.locator('#bird-ride-name').textContent();
  const controlBeforeModal = await page.locator('#bird-ride-control').textContent();
  await page.evaluate(() => {
    const modal = document.createElement('dialog'); modal.id = 'bird-test-modal';
    modal.innerHTML = '<button>Modal control</button>'; document.body.append(modal);
    modal.showModal(); modal.querySelector('button').focus();
  });
  await page.keyboard.press('t'); await page.keyboard.press('n'); await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.body.classList.contains('bird-riding'))
    && await page.locator('#bird-ride-name').textContent() === birdBeforeModal
    && await page.locator('#bird-ride-control').textContent() === controlBeforeModal
    && !await page.locator('#bird-test-modal').evaluate(node => node.open), 'A native modal owns T, N and Escape without changing or landing the bird ride');
  await page.evaluate(() => document.querySelector('#bird-test-modal').remove());
  await host.focus(); await page.keyboard.press('?');
  check(await menu.locator('.commands-reference').evaluate(node => node.open)
    && (await menu.locator('.commands-reference p').textContent()).startsWith('Bird ride:'), 'Help shows keys for the current bird ride');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.body.classList.contains('bird-riding')), 'Closing commands does not land a bird');
  await page.keyboard.press('Control+b'); await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.body.classList.contains('bird-riding')), 'Reading and dismissing the left rail does not interrupt the bird ride');
  await page.keyboard.press('Control+Shift+b');
  check(await dock.isVisible(), 'Play rail can be explicitly requested during a bird ride');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.body.classList.contains('bird-riding')) && await focus() === 'canvas-host', 'Escape dismisses requested play controls before landing');
  await page.keyboard.press('Escape');
  check(!await page.evaluate(() => document.body.classList.contains('bird-riding')), 'Escape in the world still lands the bird');
  await page.keyboard.press('Control+Shift+b');
  await dock.getByRole('button', {name:'Jev',exact:true}).click();
  await page.locator('#auto-toggle').click();
  await page.waitForFunction(() => document.querySelector('#auto-toggle').getAttribute('aria-pressed') === 'true');
  await page.evaluate(() => {
    const modal = document.createElement('dialog'); modal.id = 'auto-test-modal';
    modal.innerHTML = '<button>Modal control</button>'; document.body.append(modal);
    modal.showModal(); modal.querySelector('button').focus();
  });
  await page.keyboard.press('Escape');
  check(await page.locator('#auto-toggle').getAttribute('aria-pressed') === 'true'
    && !await page.locator('#auto-test-modal').evaluate(node => node.open), 'Dismissing another native modal preserves the guided visit');
  await page.evaluate(() => document.querySelector('#auto-test-modal').remove());
  await page.locator('#auto-toggle').click();
  await host.focus(); await page.keyboard.press('?');
  const reference = menu.locator('.commands-reference > summary');
  await reference.focus(); await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.activeElement.closest('.rail-commands') !== null), 'Command dialog wraps focus at the last control');
  await page.keyboard.press('Shift+Tab');
  check(await reference.evaluate(node => node === document.activeElement), 'Command dialog wraps backward to its last control');
  await page.screenshot({ path: 'output/playwright/rails-commands.png' });
  await page.keyboard.press('Escape');
  check(!errors.length, `No page errors: ${errors.join('; ')}`);
  return { checks, errors };
}
