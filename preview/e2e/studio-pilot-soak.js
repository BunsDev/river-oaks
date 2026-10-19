async page => {
  // #417 resource soak for the Garden Office pilot: one warm-up cycle plus ten more
  // (or STUDIO_SOAK_CYCLES). STUDIO_TEMPLATE soaks another stock template (#418).
  // Each cycle opens the template, walks it, returns to the editor and replaces it with
  // another template (Courtyard House, or Garden Office when soaking House) so the scene
  // is disposed. Samples follow a forced garbage collection: renderer counts from the
  // viewport's render stats, and JS heap, event listeners and DOM nodes from Chromium's
  // Performance domain. Pending loads: shared material image requests, route-assessment
  // workers still alive and timeouts not yet fired or cleared (counted in the page).
  const NAMES = { house: 'Courtyard House', office: 'Garden Office', boutique: 'Atelier Boutique', cafe: 'Corner Café' };
  const templateId = process.env.STUDIO_TEMPLATE ?? 'office', subject = NAMES[templateId], other = templateId === 'house' ? NAMES.office : NAMES.house;
  if (!subject) throw Error(`Unknown template ${templateId}`);
  const origin = 'http://127.0.0.1:5173', errors = [], cycles = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const materialLoads = { started: 0, finished: 0, failed: 0, pending: 0 };
  const materialRequest = request => new URL(request.url()).pathname.startsWith('/assets/materials/');
  page.on('request', request => { if (materialRequest(request)) { materialLoads.started++;materialLoads.pending++; } });
  page.on('requestfinished', request => { if (materialRequest(request)) { materialLoads.finished++;materialLoads.pending--; } });
  page.on('requestfailed', request => { if (materialRequest(request)) { materialLoads.failed++;materialLoads.pending--; } });
  await page.addInitScript(() => {
    const counts = window.__studioSoakCounts = { workers: 0, liveWorkers: 0, pendingTimeouts: 0 }, timeouts = new Set();
    const NativeWorker = window.Worker, { setTimeout: set, clearTimeout: clear } = window;
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args);counts.workers++;counts.liveWorkers++; }
      terminate() { if (!this.terminated) { this.terminated = true;counts.liveWorkers--; } super.terminate(); }
    };
    window.setTimeout = (callback, ...rest) => {
      const id = set(typeof callback === 'function' ? (...args) => { timeouts.delete(id);counts.pendingTimeouts = timeouts.size;callback(...args); } : callback, ...rest);
      timeouts.add(id);counts.pendingTimeouts = timeouts.size;return id;
    };
    window.clearTimeout = id => { timeouts.delete(id);counts.pendingTimeouts = timeouts.size;clear(id); };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/studio.html`);
  await page.waitForSelector('body[data-studio-ready="true"]');
  const viewport = page.locator('#studio-viewport');
  // On macOS, the GPU process's physical footprint and its IOAccelerator (Metal) share, as in
  // studio-pilot-perf.mjs: unified memory, so a trend across cycles rather than per-resource VRAM.
  const gpuMemory = process.platform !== 'darwin' ? null : await (async () => {
    const { execFileSync } = await import('node:child_process'), { mkdirSync, readFileSync } = await import('node:fs');
    const browserCdp = await page.context().browser().newBrowserCDPSession(), file = '.runtime/acceptance/soak-gpu-footprint.json';
    mkdirSync('.runtime/acceptance', { recursive: true });
    return async () => {
      const gpu = (await browserCdp.send('SystemInfo.getProcessInfo')).processInfo.find(info => info.type === 'GPU');
      if (!gpu) return {};
      execFileSync('footprint', ['-p', String(gpu.id), '--json', file, '-f', 'bytes'], { stdio: 'ignore' });
      const [entry] = JSON.parse(readFileSync(file, 'utf8')).processes, metal = entry.categories?.['IOAccelerator (graphics)'];
      return { gpuFootprintMiB: +(entry.footprint / 1048576).toFixed(1), gpuMetalMiB: metal ? +((metal.dirty + metal.swapped) / 1048576).toFixed(1) : 0 };
    };
  })();
  const sample = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    // Render stats refresh once a second; wait for a reading taken after this state settled.
    const settled = await page.evaluate(() => performance.now());
    await page.waitForFunction(after => JSON.parse(document.querySelector('#studio-viewport').dataset.renderStats ?? '{"at":0}').at > after + 250, settled);
    const stats = JSON.parse(await viewport.getAttribute('data-render-stats'));
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
    if (!Number.isInteger(stats.materials) || !Number.isInteger(stats.renderTargets)) throw Error('Studio resource ownership counts unavailable');
    return { calls: stats.calls, triangles: stats.triangles, geometries: stats.geometries, materials: stats.materials,
      textures: stats.textures, renderTargets: stats.renderTargets, programs: stats.programs,
      listeners: metrics.JSEventListeners, nodes: metrics.Nodes, heapMiB: +(metrics.JSHeapUsedSize / 1048576).toFixed(2), canvases: await page.locator('canvas').count(),
      materialLoads: { ...materialLoads }, ...await page.evaluate(() => ({ ...window.__studioSoakCounts })), ...await gpuMemory?.() };
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
    await open(subject);
    await page.locator('#studio-assessment-status').filter({ hasText: 'Required routes passed' }).waitFor();
    await walk();
    const opened = await sample();
    await open(other);
    const replaced = await sample();
    // `office` keeps the #417 receipt field name for the soaked template's sample.
    cycles.push({ cycle, warmUp: cycle === 0, seconds: (Date.now() - started) / 1000, office: opened, replaced });
    if (snapshotAt.has(cycle)) await snapshot(cycle);
  }
  if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
  return { passed: true, templateId, cycles };
}
