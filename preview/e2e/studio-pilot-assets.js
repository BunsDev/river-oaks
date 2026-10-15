async page => {
  // #417 late and missing assets. A furnished space's only asynchronous assets are the
  // shared stone and paver textures. Each case uses a fresh page (routing disables the
  // HTTP cache), stands at the reception station (CAM-02) and measures the limestone
  // counter top: textures normal, blocked, delayed (during and after loading), and the
  // scene replaced while they load, then reopened.
  const origin = 'http://127.0.0.1:5173', errors = [], results = {}, delay = 8000;
  const context = page.context();
  const launch = async mode => {
    const tab = await context.newPage();
    tab.on('pageerror', error => errors.push(`${mode}: ${error.message}`));tab.on('dialog', dialog => dialog.accept());
    await tab.setViewportSize({ width: 1440, height: 1000 });
    await tab.route('**/assets/materials/stone-*.jpg', async route => {
      if (mode === 'missing') return route.abort();
      if (mode === 'delayed' || mode === 'replaced') await new Promise(resolve => setTimeout(resolve, delay));
      return route.continue().catch(() => {});
    });
    await tab.goto(`${origin}/studio.html`);await tab.waitForSelector('body[data-studio-ready="true"]');
    return tab;
  };
  const settle = tab => tab.waitForFunction(() => document.body.dataset.studioBusy !== 'true');
  const property = async (tab, name, value) => { const input = tab.getByLabel(name, { exact: true });await input.fill(String(value));await input.press('Tab');await settle(tab); };
  const open = async (tab, name) => {
    await tab.locator('#studio-templates').click();
    await tab.getByRole('button', { name: `Use ${name}`, exact: true }).click();
    await tab.getByRole('status').filter({ hasText: `${name} opened` }).waitFor();
  };
  // Walk-mode view from reception toward the counter, as in studio-office-stations.
  const station = async tab => {
    await tab.locator('[data-item="@arrival"]').click();await property(tab, 'East (m)', 0);await property(tab, 'North (m)', -4);
    await tab.getByRole('button', { name: 'Walk through', exact: true }).click();await tab.waitForSelector('body[data-mode="walk"]');
    await tab.waitForFunction(() => document.querySelector('#studio-position').textContent.includes('0.0 E / -4.0 N'));
    const box = await tab.locator('#studio-viewport canvas').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await tab.mouse.move(x, y);await tab.mouse.down();await tab.mouse.move(x - Math.round(1.6952 / .004), y, { steps: 8 });await tab.mouse.up();
  };
  // Mean brightness (0–255) of the counter top's face in the 984×786 viewport capture.
  const counter = async (tab, label) => {
    await tab.waitForTimeout(300);
    const shot = (await tab.locator('#studio-viewport').screenshot({ path: `output/playwright/studio-assets-${label}.png` })).toString('base64');
    return tab.evaluate(async png => {
      const image = new Image();image.src = `data:image/png;base64,${png}`;await image.decode();
      const canvas = document.createElement('canvas');canvas.width = image.width;canvas.height = image.height;
      const draw = canvas.getContext('2d');draw.drawImage(image, 0, 0);
      const { data } = draw.getImageData(400, 530, 150, 40);let sum = 0;
      for (let index = 0; index < data.length; index += 4) sum += (data[index] + data[index + 1] + data[index + 2]) / 3;
      return Math.round(sum / (data.length / 4));
    }, shot);
  };
  const stats = async tab => JSON.parse(await tab.locator('#studio-viewport').getAttribute('data-render-stats'));
  await page.close();

  for (const mode of ['normal', 'missing']) {
    const tab = await launch(mode);await open(tab, 'Garden Office');await station(tab);
    results[mode] = { counter: await counter(tab, mode), stats: await stats(tab) };await tab.close();
  }
  {
    const tab = await launch('delayed'), opened = Date.now();await open(tab, 'Garden Office');await station(tab);
    results.loading = { counter: await counter(tab, 'loading'), secondsAfterOpen: (Date.now() - opened) / 1000 };
    await tab.waitForTimeout(Math.max(0, delay + 1500 - (Date.now() - opened)));
    results.loaded = { counter: await counter(tab, 'loaded'), stats: await stats(tab) };await tab.close();
  }
  {
    const tab = await launch('replaced');await open(tab, 'Garden Office');await open(tab, 'Courtyard House');
    await tab.waitForTimeout(delay + 1500);await open(tab, 'Garden Office');await station(tab);
    results.replaced = { counter: await counter(tab, 'replaced'), stats: await stats(tab) };await tab.close();
  }
  await context.newPage();
  if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
  // A missing or late texture must not turn its surface black: stay near the loaded look.
  for (const name of ['missing', 'loading', 'loaded', 'replaced']) {
    if (Math.abs(results[name].counter - results.normal.counter) > 40)
      throw Error(`${name} counter top reads ${results[name].counter}, normal ${results.normal.counter}`);
  }
  return { passed: true, delayMs: delay, results };
}
