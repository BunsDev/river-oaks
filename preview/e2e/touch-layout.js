async page => {
  // Touch layout pass (#288): at phone sizes, portrait and landscape, every
  // walking control is on screen, touch-sized and not covered; the panel and a
  // conversation scroll, their close controls stay reachable, and focus returns
  // to the control that opened them. Emulated phones in Chromium, not a device:
  // Safari's safe-area insets and software keyboard are not reproduced here.
  const checks = [], failures = [], errors = [], metrics = { sizes: {}, known: [] }, origin = 'http://127.0.0.1:5173';
  const expect = (ok, message, detail) => {
    (ok ? checks : failures).push(detail === undefined ? message : `${message} ${JSON.stringify(detail)}`);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
  };
  // A defect this lane found and recorded for a design decision instead of fixing.
  const known = (message, detail) => { metrics.known.push(`${message} ${JSON.stringify(detail)}`); console.log(`KNOWN ${message} ${JSON.stringify(detail)}`); };
  // The top-right HUD stack: People, Settings, Play & rides and Commands.
  const topRight = '#people-toggle, #settings-toggle, .visit-tools, .commands-toggle';
  const engine = page.context().browser().browserType().name();
  // Every shown control under `root`: on screen, at least 44 px and topmost at its centre.
  const audit = (tab, root) => tab.evaluate(([root, topRight]) => {
    // checkVisibility also leaves out the contents of a closed <details>, which are not rendered.
    const shown = node => node.checkVisibility({ visibilityProperty: true }) && node.getClientRects().length > 0;
    return [...document.querySelectorAll(`${root} :is(button, summary, a[href], input, select)`)].filter(shown).map(node => {
      const box = node.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
      const top = document.elementFromPoint(x, y);
      return { name: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 40) || node.id, pad: Boolean(node.closest('.walking-pad')), width: Math.round(box.width), height: Math.round(box.height),
        inside: box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1, topmost: Boolean(top && (top === node || node.contains(top))),
        covering: top && top !== node && !node.contains(top) ? (({ id, className, tagName }) => id || className?.toString().slice(0, 40) || tagName)(top.closest('button, summary, a, [id]') ?? top) : null,
        topRight: Boolean(top?.closest(topRight)) };
    });
  }, [root, topRight]);
  // Layout settles within a few frames of a resize or a toggle.
  const frames = (tab, count = 6) => tab.evaluate(count => new Promise(resolve => { const next = () => --count <= 0 ? resolve() : requestAnimationFrame(next); requestAnimationFrame(next); }), count);
  const expanded = (tab, selector, value) => tab.waitForFunction(([selector, value]) => document.querySelector(selector)?.getAttribute('aria-expanded') === value, [selector, String(value)]);
  const overflow = tab => tab.evaluate(() => ({ page: document.documentElement.scrollWidth - innerWidth, body: document.body.scrollWidth - innerWidth }));
  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const context = await page.context().browser().newContext({ viewport, hasTouch: true, isMobile: engine === 'chromium', reducedMotion: 'no-preference' });
    await context.addCookies(await page.context().cookies());
    const tab = await context.newPage();
    tab.on('pageerror', error => errors.push(error.message));
    try {
      await tab.goto(`${origin}/?motion-debug=1`);
      await tab.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true' && window.__riverMultiplayer?.().connected, null, { timeout: 90000 });
      await tab.locator('#loading').waitFor({ state: 'hidden' });
      if (await tab.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await tab.locator('#panel-toggle').click();
      for (const orientation of ['portrait', 'landscape']) {
        const size = orientation === 'portrait' ? viewport : { width: viewport.height, height: viewport.width }, label = `${size.width}×${size.height}`;
        await tab.setViewportSize(size); await tab.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [size.width, size.height]); await frames(tab);
        const spill = await overflow(tab);
        expect(spill.page <= 1 && spill.body <= 1, `${label}: no horizontal page scroll`, spill);
        if (await tab.locator('#walking-controls-toggle').getAttribute('aria-expanded') !== 'true') await tab.locator('#walking-controls-toggle').click();
        // An open chat dock hides the walking console on small screens, and it opens by default.
        metrics[`${label}ChatHidesPad`] = await tab.evaluate(() => document.querySelector('.town-chat-dock').open && !document.querySelector('[data-walk-key=KeyW]').checkVisibility({ visibilityProperty: true }));
        if (await tab.locator('.town-chat-dock').evaluate(dock => dock.open)) {
          await tab.locator('.town-chat-toggle').tap();
          await tab.waitForFunction(() => !document.querySelector('.town-chat-dock').open); await frames(tab);
        }
        const controls = await audit(tab, '#walking-hud');
        const pad = controls.filter(control => control.pad);
        expect(pad.length === 6, `${label}: with chat folded, all six movement buttons show`, pad.map(control => control.name));
        metrics.sizes[label] = controls;
        const offscreen = controls.filter(c => !c.inside), covered = controls.filter(c => !c.topmost), small = controls.filter(c => c.height < 44 || (c.pad && c.width < 44));
        expect(!offscreen.length, `${label}: every walking control is on screen`, offscreen);
        // Landscape phones have no room for the walking console below the top-right stack:
        // that overlap is recorded for a layout decision. Any other cover still fails.
        const stacked = orientation === 'landscape' ? covered.filter(c => c.topRight) : [];
        if (stacked.length) known(`${label}: the top-right HUD covers walking controls`, stacked.map(c => `${c.name} under ${c.covering}`));
        expect(covered.length === stacked.length, `${label}: no walking control is covered by another surface`, covered.filter(c => !stacked.includes(c)));
        expect(!small.length, `${label}: walking controls are at least 44 px`, small);
        // The panel opens over the scene, scrolls, and closes back to its toggle.
        await tab.locator('#panel-toggle').click(); await expanded(tab, '#panel-toggle', true); await frames(tab);
        const panel = await tab.evaluate(() => {
          const scroll = document.querySelector('.field-panel .panel-scroll') ?? document.querySelector('.field-panel'), box = document.querySelector('.field-panel').getBoundingClientRect();
          return { scrollable: scroll.scrollHeight <= scroll.clientHeight + 1 || ['auto', 'scroll'].includes(getComputedStyle(scroll).overflowY), inside: box.left >= -1 && box.right <= innerWidth + 1, height: scroll.clientHeight, content: scroll.scrollHeight };
        });
        expect(panel.scrollable && panel.inside, `${label}: the panel fits the width and scrolls its content`, panel);
        await tab.locator('#panel-toggle').click(); await expanded(tab, '#panel-toggle', false); await frames(tab);
        expect(await tab.evaluate(() => document.activeElement?.id === 'panel-toggle'), `${label}: closing the panel keeps focus on its toggle`, { focus: await tab.evaluate(() => document.activeElement?.id || document.activeElement?.tagName) });
        // A conversation scrolls and its close control returns focus to the opener.
        const meet = tab.locator('#walking-meet-nearby');
        if (await meet.isEnabled() && await tab.evaluate(() => !document.querySelector('#walking-meet-nearby').closest('[hidden]'))) {
          // The button may sit under More; a player taps More open first.
          if (await meet.evaluate(button => Boolean(button.closest('details:not([open])')))) await tab.locator('#walking-hud .walking-more > summary').tap();
          await tab.touchscreen.tap(...await meet.evaluate(button => { const box = button.getBoundingClientRect(); return [box.left + box.width / 2, box.top + box.height / 2]; }));
          await tab.locator('#community-dialogue').waitFor({ state: 'visible', timeout: 10000 });
          const dialogue = await audit(tab, '#community-dialogue');
          expect(dialogue.every(c => c.inside || c.name === ''), `${label}: conversation controls are on screen`, dialogue.filter(c => !c.inside));
          await tab.locator('#community-close').click(); await tab.locator('#community-dialogue').waitFor({ state: 'hidden' }); await frames(tab);
          metrics[`${label}CloseFocus`] = await tab.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName);
          expect(['walking-meet-nearby', 'canvas-host'].includes(metrics[`${label}CloseFocus`]), `${label}: closing a conversation returns focus to the scene or its opener`, metrics[`${label}CloseFocus`]);
          if (await tab.locator('#walking-hud .walking-more').evaluate(more => more.open)) { await tab.locator('#walking-hud .walking-more > summary').tap(); await frames(tab); }
        } else metrics[`${label}Conversation`] = 'nobody nearby to meet';
        await tab.screenshot({ path: `output/playwright/touch-layout-${engine}-${label}.png` });
      }
    } finally { await context.close(); }
  }
  expect(errors.length === 0, 'no uncaught browser errors', errors);
  if (failures.length) throw new Error(`touch-layout: ${failures.length} failed: ${failures.join(' | ')}`);
  return { checks, metrics, errors };
}
