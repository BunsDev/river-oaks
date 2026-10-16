async page => {
  // #418 acceptance journey for one stock template, the #417 Garden Office journey made to take
  // a template: open → valid edit → blocked-route refusal → undo/redo → save → reload/reopen →
  // stale-tab conflict → walk to every required destination along its assessed route and back
  // to the arrival → editor. STUDIO_TEMPLATE picks the template (default house).
  const { pathToFileURL } = await import('node:url');
  const source = file => import(pathToFileURL(`${process.cwd()}/preview/src/studio/${file}`).href);
  const { assessSpace, spaceMovementSegment } = await source('space-assessment.js');
  const { buildSpaceWorld } = await source('space-document.js');
  const { spaceTemplates, spaceRouteProfile, spaceAssessmentContext } = await source('space-templates.js');
  const { createWalkingEnvironment } = await import(pathToFileURL(`${process.cwd()}/preview/src/walking.js`).href);
  // Per template: a valid finish edit, a move that blocks one required route (and the room its
  // finding must name), and two objects for the stale-tab check.
  const SETTINGS = {
    office: { edit: ['work-desk-2', 'walnut', 'oak'], block: ['waiting-sofa', [['Width (m)', .8], ['Depth (m)', 1.8], ['North (m)', .9], ['East (m)', 2]], 'meeting room'], tabs: ['work-desk-3', 'work-desk-4'] },
    house: { edit: ['dining-table', 'walnut', 'oak'], block: ['coffee-table', [['East (m)', 3.5]], 'bathroom'], tabs: ['kitchen-cabinets', 'kitchen-cabinets-east'] },
  };
  const templateId = process.env.STUDIO_TEMPLATE ?? 'house', settings = SETTINGS[templateId];
  if (!settings) throw Error(`No journey settings for ${templateId}`);
  const template = spaceTemplates.find(t => t.id === templateId), destinations = spaceRouteProfile(spaceAssessmentContext(templateId)).targets.length;
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
  const setFinish = async (tab, id, finish) => {
    await tab.locator(`[data-item="${id}"]`).click();
    const select = tab.getByRole('combobox', { name: 'Finish', exact: true });
    if (await select.inputValue() === finish) throw Error(`${id} is already ${finish}; the journey needs a real edit`);
    await select.selectOption(finish);await settle(tab);
  };
  const saved = tab => tab.evaluate(() => localStorage.getItem('river-oaks-world-studio-v1'));
  const passing = () => page.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();

  await page.locator('#studio-templates').click();
  await page.getByRole('button', { name: `Use ${template.name}`, exact: true }).click();
  await passing();
  check(true, `${template.name} opens with its required routes passing`);

  const [editId, editFinish, originalFinish] = settings.edit;
  await setFinish(page, editId, editFinish);await passing();
  check(true, `valid edit (${editId} finish) is accepted with routes passing`);

  // Accepted steps first; the last move blocks a required route and must be refused.
  const [blockId, moves, room] = settings.block, [lastName, lastValue] = moves.at(-1);
  await page.locator(`[data-item="${blockId}"]`).click();
  for (const [name, value] of moves.slice(0, -1)) await property(page, name, value);
  const before = await page.getByLabel(lastName, { exact: true }).inputValue();
  await property(page, lastName, lastValue);
  await page.locator('#studio-findings').filter({ hasText: 'Edit rejected.' }).waitFor();
  check((await page.locator('#studio-findings').textContent()).includes(room), `blocking the ${room} is refused with a finding`);
  check(await page.getByLabel(lastName, { exact: true }).inputValue() === before, `the refused move leaves ${blockId} where it was`);
  for (let step = 0; step < moves.length - 1; step++) await page.locator('#studio-undo').click();
  await settle(page);
  await page.locator('#studio-undo').click();await settle(page);
  await page.locator(`[data-item="${editId}"]`).click();
  check(await page.getByRole('combobox', { name: 'Finish', exact: true }).inputValue() === originalFinish, 'undo restores the original finish');
  await page.locator('#studio-redo').click();await settle(page);
  await page.locator(`[data-item="${editId}"]`).click();
  check(await page.getByRole('combobox', { name: 'Finish', exact: true }).inputValue() === editFinish, 'redo reapplies the edit');

  await page.locator('#studio-save').click();
  const record = await saved(page);
  check(JSON.parse(record).assessmentContext?.templateId === templateId, `save keeps the ${templateId} assessment context`);
  await page.reload();await page.waitForSelector('body[data-studio-ready="true"]');
  await page.getByRole('status').filter({ hasText: 'Saved draft reopened' }).waitFor();
  await passing();
  check(true, 'reload reopens the saved draft and reassesses it');

  const other = await page.context().newPage();
  other.on('dialog', dialog => dialog.accept());
  await other.goto(`${origin}/studio.html`);await other.waitForSelector('body[data-studio-ready="true"]');
  await setFinish(other, settings.tabs[0], 'walnut');
  await other.locator('#studio-save').click();
  const otherRecord = await saved(other);
  await page.getByRole('status').filter({ hasText: 'changed in another tab' }).waitFor();
  await setFinish(page, settings.tabs[1], 'walnut');
  await page.locator('#studio-save').click();
  check((await status(page)).includes('A draft changed in another tab'), 'a stale tab cannot overwrite the newer saved draft');
  check(await saved(page) === otherRecord, "the other tab's save is kept");
  await other.close();
  await page.locator('#studio-undo').click();await settle(page);

  // Walk every required destination along its assessed route and back to the arrival.
  const space = JSON.parse(await saved(page)).region;
  const result = assessSpace(space, spaceAssessmentContext(templateId));
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
  check(tour.length === destinations, `walked to all ${destinations} required destinations and back to the arrival`);
  await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
  await page.waitForSelector('body[data-mode="edit"]');
  check(true, 'returned to the editor after the walk');
  if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
  return { passed: true, templateId, checks, tour };
}
