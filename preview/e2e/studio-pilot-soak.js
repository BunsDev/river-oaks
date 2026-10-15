async page => {
  // #417 resource soak for the Garden Office pilot: one warm-up cycle plus ten more
  // (or STUDIO_SOAK_CYCLES).
  // Each cycle opens Garden Office, walks it, returns to the editor and replaces it with
  // Courtyard House so the office scene is disposed. Samples follow a forced garbage
  // collection: renderer counts from the viewport's render stats, and JS heap, event
  // listeners and DOM nodes from Chromium's Performance domain.
  const origin = 'http://127.0.0.1:5173', errors = [], cycles = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/studio.html`);
  await page.waitForSelector('body[data-studio-ready="true"]');
  const viewport = page.locator('#studio-viewport');
  const sample = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    // Render stats refresh once a second; wait for a reading taken after this state settled.
    const settled = await page.evaluate(() => performance.now());
    await page.waitForFunction(after => JSON.parse(document.querySelector('#studio-viewport').dataset.renderStats ?? '{"at":0}').at > after + 250, settled);
    const stats = JSON.parse(await viewport.getAttribute('data-render-stats'));
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
    return { calls: stats.calls, triangles: stats.triangles, geometries: stats.geometries, textures: stats.textures, programs: stats.programs,
      listeners: metrics.JSEventListeners, nodes: metrics.Nodes, heapMiB: +(metrics.JSHeapUsedSize / 1048576).toFixed(2), canvases: await page.locator('canvas').count() };
  };
  const open = async name => {
    await page.locator('#studio-templates').click();
    await page.getByRole('button', { name: `Use ${name}`, exact: true }).click();
    await page.getByRole('status').filter({ hasText: `${name} opened` }).waitFor();
  };
  const walk = async () => {
    await page.getByRole('button', { name: 'Walk through', exact: true }).click();
    await page.waitForSelector('body[data-mode="walk"]');
    await viewport.focus();
    await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');
    const box = await page.locator('#studio-viewport canvas').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);await page.mouse.down();await page.mouse.move(x - 390, y, { steps: 8 });await page.mouse.up();
    await page.keyboard.down('w');await page.waitForTimeout(1000);await page.keyboard.up('w');
    await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
    await page.waitForSelector('body[data-mode="edit"]');
  };
  // STUDIO_SOAK_CYCLES lengthens the run, for example to watch a bounded cache settle.
  // STUDIO_SOAK_SNAPSHOTS=10,40 saves heap snapshots after those cycles for diagnosis.
  const total = Math.max(10, Number(process.env.STUDIO_SOAK_CYCLES) || 10);
  const snapshotAt = new Set(String(process.env.STUDIO_SOAK_SNAPSHOTS ?? '').split(',').filter(Boolean).map(Number));
  const snapshot = async cycle => {
    const { writeFile, mkdir } = await import('node:fs/promises'), chunks = [], collect = ({ chunk }) => chunks.push(chunk);
    await cdp.send('HeapProfiler.collectGarbage');
    cdp.on('HeapProfiler.addHeapSnapshotChunk', collect);
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    cdp.off('HeapProfiler.addHeapSnapshotChunk', collect);
    await mkdir('.runtime/acceptance/heap', { recursive: true });
    await writeFile(`.runtime/acceptance/heap/cycle-${cycle}.heapsnapshot`, chunks.join(''));
  };
  for (let cycle = 0; cycle <= total; cycle++) {
    const started = Date.now();
    await open('Garden Office');
    await page.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();
    await walk();
    const office = await sample();
    await open('Courtyard House');
    const replaced = await sample();
    cycles.push({ cycle, warmUp: cycle === 0, seconds: (Date.now() - started) / 1000, office, replaced });
    if (snapshotAt.has(cycle)) await snapshot(cycle);
  }
  if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
  return { passed: true, cycles };
}
