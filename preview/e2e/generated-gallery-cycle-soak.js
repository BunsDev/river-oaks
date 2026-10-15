async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const cycles = Number(process.env.RIVER_OAKS_GALLERY_CYCLES ?? 5);
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 10) throw new Error('Choose 1–10 gallery cycles');
  const qualityMode = process.env.RIVER_OAKS_GALLERY_QUALITY ?? 'auto';
  if (!['auto', 'sharp', 'smooth'].includes(qualityMode)) throw new Error('Choose auto, sharp or smooth gallery quality');
  const aoMode = process.env.RIVER_OAKS_GALLERY_AO ?? 'on';
  if (!['on', 'off'].includes(aoMode)) throw new Error('Choose on or off gallery ambient occlusion');
  const aoTailMode = process.env.RIVER_OAKS_GALLERY_AO_TAIL ?? 'off';
  if (!['on', 'off'].includes(aoTailMode)) throw new Error('Choose on or off gallery AO tail rule');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:5173/?motion-debug=1&render-audit=1${aoMode === 'off' ? '&ao=off' : ''}${aoTailMode === 'on' ? '&aotail=on' : ''}`);
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined');
  const tailShedding = await page.evaluate(() => window.__riverRenderAudit.graphics().quality.tailShedding);
  if (tailShedding !== (aoTailMode === 'on'))
    throw new Error(`Gallery AO tail mode mismatch: requested ${aoTailMode}, active ${tailShedding}`);
  if (qualityMode !== 'auto') await page.evaluate(mode => document.querySelector(`[data-quality="${mode}"]`).click(), qualityMode);
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  const state = () => page.evaluate(() => window.__riverGeneratedInteriors?.()[0] ?? null);
  const graphics = () => page.evaluate(() => ({
    memory: window.__riverRenderAudit.graphics().memory,
    heapBytes: performance.memory?.usedJSHeapSize ?? null,
  }));
  const finishRender = () => page.evaluate(() => {
    const audit = window.__riverRenderAudit;
    const { frames, overflow } = audit.stop();
    const percentile = (values, fraction) => {
      const ordered = values.toSorted((a, b) => a - b);
      return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))];
    };
    const intervals = frames.map(frame => frame.intervalMs);
    const cpu = frames.map(frame => frame.cpuMs);
    return { frames: frames.length, overflow,
      intervalMs: { p50: percentile(intervals, .5), p95: percentile(intervals, .95),
        p99: percentile(intervals, .99), max: Math.max(...intervals),
        over25: intervals.filter(value => value > 25).length },
      mainThreadMs: { p50: percentile(cpu, .5), p95: percentile(cpu, .95),
        p99: percentile(cpu, .99) },
      graphics: audit.graphics(), heapBytes: performance.memory?.usedJSHeapSize ?? null };
  });
  const sampleRender = async () => {
    await page.evaluate(() => window.__riverRenderAudit.start());
    await page.evaluate(async () => {
      for (let index = 0; index < 150; index++) await new Promise(resolve => requestAnimationFrame(resolve));
    });
    return finishRender();
  };
  const visit = async label => {
    await page.locator('#destination').selectOption({ label });
    await page.locator('#visit-destination').click();
  };
  const initial = await state();
  if (!initial || initial.ready || !initial.shellVisible) throw new Error(`Expected initial gallery shell: ${JSON.stringify(initial)}`);
  const coldStart = performance.now();
  await visit('Laura Rathe Fine Art');
  await page.waitForFunction(() => window.__riverGeneratedInteriors?.()[0]?.ready, null, { timeout: 30000 });
  const coldMs = performance.now() - coldStart;
  await page.waitForTimeout(1500);

  const samples = [];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    await page.locator('#enter-destination').click();
    await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside, null, { timeout: 10000 });
    if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
    const inside = await page.evaluate(() => {
      const multiplayer = window.__riverMultiplayer();
      const player = multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId);
      return { levelId: player?.levelId, buildingId: player?.buildingId,
        stream: window.__riverGeneratedInteriors()[0] };
    });
    if (!inside.levelId?.endsWith('/l0') || !inside.buildingId || !inside.stream.ready || inside.stream.shellVisible)
      throw new Error(`Cycle ${cycle} entered without approved detail and occupancy: ${JSON.stringify(inside)}`);
    const render = await sampleRender();
    if (render.overflow || render.frames < 120) throw new Error(`Incomplete cycle ${cycle} frame sample: ${JSON.stringify(render)}`);
    if (aoMode === 'on' && qualityMode === 'auto' && render.graphics.pipeline.ao)
      throw new Error(`Auto kept full AO inside a generated room on cycle ${cycle}`);
    if (aoMode === 'on' && qualityMode === 'sharp' && !render.graphics.pipeline.ao)
      throw new Error(`Sharpest lost full AO inside a generated room on cycle ${cycle}`);
    if (cycle === 1 || cycle === cycles) await page.screenshot({ path: `output/playwright/gallery-cycle-${cycle}.png` });
    await page.locator('#canvas-host').focus();
    const beforeWalk = await page.evaluate(() => ({
      position: [...window.__riverCarriage().pose.position], cull: window.__riverExteriorCull().cull,
    }));
    await page.evaluate(() => window.__riverRenderAudit.start());
    let moving;
    try {
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(1700);
    } finally { await page.keyboard.up('KeyW'); moving = await finishRender(); }
    const afterWalk = await page.evaluate(() => ({
      position: [...window.__riverCarriage().pose.position], cull: window.__riverExteriorCull().cull,
    }));
    const movedM = Math.hypot(afterWalk.position[0] - beforeWalk.position[0],
      afterWalk.position[2] - beforeWalk.position[2]);
    if (moving.overflow || moving.frames < 45 || movedM < 0.4)
      throw new Error(`Cycle ${cycle} did not produce a valid moving frame sample: ${JSON.stringify({ moving, movedM, beforeWalk, afterWalk })}`);
    if (!beforeWalk.cull || !afterWalk.cull || !(await page.locator('#walking-hud').getAttribute('data-inside')))
      throw new Error(`Cycle ${cycle} lost the opaque interior view while walking: ${JSON.stringify({ beforeWalk, afterWalk })}`);
    if (process.env.RIVER_OAKS_GALLERY_CANVAS_CAPTURE === '1' && (cycle === 1 || cycle === cycles)) {
      const hideUi = await page.addStyleTag({ content: 'body * { visibility: hidden !important } #canvas-host, #canvas-host * { visibility: visible !important }' });
      try { await page.locator('#canvas-host canvas').screenshot({ path: `output/playwright/gallery-canvas-cycle-${cycle}.png` }); }
      finally { await hideUi.evaluate(element => element.remove()); }
    }
    await page.waitForTimeout(250);
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => !document.querySelector('#walking-hud')?.dataset.inside, null, { timeout: 10000 });
    await page.waitForFunction(() => {
      const multiplayer = window.__riverMultiplayer();
      return multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId)?.levelId === null;
    }, null, { timeout: 10000 });
    await page.waitForTimeout(1500);
    if (aoMode === 'on' && qualityMode === 'auto') {
      const outside = await page.evaluate(() => window.__riverRenderAudit.graphics());
      if (outside.pipeline.ao !== outside.quality.occlusion)
        throw new Error(`Auto did not restore district AO after cycle ${cycle}: ${JSON.stringify(outside)}`);
    }
    await visit('Cartier');
    await page.waitForFunction(() => document.querySelector('#walking-enter')?.textContent?.includes('Cartier'), null, { timeout: 10000 });
    await page.waitForTimeout(12500);
    const evicted = await state();
    if (evicted.ready || !evicted.shellVisible || evicted.pending)
      throw new Error(`Cycle ${cycle} did not evict gallery detail: ${JSON.stringify(evicted)}`);
    const afterEviction = await graphics();
    const returnStart = performance.now();
    await visit('Laura Rathe Fine Art');
    await page.waitForFunction(() => window.__riverGeneratedInteriors?.()[0]?.ready, null, { timeout: 30000 });
    const returnMs = performance.now() - returnStart;
    await page.waitForTimeout(1500);
    samples.push({ cycle, render, moving, movedM, beforeWalk, afterWalk,
      afterEviction, afterReturn: await graphics(), returnMs });
    if (cycle > 1) {
      const baseline = samples[0];
      for (const [stage, current, first] of [
        ['eviction', afterEviction.memory, baseline.afterEviction.memory],
        ['return', samples.at(-1).afterReturn.memory, baseline.afterReturn.memory],
      ]) {
        if (current.geometries > first.geometries + 2 || current.textures > first.textures + 2)
          throw new Error(`Cycle ${cycle} renderer resources grew after ${stage}: ${JSON.stringify({ current, first })}`);
      }
    }
  }
  if (errors.length) throw new Error(errors.join('; '));
  return { passed: true, cycles, qualityMode, aoMode, aoTailMode, coldMs, samples,
    scope: 'One authenticated fixture client, repeated gallery entry, measured keyboard walk, exit, distance eviction and return at 1440x900 on local Chromium. Frame samples include host load; renderer geometry/texture counts and Chromium JS heap are resource indicators, not physical GPU memory. No target-device or human visual acceptance.' };
}
