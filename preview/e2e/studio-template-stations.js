async page => {
  // Matched player-height captures of one stock template (#418), in the same form as the
  // Garden Office stations (#416): entry, one station per required route target looking
  // at that target's role object, and the exit. Stations come from the template's own
  // route profile, so they follow the recipe. STUDIO_TEMPLATE picks house, boutique, cafe
  // or office (default house); STUDIO_CAPTURE_TAG names the set, e.g. before or after.
  const origin = 'http://127.0.0.1:5173', errors = [], captures = [];
  const templateId = process.env.STUDIO_TEMPLATE ?? 'house', tag = process.env.STUDIO_CAPTURE_TAG ?? 'current';
  page.on('pageerror', error => errors.push(error.message));
  const lightings = ['daylight', 'warm', 'evening'];
  // Positions are (east, north) metres; yaw follows walking.js (0 faces north).
  const yawFor = ([e, n], [le, ln]) => Math.atan2(-(le - e), ln - n);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/studio.html`);
  await page.waitForSelector('body[data-studio-ready="true"]');
  const plan = await page.evaluate(async id => {
    const { spaceTemplates, spaceAssessmentContext, spaceRouteProfile, createSpace } = await import('/src/studio/space-templates.js');
    const template = spaceTemplates.find(t => t.id === id), stock = createSpace(id), profile = spaceRouteProfile(spaceAssessmentContext(id));
    const at = id => stock.objects.find(o => o.id === id);
    return { name: template.name, exit: profile.exit,
      targets: profile.targets.map(t => ({ label: t.label, at: t.position, look: [at(t.objectId).east, at(t.objectId).north], objectId: t.objectId })) };
  }, templateId);
  const slug = label => label.replace(/\s+/g, '-');
  const first = plan.targets[0];
  const stations = [
    { id: 'CAM-01-entry', at: plan.exit, look: first.at },
    ...plan.targets.map((t, i) => ({ id: `CAM-${String(i + 2).padStart(2, '0')}-${slug(t.label)}`, at: t.at, look: t.look, objectId: t.objectId })),
    { id: `CAM-${String(plan.targets.length + 2).padStart(2, '0')}-exit`, at: first.at, look: plan.exit },
  ];
  await page.locator('#studio-templates').click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `Use ${plan.name}`, exact: true }).click();
  await page.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();
  // The prompt bar overlays the stage; hide it for captures of the 3D view only.
  await page.addStyleTag({ content: '.studio-stage .studio-agent { visibility: hidden !important; }' });
  const settle = () => page.waitForFunction(() => document.body.dataset.studioBusy !== 'true');
  const property = async (name, value) => {
    const input = page.getByLabel(name, { exact: true }); await input.fill(String(value)); await input.press('Tab'); await settle();
  };
  // Studio refuses an arrival inside furniture, and the corner between two stations can
  // be inside it (east first may land on the bed), so retry the other way round.
  const placeArrival = async ([east, north]) => {
    for (const order of [['East (m)', 'North (m)'], ['North (m)', 'East (m)']]) {
      await page.locator('[data-item="@arrival"]').click();
      for (const name of order) await property(name, name.startsWith('East') ? east : north);
      const placed = await Promise.all(['East (m)', 'North (m)'].map(name => page.getByLabel(name, { exact: true }).inputValue()));
      if (+placed[0] === east && +placed[1] === north) return;
    }
    throw Error(`Arrival could not be placed at ${east} E / ${north} N`);
  };
  for (const lighting of lightings) {
    await page.locator('[data-item="@environment"]').click();
    await page.getByRole('combobox', { name: 'Lighting', exact: true }).selectOption(lighting); await settle();
    for (const station of stations) {
      await placeArrival(station.at);
      await page.getByRole('button', { name: 'Walk through', exact: true }).click();
      await page.waitForSelector('body[data-mode="walk"]');
      const readout = `${station.at[0].toFixed(1)} E / ${station.at[1].toFixed(1)} N`;
      await page.waitForFunction(text => document.querySelector('#studio-position').textContent.includes(text), readout);
      // walking.js turns 0.004 rad per dragged pixel; drag left to turn left (positive yaw).
      const yaw = yawFor(station.at, station.look), box = await page.locator('#studio-viewport canvas').boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2, dx = Math.round(-yaw / .004);
      await page.mouse.move(x, y); await page.mouse.down();
      for (let step = 1; step <= 8; step++) await page.mouse.move(x + dx * step / 8, y);
      await page.mouse.up(); await page.waitForTimeout(400);
      const path = `output/playwright/studio-${templateId}-${tag}-${lighting}-${station.id}.png`;
      await page.locator('#studio-viewport').screenshot({ path });
      captures.push({ lighting, station: station.id, at: station.at, look: station.look, objectId: station.objectId, yaw: +yaw.toFixed(4), path });
      await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
      await page.waitForSelector('body[data-mode="edit"]');
    }
  }
  if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
  return { passed: true, templateId, tag, eyeHeightM: 1.68, viewport: [1440, 1000], captures };
}
