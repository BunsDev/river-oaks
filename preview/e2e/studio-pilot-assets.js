async page => {
  // #417 late and missing assets. A furnished space's only asynchronous assets are the
  // shared stone and paver textures. Each case uses a fresh page (routing disables the
  // HTTP cache), stands at a station and measures one textured surface: textures normal,
  // blocked, delayed (during and after loading), and the scene replaced while they load,
  // then reopened. STUDIO_TEMPLATE picks the template (#418). Only floors are textured
  // since #466; regions read from studio-template-stations captures of the same views.
  // The shipped Garden Office has no textured surface, so its case first makes one valid
  // edit, a limestone meeting-room floor, and looks down at it from inside the room.
  const STATIONS = {
    office: { at: [3, 1], yaw: -.896, pitch: -.6, region: [400, 600, 150, 40], surface: 'limestone meeting floor (edited)', edit: { item: 'meeting-floor', finish: 'limestone' } },
    house: { at: [-2, -8], look: [-5, -8], region: [180, 720, 150, 50], surface: 'terracotta patio' },
    boutique: { at: [0, 0], look: [-3, -.7], region: [60, 640, 150, 50], surface: 'limestone sales floor' },
    cafe: { at: [0, -2], look: [-5.8, -3.8], region: [600, 680, 150, 50], surface: 'terracotta floor' },
  };
  const NAMES = { house: 'Courtyard House', office: 'Garden Office', boutique: 'Atelier Boutique', cafe: 'Corner Café' };
  const templateId = process.env.STUDIO_TEMPLATE ?? 'office', view = STATIONS[templateId], subject = NAMES[templateId], other = templateId === 'house' ? NAMES.office : NAMES.house;
  if (!view) throw Error(`Unknown template ${templateId}`);
  const origin = 'http://127.0.0.1:5173', errors = [], results = {}, delay = 8000;
  const context = page.context();
  const textureRequest = url => /\/assets\/materials\/(stone|paver)-/.test(new URL(url).pathname);
  const launch = async mode => {
    const tab = await context.newPage(), requests = { started: 0, finished: 0, failed: 0, pending: 0 };
    tab.on('request', request => { if (textureRequest(request.url())) { requests.started++;requests.pending++; } });
    tab.on('requestfinished', request => { if (textureRequest(request.url())) { requests.finished++;requests.pending--; } });
    tab.on('requestfailed', request => { if (textureRequest(request.url())) { requests.failed++;requests.pending--; } });
    tab.on('pageerror', error => errors.push(`${mode}: ${error.message}`));tab.on('dialog', dialog => dialog.accept());
    await tab.setViewportSize({ width: 1440, height: 1000 });
    await tab.route(url => textureRequest(url.href), async route => {
      if (mode === 'missing') return route.abort();
      if (mode === 'delayed' || mode === 'replaced') await new Promise(resolve => setTimeout(resolve, delay));
      return route.continue().catch(() => {});
    });
    await tab.goto(`${origin}/studio.html`);await tab.waitForSelector('body[data-studio-ready="true"]');
    return { tab, requests };
  };
  const settle = tab => tab.waitForFunction(() => document.body.dataset.studioBusy !== 'true');
  const property = async (tab, name, value) => { const input = tab.getByLabel(name, { exact: true });await input.fill(String(value));await input.press('Tab');await settle(tab); };
  const open = async (tab, name) => {
    await tab.locator('#studio-templates').click();
    await tab.getByRole('button', { name: `Use ${name}`, exact: true }).click();
    await tab.getByRole('status').filter({ hasText: `${name} opened` }).waitFor();
    if (name === subject && view.edit) {
      await tab.locator(`[data-item="${view.edit.item}"]`).click();
      await tab.getByRole('combobox', { name: 'Finish', exact: true }).selectOption(view.edit.finish);await settle(tab);
      await tab.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();
    }
  };
  // Walk-mode view from the station toward its look point, as in studio-template-stations.
  const station = async tab => {
    const [east, north] = view.at;
    await tab.locator('[data-item="@arrival"]').click();await property(tab, 'East (m)', east);await property(tab, 'North (m)', north);
    await tab.getByRole('button', { name: 'Walk through', exact: true }).click();await tab.waitForSelector('body[data-mode="walk"]');
    await tab.waitForFunction(text => document.querySelector('#studio-position').textContent.includes(text), `${east.toFixed(1)} E / ${north.toFixed(1)} N`);
    const yaw = view.yaw ?? Math.atan2(-(view.look[0] - east), view.look[1] - north), pitch = view.pitch ?? 0;
    const box = await tab.locator('#studio-viewport canvas').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await tab.mouse.move(x, y);await tab.mouse.down();await tab.mouse.move(x - Math.round(yaw / .004), y - Math.round(pitch / .004), { steps: 8 });await tab.mouse.up();
  };
  // Mean brightness (0–255) of the measured surface in the 984×786 viewport capture.
  const surface = async (tab, label) => {
    await tab.waitForTimeout(300);
    const shot = (await tab.locator('#studio-viewport').screenshot({ path: `output/playwright/studio-assets-${templateId}-${label}.png` })).toString('base64');
    return tab.evaluate(async ([png, region]) => {
      const image = new Image();image.src = `data:image/png;base64,${png}`;await image.decode();
      const canvas = document.createElement('canvas');canvas.width = image.width;canvas.height = image.height;
      const draw = canvas.getContext('2d');draw.drawImage(image, 0, 0);
      const { data } = draw.getImageData(...region);let sum = 0;
      for (let index = 0; index < data.length; index += 4) sum += (data[index] + data[index + 1] + data[index + 2]) / 3;
      return Math.round(sum / (data.length / 4));
    }, [shot, view.region]);
  };
  const stats = async tab => JSON.parse(await tab.locator('#studio-viewport').getAttribute('data-render-stats'));
  // Stats from a frame rendered after this call, once the scene's own route check is done.
  const settledStats = async tab => {
    await settle(tab);await tab.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();
    const since = (await stats(tab))?.at ?? 0;
    await tab.waitForFunction(after => JSON.parse(document.querySelector('#studio-viewport').dataset.renderStats ?? '{"at":0}').at > after, since);
    return stats(tab);
  };
  // Request counts as they stood at each capture, not as they end up.
  const capture = async (tab, requests, label) => ({ surface: await surface(tab, label), requests: { ...requests }, stats: await stats(tab) });
  const untilSettled = async (tab, requests) => {
    for (const started = Date.now(); requests.pending > 0; await tab.waitForTimeout(100))
      if (Date.now() - started > delay + 15000) throw Error(`Texture requests still pending: ${JSON.stringify(requests)}`);
  };
  // Scene and input state the late completions must leave alone after a replacement.
  const sceneState = tab => tab.evaluate(() => ({ mode: document.body.dataset.mode, items: [...document.querySelectorAll('[data-item]')].map(item => item.dataset.item).join(','),
    selected: document.querySelector('[data-item][aria-pressed="true"]')?.dataset.item ?? null, status: document.querySelector('[role="status"]')?.textContent ?? '' }));
  await page.close();

  for (const mode of ['normal', 'missing']) {
    const { tab, requests } = await launch(mode);await open(tab, subject);await station(tab);
    results[mode] = await capture(tab, requests, mode);await tab.close();
  }
  {
    const { tab, requests } = await launch('delayed'), opened = Date.now();await open(tab, subject);await station(tab);
    results.loading = { ...await capture(tab, requests, 'loading'), secondsAfterOpen: (Date.now() - opened) / 1000 };
    await untilSettled(tab, requests);
    const settledAfterOpen = (Date.now() - opened) / 1000, readings = [];
    // Network completion precedes decode and upload by a frame or two; allow five
    // rendered seconds for the photograph to replace the neutral pixel.
    let loaded = await capture(tab, requests, 'loaded');readings.push(loaded.surface);
    for (let attempt = 0; attempt < 5 && Math.abs(loaded.surface - results.normal.surface) > 3; attempt++) {
      await tab.waitForTimeout(1000);loaded = await capture(tab, requests, 'loaded');readings.push(loaded.surface);
    }
    results.loaded = { ...loaded, settledAfterOpen, readings };await tab.close();
  }
  {
    const { tab, requests } = await launch('replaced');await open(tab, subject);
    const pendingAtReplacement = requests.pending;await open(tab, other);
    const statsBefore = await settledStats(tab), before = await sceneState(tab), pendingAfterReplacement = requests.pending;
    await untilSettled(tab, requests);await tab.waitForTimeout(1500);
    const statsAfter = await settledStats(tab), after = await sceneState(tab);
    const stableReplacement = JSON.stringify(before) === JSON.stringify(after) && before.mode === 'edit' && statsBefore.geometries === statsAfter.geometries;
    if (!stableReplacement) throw Error(`Late texture completion changed the replacement scene: ${JSON.stringify({ before, after, statsBefore, statsAfter })}`);
    await open(tab, subject);await station(tab);
    results.replaced = { ...await capture(tab, requests, 'replaced'), pendingAtReplacement, pendingAfterReplacement, stableReplacement, statsBefore, statsAfter, replacementItems: before.items.split(',').length };await tab.close();
  }
  await context.newPage();
  if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
  const { normal, missing, loading, loaded, replaced } = results;
  if (normal.requests.finished < 3 || normal.requests.failed || missing.requests.failed < 3 || loading.requests.pending < 3 ||
      loaded.requests.pending || replaced.pendingAtReplacement < 3 || replaced.pendingAfterReplacement < 3)
    throw Error(`Texture load cases were not exercised: ${JSON.stringify(results)}`);
  // A check that cannot fail proves nothing: the surface must show its texture.
  if (Math.abs(missing.surface - normal.surface) < 5) throw Error(`${view.surface} reads ${missing.surface} without its texture and ${normal.surface} with it: not a textured surface`);
  // A missing or late texture must not turn its surface black: stay near the loaded look.
  for (const name of ['missing', 'loading'])
    if (Math.abs(results[name].surface - normal.surface) > 40) throw Error(`${name} ${view.surface} reads ${results[name].surface}, normal ${normal.surface}`);
  // Once loaded, the photograph replaces the stand-in exactly.
  for (const name of ['loaded', 'replaced'])
    if (Math.abs(results[name].surface - normal.surface) > 3) throw Error(`${name} ${view.surface} reads ${results[name].surface}, normal ${normal.surface}: the texture did not recover`);
  return { passed: true, templateId, surface: view.surface, delayMs: delay, results };
}
