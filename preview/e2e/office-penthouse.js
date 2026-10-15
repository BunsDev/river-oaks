async page => {
  // Penthouse smoke (#361): the fixture serves Jevica's office on layout office-penthouse-1.
  // The owner arrives, sees the graybox drawn from the plan, walks to the stair foot,
  // takes the stairs with the level control and stands on the mezzanine at +3.8 m.
  // Software rendering; not visual or device acceptance.
  const checks = [], errors = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 90000 });
  await page.locator('#office-lobby').waitFor({ state: 'attached', timeout: 15000 });
  await page.locator('#office-lobby').evaluate(button => button.click());
  await page.waitForFunction(() => document.querySelector('#office-enter')?.disabled === false);
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyF');
  await page.waitForFunction(() => document.querySelector('#office-visit')?.open && document.querySelector('#office-visit').dataset.phase === 'office', null, { timeout: 60000 });
  const visit = () => page.evaluate(() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office ?? null; });
  const start = await visit();
  check(start?.layout === 'office-penthouse-1' && start.levelId === 'jevica-office/l0', `the server admitted the penthouse main floor: ${JSON.stringify(start)}`);
  const eye0 = (await page.evaluate(() => window.__riverOffice())).camera.position[1];
  await page.screenshot({ path: 'output/playwright/office-penthouse-arrival.png' });

  // Steer by pointer drag (yaw changes 0.004 rad per pixel) toward the stair foot, then walk.
  const target = [11.8, 4.5], dialog = page.locator('#office-visit'), box = await dialog.boundingBox();
  const position = () => dialog.evaluate(d => JSON.parse(d.dataset.position));
  const drag = async px => { const x = box.x + box.width / 2, y = box.y + box.height / 2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + px, y, { steps: 4 }); await page.mouse.up(); };
  let heading = 0, at = await position();
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
  check(Math.hypot(target[0] - at[0], target[1] - at[1]) < 1.2, `walked to the stair foot: ${JSON.stringify(at)}`);
  await page.waitForFunction(() => !document.querySelector('#office-level')?.hidden);
  check(/stairs up/.test(await page.locator('#office-level').textContent()), 'the level control offers the stairs up only at the stair foot');
  await page.locator('#office-level').click();
  await page.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office?.levelId === 'jevica-office/l1'; });
  await page.waitForTimeout(400);
  const upstairs = await visit(), eye1 = (await page.evaluate(() => window.__riverOffice())).camera.position[1];
  check(upstairs.elevation === 3.8 && Math.abs(upstairs.position[0] - 11.8) < 1e-9 && Math.abs(upstairs.position[1] - 15.2) < 1e-9, 'the server landed the visitor at the stair head on the mezzanine');
  check(Math.abs(eye1 - eye0 - 3.8) < 0.05, `the first-person eye rose by the floor height (${(eye1 - eye0).toFixed(3)} m)`);
  await page.screenshot({ path: 'output/playwright/office-penthouse-mezzanine.png' });
  await page.locator('#office-exit').click();
  await page.waitForFunction(() => !document.querySelector('#office-visit').open);
  check(!errors.length, `no page errors: ${errors.join('; ')}`);
  return { checks, errors, start, upstairs, eyeRise: eye1 - eye0, rendering: 'Software fixture; graybox from the plan, not final art' };
}
