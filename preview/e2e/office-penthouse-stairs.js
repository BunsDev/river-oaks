async page => {
  // Walking the penthouse stair: the owner walks to the stair foot, climbs the stair with W onto
  // the mezzanine, where the server derives the height and the floor, then walks back down.
  // The Q stair control is the other journey's (office-penthouse.js). Software rendering.
  const checks = [], errors = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
  // Setup, not an office assertion: the district data has a 20 s fetch deadline, which a loaded
  // machine can miss. The page's own Reload world data is used once, and the receipt records it.
  const reloads = [];
  for (let attempt = 0; ; attempt++) {
    const state = await page.waitForFunction(() => {
      if (document.querySelector('#loading')?.classList.contains('error')) return 'error';
      return document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && document.querySelectorAll('#destination option').length > 1 && 'ready';
    }, null, { timeout: 300000 }).then(handle => handle.jsonValue());
    if (state === 'ready') break;
    const detail = (await page.locator('#loading').textContent()).trim().slice(0, 160);
    if (attempt > 0) throw new Error(`the district failed to load twice: ${detail}`);
    reloads.push(detail);
    await page.locator('#reload').evaluate(button => button.click());
  }
  // Setup waits are generous: they are not product timings, and a loaded machine needs minutes.
  await page.locator('#office-lobby').waitFor({ state: 'attached', timeout: 180000 });
  await page.locator('#office-lobby').evaluate(button => button.click());
  await page.waitForFunction(() => document.querySelector('#office-enter')?.disabled === false, null, { timeout: 180000 });
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyF');
  // If entry stalls, say what the office panel and the server reported rather than only timing out.
  await page.waitForFunction(() => document.querySelector('#office-visit')?.open && document.querySelector('#office-visit').dataset.phase === 'office', null, { timeout: 180000 })
    .catch(async error => { throw new Error(`${error.message}: ${JSON.stringify(await page.evaluate(() => ({ status: document.querySelector('.office-panel [role=status]')?.textContent, dialog: document.querySelector('#office-visit')?.open, phase: document.querySelector('#office-visit')?.dataset.phase, label: document.querySelector('#office-visit [role=status]')?.textContent, visit: (() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office ?? null; })() })))}`); });
  const visit = () => page.evaluate(() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office ?? null; });
  const start = await visit();
  check(start?.layout === 'office-penthouse-1' && start.levelId === 'jevica-office/l0', `the server admitted the penthouse main floor: ${JSON.stringify(start)}`);
  const eye0 = (await page.evaluate(() => window.__riverOffice())).camera.position[1];
  await page.screenshot({ path: 'output/playwright/office-penthouse-stairs-arrival.png' });

  // Steer by pointer drag (yaw changes 0.004 rad per pixel) toward a target, then walk.
  const dialog = page.locator('#office-visit'), box = await dialog.boundingBox();
  const position = () => dialog.evaluate(d => JSON.parse(d.dataset.position));
  const drag = async px => { const x = box.x + box.width / 2, y = box.y + box.height / 2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + px, y, { steps: 4 }); await page.mouse.up(); };
  let heading = 0, at = await position();
  const walkTo = async (target, label) => {
    for (let step = 0; step < 40; step++) {
      const want = Math.atan2(target[0] - at[0], target[1] - at[1]);
      if (Math.abs(want - heading) > 0.03) { await drag((want - heading) / 0.004); heading = want; }
      if (Math.hypot(target[0] - at[0], target[1] - at[1]) < 0.9) break;
      await dialog.focus(); await page.keyboard.down('KeyW');
      await page.waitForTimeout(Math.min(400, Math.max(80, Math.hypot(target[0] - at[0], target[1] - at[1]) * 300)));
      await page.keyboard.up('KeyW'); await page.waitForTimeout(150);
      const next = await position();
      if (Math.hypot(next[0] - at[0], next[1] - at[1]) > 0.05) heading = Math.atan2(next[0] - at[0], next[1] - at[1]);
      at = next;
    }
    check(Math.hypot(target[0] - at[0], target[1] - at[1]) < 1.2, `walked to ${label}: ${JSON.stringify(at)}`);
  };

  await walkTo([11.8, 4.5], 'the stair foot');
  // Up the flight, steering at its middle; part way up the visitor stands part way up.
  await walkTo([11.8, 9.8], 'half way up the stair');
  const mid = await visit(), eyeMid = (await page.evaluate(() => window.__riverOffice())).camera.position[1];
  check(mid.levelId === 'jevica-office/l0' && mid.elevation > 1 && mid.elevation < 3, `half way up, the server puts the visitor part way up: ${JSON.stringify(mid)}`);
  check(Math.abs(eyeMid - eye0 - mid.elevation) < 0.2, `the eye follows the stair (${(eyeMid - eye0).toFixed(2)} m for ${mid.elevation.toFixed(2)} m)`);
  await page.screenshot({ path: 'output/playwright/office-penthouse-stairs-mid.png' });
  await walkTo([11.8, 15.8], 'the mezzanine at the stair head');
  await page.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office?.levelId === 'jevica-office/l1'; }, null, { timeout: 30000 });
  const top = await visit(), eyeTop = (await page.evaluate(() => window.__riverOffice())).camera.position[1];
  check(top.elevation === 3.8 && top.position[1] > 14.8, `the stair head is the mezzanine: ${JSON.stringify(top)}`);
  check(Math.abs(eyeTop - eye0 - 3.8) < 0.05, `the first-person eye rose by the floor height (${(eyeTop - eye0).toFixed(3)} m)`);
  await page.screenshot({ path: 'output/playwright/office-penthouse-stairs-top.png' });
  // And back down to the main floor.
  await walkTo([11.8, 4.2], 'back down at the stair foot');
  await page.waitForFunction(() => { const m = window.__riverMultiplayer(); const o = m.snapshot.players.find(p => p.id === m.selfId)?.office; return o?.levelId === 'jevica-office/l0' && o.elevation === 0; }, null, { timeout: 30000 });
  check(true, 'walked back down onto the main floor');
  await page.locator('#office-exit').click();
  await page.waitForFunction(() => !document.querySelector('#office-visit').open);
  check(!errors.length, `no page errors: ${errors.join('; ')}`);
  return { checks, errors, reloads, mid, top, eyeRise: eyeTop - eye0, rendering: 'Software fixture; graybox from the plan, not final art' };
}
