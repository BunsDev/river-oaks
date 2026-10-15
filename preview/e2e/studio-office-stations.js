async page => {
  // Matched player-height captures of the Garden Office template (#416 baseline and
  // after-views). Each station stands on a required route target from the office
  // profile and looks at that target's role object; entry and exit use the arrival.
  // Positions are (east, north) metres; yaw follows walking.js (0 faces north).
  const origin = 'http://127.0.0.1:5173', errors = [], captures = [];
  page.on('pageerror', error => errors.push(error.message));
  const stations = [
    { id: 'CAM-01-entry', at: [0, -8.5], look: [0, 0] },
    { id: 'CAM-02-reception', at: [0, -4], look: [-4, -4.5] },
    { id: 'CAM-03-workstation', at: [-2, 1], look: [-5.7, -.4] },
    { id: 'CAM-04-meeting', at: [3, 1], look: [5, 2.6] },
    { id: 'CAM-05-kitchenette', at: [-1, 5], look: [-5.2, 5.45] },
    { id: 'CAM-06-exit', at: [0, -4], look: [0, -8.5] },
  ];
  const lightings = ['daylight', 'warm', 'evening'];
  const yawFor = ([e, n], [le, ln]) => Math.atan2(-(le - e), ln - n);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/studio.html`);
  await page.waitForSelector('body[data-studio-ready="true"]');
  await page.locator('#studio-templates').click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Use Garden Office', exact: true }).click();
  await page.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();
  // The prompt bar overlays the stage; hide it for captures of the 3D view only.
  await page.addStyleTag({ content: '.studio-stage .studio-agent { visibility: hidden !important; }' });
  const settle = () => page.waitForFunction(() => document.body.dataset.studioBusy !== 'true');
  const property = async (name, value) => {
    const input = page.getByLabel(name, { exact: true }); await input.fill(String(value)); await input.press('Tab'); await settle();
  };
  for (const lighting of lightings) {
    await page.locator('[data-item="@environment"]').click();
    await page.getByRole('combobox', { name: 'Lighting', exact: true }).selectOption(lighting); await settle();
    for (const station of stations) {
      await page.locator('[data-item="@arrival"]').click();
      await property('East (m)', station.at[0]); await property('North (m)', station.at[1]);
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
      const path = `output/playwright/garden-office-${lighting}-${station.id}.png`;
      await page.locator('#studio-viewport').screenshot({ path });
      captures.push({ lighting, station: station.id, at: station.at, look: station.look, yaw: +yaw.toFixed(4), path });
      await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
      await page.waitForSelector('body[data-mode="edit"]');
    }
  }
  if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
  return { passed: true, eyeHeightM: 1.68, viewport: [1440, 1000], captures };
}
