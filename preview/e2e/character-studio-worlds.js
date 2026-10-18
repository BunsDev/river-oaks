async page => {
  const origin = 'http://127.0.0.1:5173', checks = [], errors = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  const url = world => `${origin}/?world=${world}&motion-debug=1&render-audit=1`;
  const ready = (p, world) => p.waitForFunction(world => {
    const view = window.__riverMultiplayer?.();
    return view?.connected && view.snapshot?.worldId === world && document.querySelector('#canvas-host')?.dataset.playerReady === 'true';
  }, world);
  page.on('pageerror', error => errors.push(error.message));
  // The first development identity owns building rights. Customize a separate
  // ordinary resident so world travel cannot accidentally grant those rights.
  await page.goto(url('garden-2')); await ready(page, 'garden-2');
  check(await page.evaluate(() => { const v = window.__riverMultiplayer(); return v.snapshot.players.find(p => p.id === v.selfId).canBuild === true; }), 'Fixture owner starts with building permission');
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/v1/**', route => route.fulfill({ status: 503, json: { source: 'unavailable', reason: 'acceptance_fixture' } }));
  const resident = await context.newPage(); resident.setDefaultTimeout(60000);
  resident.on('pageerror', error => errors.push(error.message));
  const account = () => resident.evaluate(() => fetch('/api/character').then(r => r.json()));
  try {
    await resident.goto(url('garden-2')); await ready(resident, 'garden-2');
    const ownerId = await resident.evaluate(() => window.__riverMultiplayer().selfId);
    const open = async () => {
      if (!await resident.locator('.visit-tools').evaluate(n => n.open)) await resident.locator('.visit-tools-toggle').click();
      if (await resident.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await resident.locator('#panel-toggle').click();
      await resident.getByRole('button', { name: 'Open character studio', exact: true }).click();
      await resident.waitForFunction(() => document.querySelector('.character-studio').dataset.accountPhase === 'ready');
    };
    await open();
    const dialog = resident.getByRole('dialog', { name: 'Character studio' });
    await dialog.locator('button[data-character=sable]').click();
    await dialog.locator('[name=form]').selectOption('human');
    await dialog.getByRole('button', { name: 'Rose silk', exact: true }).click();
    await dialog.getByRole('button', { name: 'Espresso', exact: true }).click();
    await dialog.locator('[data-save]').click();
    await resident.waitForFunction(() => document.querySelector('.character-studio').dataset.accountPhase === 'ready');
    check((await account()).character.draft.palette === 'rose', 'Ordinary resident saves a customized draft');
    await dialog.locator('[data-wear]').click();
    await resident.waitForFunction(() => { const v = window.__riverMultiplayer(); return v.snapshot.players.find(p => p.id === v.selfId)?.character?.palette === 'rose'; });
    await dialog.locator('[data-close]').click();
    const canonical = (await account()).selection.character;
    check(canonical.ownerId === ownerId && canonical.revision > 0 && canonical.hair === 'espresso', 'Server publishes an owned customized revision');
    const assertCharacter = async label => {
      await resident.waitForFunction(expected => {
        const v = window.__riverMultiplayer(), self = v.snapshot.players.find(p => p.id === v.selfId);
        const outfit = v.selfMaterials?.filter(m => m.slot === 'outfit') ?? [];
        return JSON.stringify(self?.character) === JSON.stringify(expected) && outfit.length > 0 && outfit.every(m => m.color === 'b66e89');
      }, canonical);
      const self = await resident.evaluate(() => { const v = window.__riverMultiplayer(); return v.snapshot.players.find(p => p.id === v.selfId); });
      check(self.id === ownerId && self.canBuild === false, `${label}: identity and ordinary building permission are preserved`);
      check(JSON.stringify((await account()).selection.character) === JSON.stringify(canonical), `${label}: authoritative selected revision is unchanged`);
    };
    await assertCharacter('Initial wear');
    const materials = await resident.evaluate(() => window.__riverMultiplayer().selfMaterials);
    check(materials.some(m => m.slot === 'hair'), 'Rendered baseline includes customized hair');
    for (const world of ['river-oaks', 'garden-2']) {
      await resident.goto(url(world)); await ready(resident, world); await assertCharacter(world);
      if (world === 'river-oaks') {
        await page.waitForFunction(id => { const v = window.__riverMultiplayer(); return !v.snapshot.players.some(p => p.id === id) && !v.remotes.some(p => p.id === id); }, ownerId);
        check(true, 'Original world peer observes departure from snapshot and rendered residents');
      }
      check(JSON.stringify(await resident.evaluate(() => window.__riverMultiplayer().selfMaterials)) === JSON.stringify(materials), `${world}: actual outfit and hair survive world transition`);
    }
    await page.waitForFunction(({ ownerId, canonical, materials }) => {
      const remote = window.__riverMultiplayer().remotes.find(p => p.id === ownerId);
      return remote?.ready && !remote.fallback && JSON.stringify(remote.character) === JSON.stringify(canonical) && JSON.stringify(remote.materials) === JSON.stringify(materials);
    }, { ownerId, canonical, materials });
    check(true, 'Returning resident is visible to the original world peer with the canonical revision');
    let denied = 0;
    const ticket = '**/api/multiplayer/ticket?**';
    await resident.route(ticket, route => { denied++; return route.abort('internetdisconnected'); });
    await resident.goto(url('river-oaks'));
    await resident.locator('.multiplayer-gate').waitFor({ state: 'visible' });
    await resident.getByRole('button', { name: 'Try again', exact: true }).waitFor({ state: 'visible' });
    check(denied > 0 && await resident.locator('.app-shell').evaluate(n => n.inert), 'Failed world admission leaves the application gated');
    check(!await resident.evaluate(() => window.__riverMultiplayer?.().connected), 'Failed admission does not create a private playable world');
    await resident.waitForFunction(() => typeof window.__riverCarriage === 'function');
    const blockedPose = await resident.evaluate(() => window.__riverCarriage()?.pose?.position);
    check(Array.isArray(blockedPose) && blockedPose.length === 3 && blockedPose.every(Number.isFinite), 'Blocked movement compares an initialized controller position');
    await resident.keyboard.down('KeyW');
    try { await resident.evaluate(() => new Promise(resolve => { let frames = 0; const tick = () => ++frames >= 30 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); })); }
    finally { await resident.keyboard.up('KeyW'); }
    check(await resident.evaluate(before => JSON.stringify(window.__riverCarriage()?.pose?.position) === JSON.stringify(before) && !window.__riverMultiplayer().connected, blockedPose), 'Held movement cannot change the controller position while admission is unavailable');
    check(JSON.stringify((await account()).selection.character) === JSON.stringify(canonical), 'Failed admission cannot overwrite the saved look');
    await resident.unroute(ticket);
    await resident.evaluate(() => [...document.querySelectorAll('.multiplayer-gate button')].find(b => b.textContent === 'Try again' && !b.hidden)?.click());
    await ready(resident, 'river-oaks'); await assertCharacter('Admission recovery');
    check(!await resident.locator('.app-shell').evaluate(n => n.inert), 'Successful admission unlocks the town');
    check(JSON.stringify(await resident.evaluate(() => window.__riverMultiplayer().selfMaterials)) === JSON.stringify(materials), 'Recovery restores the actual customized outfit and hair');
    const beforeMove = await resident.locator('#walking-hud').getAttribute('data-position');
    check(beforeMove !== null && beforeMove.length > 0 && await resident.evaluate(() => window.__riverCarriage()?.pose?.position.every(Number.isFinite)), 'Recovered player has an initialized movement position');
    await resident.locator('#canvas-host').focus(); await resident.keyboard.down('KeyW');
    try { await resident.waitForFunction(before => document.querySelector('#walking-hud').dataset.position !== before, beforeMove); }
    finally { await resident.keyboard.up('KeyW'); }
    check(true, 'Movement resumes after recovered admission');
    await open();
    check(await dialog.getAttribute('data-palette') === 'rose', 'Reopened Studio retains the saved look after travel and retry');
    await dialog.locator('.cs-preview[data-ready=true]').waitFor();
    await resident.screenshot({ path: 'output/playwright/character-studio-world-recovery.png' });
    check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);
    return { passed: true, checks, errors };
  } finally { await context.close(); }
}
