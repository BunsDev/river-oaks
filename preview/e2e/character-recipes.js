async page => {
  // Make your own: the Studio's random start, slider, dice and lock edits on the
  // live preview, a run of random people for inspection, and wearing one so a
  // second account sees the same recipe on the same body.
  const origin = 'http://127.0.0.1:5173', checks = [], errors = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  const ready = p => p.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host').dataset.playerReady === 'true', null, { timeout: 90000 });
  page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
  await page.goto(origin + '/?motion-debug=1'); await ready(page);
  const before = await page.locator('#canvas-host').getAttribute('data-player-appearance');
  if (!await page.locator('.visit-tools').evaluate(node => node.open)) await page.locator('.visit-tools-toggle').click();
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  await page.getByRole('button', { name: 'Open character studio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Character studio' });
  const recipe = async () => JSON.parse(await dialog.getAttribute('data-recipe'));
  // The preview has loaded exactly the staged recipe (its body, face and colours).
  const shown = () => page.waitForFunction(() => { const studio = document.querySelector('.character-studio'), preview = document.querySelector('.cs-preview');
    return preview.dataset.ready === 'true' && studio.dataset.recipe && preview.dataset.loadedLook === `custom-human:${studio.dataset.recipe}`; }, null, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('.character-studio').dataset.accountPhase === 'ready');
  check(await dialog.getAttribute('data-mode') === 'create' && await dialog.getAttribute('data-appearance') === 'custom-human', 'The Studio opens on a random person of your own');
  await shown(); const start = await recipe();
  check(await dialog.locator('[data-character=custom] input').isChecked() && await dialog.locator('[data-cs-wardrobe-step]').isHidden(), 'Your own is chosen in the roster, with the recipe editor in place of authored wardrobes');
  await page.screenshot({ path: 'output/playwright/character-recipe-start.png' });
  // Every category's dice and lock can be pressed: nothing in its category lies over them.
  const covered = await dialog.evaluate(node => [...node.querySelectorAll('.cs-tools button')].filter(button => {
    button.scrollIntoView({ block: 'center' }); const box = button.getBoundingClientRect();
    return !button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  }).map(button => button.getAttribute('aria-label')));
  check(covered.length === 0, `Every roll and keep button is uncovered${covered.length ? `: ${covered.join(', ')}` : ''}`);
  // Each face slider has room to travel beside its label and value.
  const tracks = await dialog.evaluate(node => [...node.querySelectorAll('.cs-face input[type=range]')].map(input => Math.round(input.getBoundingClientRect().width)));
  check(tracks.length === 16 && Math.min(...tracks) >= 120, `Face sliders are at least 120 px wide (${Math.min(...tracks)} px)`);
  // A face slider moves by keyboard and changes only its feature.
  const nose = dialog.getByRole('slider', { name: 'Nose width', exact: true });
  await nose.focus(); for (let i = 0; i < 4; i++) await page.keyboard.press(start.face.noseWidth >= 80 ? 'ArrowLeft' : 'ArrowRight');
  await shown(); const nosed = await recipe();
  check(Math.abs(nosed.face.noseWidth - start.face.noseWidth) === 20 && JSON.stringify({ ...nosed.face, noseWidth: 0 }) === JSON.stringify({ ...start.face, noseWidth: 0 }) && nosed.skin === start.skin, 'A face slider changes only its own feature');
  check(/Nose width/.test(await nose.getAttribute('aria-label')) && Boolean(await nose.getAttribute('aria-valuetext')), 'Sliders name their feature and speak their value');
  // An edit restages the figure in the same preview: the canvas stays, and the caption names the look.
  check(await dialog.locator('.cs-preview canvas').count() === 1 && await dialog.locator('.cs-caption [data-look]').innerText() === 'Your own · river oaks resident · human'
    && /^Live preview: Your own, /.test(await dialog.locator('.cs-preview canvas').getAttribute('aria-label')), 'An edit keeps the live preview and its caption');
  // Each keyboard step is its own edit, so four undos walk the slider back.
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  await shown(); check(JSON.stringify(await recipe()) === JSON.stringify(start), 'Undo from a slider restores the face');
  // Dice roll one category; a lock keeps its category through Surprise me.
  await dialog.getByRole('button', { name: 'Roll face', exact: true }).click(); await shown(); const rolled = await recipe();
  check(JSON.stringify(rolled.face) !== JSON.stringify(start.face) && rolled.skin === start.skin && rolled.body === start.body && rolled.hairStyle === start.hairStyle, 'Rolling the face changes only the face');
  await dialog.getByRole('button', { name: 'Keep skin when surprising', exact: true }).click();
  check(await dialog.getByRole('button', { name: 'Keep skin when surprising', exact: true }).getAttribute('aria-pressed') === 'true', 'The skin lock is pressed');
  for (let i = 0; i < 3; i++) { const was = await recipe(); await dialog.getByRole('button', { name: 'Surprise me', exact: true }).click(); await shown(); const now = await recipe(); check(now.skin === rolled.skin && JSON.stringify(now) !== JSON.stringify(was), `Surprise ${i + 1} keeps the locked skin and changes the rest`); }
  await dialog.getByRole('button', { name: 'Keep skin when surprising', exact: true }).click();
  // The frame keeps the outfit style; height reaches its limit by keyboard.
  const frame = (await recipe()).body.startsWith('woman') ? 'Masculine' : 'Feminine', outfitBefore = (await recipe()).body;
  await dialog.locator('[data-cs-frames]').getByRole('radio', { name: frame, exact: true }).click(); await shown();
  check((await recipe()).body !== outfitBefore && (await recipe()).body.startsWith(frame === 'Masculine' ? 'man' : 'woman'), `Switching to the ${frame.toLowerCase()} frame keeps an outfit of the same style`);
  await dialog.getByRole('slider', { name: 'Height', exact: true }).focus(); await page.keyboard.press('End'); await shown();
  check((await recipe()).height === 200, 'Height reaches 200 cm');
  await dialog.locator('[name=framing]').selectOption('full'); await page.screenshot({ path: 'output/playwright/character-recipe-tall.png' });
  await dialog.getByRole('slider', { name: 'Height', exact: true }).focus(); await page.keyboard.press('Home'); await shown(); check((await recipe()).height === 150, 'Height reaches 150 cm');
  await page.screenshot({ path: 'output/playwright/character-recipe-short.png' });
  // A run of random people, full length and portrait, for inspection.
  for (let i = 0; i < 6; i++) {
    await dialog.getByRole('button', { name: 'Surprise me', exact: true }).click(); await shown();
    await dialog.locator('[name=framing]').selectOption('full'); await page.waitForTimeout(150);
    await page.locator('.cs-stage').screenshot({ path: `output/playwright/character-recipe-${i}-full.png` });
    await dialog.locator('[name=framing]').selectOption('portrait'); await page.waitForTimeout(150);
    await page.locator('.cs-stage').screenshot({ path: `output/playwright/character-recipe-${i}-face.png` });
  }
  // Mix and match: a top, a bottom from another suit and another pair of shoes, from the frame's wardrobe only.
  const offered = name => dialog.locator(`[name=${name}]`).evaluateAll(inputs => inputs.filter(input => !input.closest('label').hidden).map(input => input.value));
  const was = await recipe(), prefix = was.body.startsWith('woman') ? 'female_' : 'male_';
  check([...await offered('cs-top'), ...await offered('cs-bottom')].every(id => id.startsWith(prefix)), `Only the ${prefix.slice(0, -1)} frame's tops and bottoms are offered`);
  const top = (await offered('cs-top')).find(id => id !== was.top), bottom = (await offered('cs-bottom')).find(id => id !== was.bottom && id.split('-')[0] !== top.split('-')[0]);
  const footwear = (await offered('cs-footwear')).find(id => id !== was.footwear);
  for (const [name, value] of [['cs-top', top], ['cs-bottom', bottom], ['cs-footwear', footwear]]) { await dialog.locator(`[name=${name}][value="${value}"]`).click(); await shown(); }
  const mixed = await recipe();
  check(mixed.top === top && mixed.bottom === bottom && mixed.footwear === footwear && mixed.body === was.body && mixed.skin === was.skin && mixed.height === was.height, 'A top, a bottom from another suit and other shoes stage on the same person');
  await dialog.locator('[name=framing]').selectOption('full'); await page.waitForTimeout(150);
  await page.locator('.cs-stage').screenshot({ path: 'output/playwright/character-recipe-wardrobe.png' });
  check(await page.locator('#canvas-host').getAttribute('data-player-appearance') === before, 'Editing never changes the town appearance');
  // Wear it: the town confirms the recipe, the player reloads its body, and a peer sees the same look.
  const peerContext = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  try {
    await peerContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
    const peer = await peerContext.newPage(); peer.on('pageerror', error => errors.push(error.message)); await peer.goto(origin + '/?motion-debug=1'); await ready(peer);
    const worn = await recipe(), look = `custom-human:${JSON.stringify(worn)}`;
    await dialog.locator('[data-wear]').click();
    await page.waitForFunction(look => document.querySelector('#canvas-host').dataset.playerLook === look && document.querySelector('#canvas-host').dataset.playerReady === 'true', look, { timeout: 90000 });
    check(true, 'The town confirms the recipe and the player wears its body');
    await peer.waitForFunction(look => window.__riverMultiplayer().remotes.some(player => player.id === 'alice' && player.ready && player.look === look), look, { timeout: 90000 });
    check(true, 'A second account loads the same recipe on the same body');
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'output/playwright/character-recipe-worn.png' });
  } finally { await peerContext.close(); }
  // On a phone the editor stacks in one column: no sideways scroll, and touch edits the recipe.
  const touch = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  try {
    await touch.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
    const phone = await touch.newPage(); phone.setDefaultTimeout(60000); phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(origin + '/?motion-debug=1'); await phone.locator('#loading').waitFor({ state: 'hidden' }); await phone.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true');
    if (!await phone.locator('.visit-tools').evaluate(node => node.open)) await phone.locator('.visit-tools-toggle').tap();
    const entry = phone.getByRole('button', { name: 'Open character studio', exact: true }); await entry.scrollIntoViewIfNeeded(); await entry.tap();
    const mobile = phone.getByRole('dialog', { name: 'Character studio' });
    await phone.waitForFunction(() => document.querySelector('.character-studio').dataset.mode === 'create' && document.querySelector('.cs-preview').dataset.ready === 'true');
    check(await mobile.evaluate(node => node.scrollWidth <= node.clientWidth && [...node.querySelectorAll('[data-cs-create] input, [data-cs-create] button')].every(control => { const box = control.getBoundingClientRect(); return box.width === 0 || (box.left >= -1 && box.right <= innerWidth + 1); })), 'Phone: every recipe control fits the width');
    const was = JSON.parse(await mobile.getAttribute('data-recipe')), skin = await mobile.locator(`[data-cs-create] [name=cs-skin]:not([value=${was.skin}])`).first();
    const want = await skin.getAttribute('value'); await skin.scrollIntoViewIfNeeded(); await mobile.locator(`[data-skin=${want}]`).tap();
    check(JSON.parse(await mobile.getAttribute('data-recipe')).skin === want, 'Phone: tapping a skin swatch stages it');
    await phone.screenshot({ path: 'output/playwright/character-recipe-phone.png' });
  } finally { await touch.close(); }
  check(errors.length === 0, `No runtime errors: ${errors.join('; ')}`);
  return { passed: true, checks, scope: 'Desktop and phone-size Chromium Make your own journey with fixture accounts; visual inspection of the saved captures is separate' };
}
