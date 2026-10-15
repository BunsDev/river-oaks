async page => {
  // Penthouse smoke (#361, #363): the fixture serves Jevica's office on layout office-penthouse-1.
  // The owner arrives, sees the graybox drawn from the plan, sits at creative desk 01's chair
  // and stands again (#363 seat claims), walks to the stair foot, takes the stairs with the
  // level control and stands on the mezzanine at +3.8 m.
  // Software rendering; not visual or device acceptance.
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
  await page.screenshot({ path: 'output/playwright/office-penthouse-arrival.png' });

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

  // #363: sit at creative desk 01 from its approach, then stand again.
  const chair = { id: 'desk-a1-chair', position: [3.65, 5.6], stand: [3.65, 3.55] };
  await walkTo(chair.stand, 'creative desk 01');
  await page.waitForFunction(() => !document.querySelector('#office-seat')?.hidden);
  check(/Sit down · Z/.test(await page.locator('#office-seat').textContent()), 'the seat control offers the chair at its stand point');
  await page.waitForTimeout(300);
  const standingEye = (await page.evaluate(() => window.__riverOffice())).camera.position[1];
  await dialog.focus(); await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office?.seat?.id === id; }, chair.id);
  await page.waitForTimeout(400);
  const seated = await visit(), seatedEye = (await page.evaluate(() => window.__riverOffice())).camera.position[1];
  check(seated.position[0] === chair.position[0] && seated.position[1] === chair.position[1] && seated.yaw === 0, `the server seated the visitor at the plan's chair, facing the desk: ${JSON.stringify(seated)}`);
  check(Math.abs(standingEye - seatedEye - 0.48) < 0.05, `the seated eye is lower (${(standingEye - seatedEye).toFixed(3)} m)`);
  check(!(await page.locator('#office-desk-nearby').isHidden()) && /Stand up · Z/.test(await page.locator('#office-seat').textContent()), 'seated at a desk chair offers the desk and Stand up');
  // The seat and desk prompts sit clear of the header and each other, and take real clicks.
  const clear = async () => page.evaluate(() => {
    const rect = el => el.getBoundingClientRect(), header = rect(document.querySelector('#office-visit header'));
    const prompts = ['#office-seat', '#office-desk-nearby'].map(id => { const el = document.querySelector(id), r = rect(el), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { id, r, topmost: top === el || el.contains(top) }; });
    const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
    return { prompts: prompts.map(({ id, topmost, r }) => ({ id, topmost, rect: [r.left, r.top, r.width, r.height].map(Math.round) })),
      ok: prompts.every(p => p.topmost && apart(p.r, header) && p.r.right <= innerWidth && p.r.bottom <= innerHeight) && apart(prompts[0].r, prompts[1].r) };
  });
  const desktopPrompts = await clear();
  check(desktopPrompts.ok, `seated prompts are on screen, topmost and clear of the header: ${JSON.stringify(desktopPrompts.prompts)}`);
  await page.screenshot({ path: 'output/playwright/office-penthouse-seated.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  const phonePrompts = await clear();
  check(phonePrompts.ok, `at 390 px the seated prompts stay on screen, topmost and clear of the header: ${JSON.stringify(phonePrompts.prompts)}`);
  await page.screenshot({ path: 'output/playwright/office-penthouse-seated-390.png' });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(300);
  await dialog.focus(); await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW'); await page.waitForTimeout(300);
  const still = await visit();
  check(still.seat?.id === chair.id && still.position[1] === chair.position[1], 'walking keys do not move a seated visitor');
  await dialog.focus(); await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => { const m = window.__riverMultiplayer(); const o = m.snapshot.players.find(p => p.id === m.selfId)?.office; return o && !o.seat; });
  const stood = await visit();
  check(stood.position[0] === chair.stand[0] && stood.position[1] === chair.stand[1], `standing returned to the chair's approach: ${JSON.stringify(stood.position)}`);
  await page.waitForTimeout(300); at = await position();

  // South of the desk row first, so no leg passes close to a chair while steering by drag.
  await walkTo([3.65, 2.4], 'the aisle in front of the desks');
  await walkTo([9.6, 2.4], 'the aisle east of the desks');
  const target = [11.8, 4.5];
  await walkTo(target, 'the stair foot');
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
  return { checks, errors, reloads, start, seated, stood, seatedEyeDrop: standingEye - seatedEye, upstairs, eyeRise: eye1 - eye0, rendering: 'Software fixture; graybox from the plan, not final art' };
}
