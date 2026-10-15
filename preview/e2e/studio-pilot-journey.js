async page => {
  // #417 Garden Office acceptance journey: open → valid edit → blocked-route refusal →
  // undo/redo → save → reload/reopen → stale-tab conflict → walk to every required
  // destination along its assessed route and back to the arrival → editor.
  const { pathToFileURL } = await import('node:url');
  const source = file => import(pathToFileURL(`${process.cwd()}/preview/src/studio/${file}`).href);
  const { assessSpace, spaceMovementSegment } = await source('space-assessment.js');
  const { buildSpaceWorld } = await source('space-document.js');
  const { createWalkingEnvironment } = await import(pathToFileURL(`${process.cwd()}/preview/src/walking.js`).href);
  const origin = 'http://127.0.0.1:5173', errors = [], checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/studio.html`);
  await page.waitForSelector('body[data-studio-ready="true"]');
  const settle = tab => tab.waitForFunction(() => document.body.dataset.studioBusy !== 'true');
  const status = tab => tab.locator('#studio-status').textContent();
  const property = async (tab, name, value) => {
    const input = tab.getByLabel(name, { exact: true });await input.fill(String(value));await input.press('Tab');await settle(tab);
  };
  const saved = tab => tab.evaluate(() => localStorage.getItem('river-oaks-world-studio-v1'));

  await page.locator('#studio-templates').click();
  await page.getByRole('button', { name: 'Use Garden Office', exact: true }).click();
  await page.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();
  check(true, 'Garden Office opens with its required routes passing');

  await page.locator('[data-item="work-desk-2"]').click();
  await page.getByRole('combobox', { name: 'Finish', exact: true }).selectOption('walnut');await settle(page);
  await page.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();
  check(true, 'valid edit (desk finish) is accepted with routes passing');

  // Three accepted moves put the sofa in the meeting room; moving it east into the
  // doorway (the #414 case) blocks the meeting route and must be refused.
  await page.locator('[data-item="waiting-sofa"]').click();
  await property(page, 'Width (m)', .8);await property(page, 'Depth (m)', 1.8);await property(page, 'North (m)', .9);
  await property(page, 'East (m)', 2);
  await page.locator('#studio-findings').filter({ hasText: 'Edit rejected.' }).waitFor();
  check((await page.locator('#studio-findings').textContent()).includes('meeting room'), 'blocking the meeting room is refused with a finding');
  check(await page.getByLabel('East (m)', { exact: true }).inputValue() === '5', 'the refused move leaves the sofa where it was');
  for (let step = 0; step < 3; step++) await page.locator('#studio-undo').click();
  check(await page.getByLabel('Width (m)', { exact: true }).inputValue() === '2.6', 'undo restores the sofa');
  await page.locator('#studio-redo').click();
  check(await page.getByLabel('Width (m)', { exact: true }).inputValue() === '0.8', 'redo reapplies one edit');
  await page.locator('#studio-undo').click();

  await page.locator('#studio-save').click();
  const record = await saved(page);
  check(JSON.parse(record).assessmentContext?.templateId === 'office', 'save keeps the office assessment context');
  await page.reload();await page.waitForSelector('body[data-studio-ready="true"]');
  await page.getByRole('status').filter({ hasText: 'Saved draft reopened' }).waitFor();
  await page.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();
  check(true, 'reload reopens the saved draft and reassesses it');

  const other = await page.context().newPage();
  other.on('dialog', dialog => dialog.accept());
  await other.goto(`${origin}/studio.html`);await other.waitForSelector('body[data-studio-ready="true"]');
  await other.locator('[data-item="work-desk-3"]').click();
  await other.getByRole('combobox', { name: 'Finish', exact: true }).selectOption('walnut');await settle(other);
  await other.locator('#studio-save').click();
  const otherRecord = await saved(other);
  await page.getByRole('status').filter({ hasText: 'changed in another tab' }).waitFor();
  await page.locator('[data-item="work-desk-4"]').click();
  await page.getByRole('combobox', { name: 'Finish', exact: true }).selectOption('walnut');await settle(page);
  await page.locator('#studio-save').click();
  check((await status(page)).includes('A draft changed in another tab'), 'a stale tab cannot overwrite the newer saved draft');
  check(await saved(page) === otherRecord, "the other tab's save is kept");
  await other.close();
  await page.locator('#studio-undo').click();await settle(page);

  // Walk every required destination along its assessed route and back to the arrival.
  const space = JSON.parse(await saved(page)).region;
  const result = assessSpace(space, { templateId: 'office', profileVersion: 1 });
  check(result.status === 'passed', 'the saved layout assesses as passing');
  const environment = createWalkingEnvironment(buildSpaceWorld(space));
  const clear = (a, b) => spaceMovementSegment(environment, a, b) && spaceMovementSegment(environment, b, a);
  // Keep the longest straight stretches that the movement model still accepts.
  const straighten = points => {
    const kept = [points[0]];
    for (let from = 0; from < points.length - 1;) {
      let to = points.length - 1;while (to > from + 1 && !clear(points[from], points[to])) to--;
      kept.push(points[to]);from = to;
    }
    return kept;
  };
  // The readout shows a placeholder until walk mode draws its first frame.
  const position = async () => {
    await page.waitForFunction(() => /-?[\d.]+ E \/ -?[\d.]+ N/.test(document.querySelector('#studio-position').textContent));
    const [, east, north] = (await page.locator('#studio-position').textContent()).match(/(-?[\d.]+) E \/ (-?[\d.]+) N/);
    return [Number(east), Number(north)];
  };
  const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
  let yaw = 0;
  const box = await page.locator('#studio-viewport canvas').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const turn = async heading => {
    const pixels = Math.round(-wrap(heading - yaw) / .004);
    if (Math.abs(pixels) < 3) return;
    await page.mouse.move(cx, cy);await page.mouse.down();await page.mouse.move(cx + pixels, cy, { steps: 8 });await page.mouse.up();
    yaw = wrap(yaw - pixels * .004);
  };
  const walkTo = async point => {
    for (let step = 0; step < 80; step++) {
      const [east, north] = await position(), dx = point[0] - east, dn = point[1] - north, distance = Math.hypot(dx, dn);
      if (distance < .3) return;
      await turn(Math.atan2(-dx, dn));
      await page.locator('#studio-viewport').focus();
      await page.keyboard.down('w');await page.waitForTimeout(Math.max(80, Math.min(distance / 1.65, .5) * 1000));await page.keyboard.up('w');
    }
    throw Error(`Walker stuck near ${(await position()).join(', ')} going to ${point.join(', ')}`);
  };
  await page.getByRole('button', { name: 'Walk through', exact: true }).click();
  await page.waitForSelector('body[data-mode="walk"]');
  const tour = [];
  for (const route of result.routes.filter(route => route.targetId !== 'exit')) {
    const started = Date.now(), out = straighten(route.points), back = straighten([...route.points].reverse());
    for (const point of out.slice(1)) await walkTo(point);
    const reached = await position();
    for (const point of back.slice(1)) await walkTo(point);
    const home = await position();
    tour.push({ target: route.targetId, waypoints: out.length + back.length - 2, reached, home, seconds: (Date.now() - started) / 1000 });
  }
  check(tour.length === 4, 'walked to all four required destinations and back to the arrival');
  await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
  await page.waitForSelector('body[data-mode="edit"]');
  check(true, 'returned to the editor after the walk');
  if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
  return { passed: true, checks, tour };
}
