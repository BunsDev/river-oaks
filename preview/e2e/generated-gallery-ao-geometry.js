async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const cycles = Number(process.env.RIVER_OAKS_GALLERY_CYCLES ?? 3);
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 5) throw new Error('Choose 1–5 gallery cycles');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1&render-audit=1');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined');
  await page.evaluate(() => document.querySelector('[data-quality="sharp"]').click());
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');

  const visit = async label => {
    await page.locator('#destination').selectOption({ label });
    await page.locator('#visit-destination').click();
  };
  await visit('Laura Rathe Fine Art');
  await page.waitForFunction(() => window.__riverGeneratedInteriors?.()[0]?.ready, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const samples = [];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    await page.locator('#enter-destination').click();
    await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside, null, { timeout: 10000 });
    if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => ({ position: [...window.__riverCarriage().pose.position], cull: window.__riverExteriorCull() }));
    await page.evaluate(async () => {
      const source = await (await fetch('/src/render-pipeline.js')).text();
      const url = [...source.matchAll(/from\s+["']([^"']+)["']/g)]
        .map(match => match[1]).find(value => value.includes('GTAOPass__js') || value.includes('/GTAOPass.js'));
      if (!url) throw new Error('GTAOPass module import not found');
      const { GTAOPass } = await import(url);
      const original = GTAOPass.prototype.render;
      const totals = new Map();
      const instrument = { frames: 0, calls: 0, culledFrames: 0, visibleExteriorFrames: 0,
        roots: totals, restore: () => { GTAOPass.prototype.render = original; } };
      GTAOPass.prototype.render = function(renderer, ...args) {
        if (window.__riverExteriorCull().cull) instrument.culledFrames++;
        const interiors = this.scene.getObjectByName('Boutique interiors layer');
        if (interiors?.parent?.children.some(child => child !== interiors && child.visible)) instrument.visibleExteriorFrames++;
        const draw = renderer.renderBufferDirect;
        renderer.renderBufferDirect = function(camera, scene, geometry, material, object, group) {
          const names = [];
          for (let parent = object; parent; parent = parent.parent) if (parent.name) names.push(parent.name);
          const root = names.at(-1) ?? object.type;
          const count = Math.min(group?.count ?? Infinity, geometry.index?.count ?? geometry.attributes.position.count);
          const entry = totals.get(root) ?? { name: root, calls: 0, triangles: 0 };
          entry.calls++;
          entry.triangles += count / 3 * (object.isInstancedMesh ? object.count : 1);
          totals.set(root, entry);
          instrument.calls++;
          return draw.call(this, camera, scene, geometry, material, object, group);
        };
        try { return original.call(this, renderer, ...args); }
        finally { renderer.renderBufferDirect = draw; instrument.frames++; }
      };
      window.__galleryAoGeometry = instrument;
      window.__riverRenderAudit.start();
    });
    await page.locator('#canvas-host').focus();
    try {
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(1700);
    } finally { await page.keyboard.up('KeyW'); }
    const sample = await page.evaluate(() => {
      const instrument = window.__galleryAoGeometry;
      instrument.restore();
      delete window.__galleryAoGeometry;
      const { frames, overflow } = window.__riverRenderAudit.stop();
      const intervals = frames.map(frame => frame.intervalMs).toSorted((a, b) => a - b);
      const p95 = intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * .95))];
      return { aoFrames: instrument.frames, aoCallsPerFrame: instrument.calls / instrument.frames,
        culledFrames: instrument.culledFrames, visibleExteriorFrames: instrument.visibleExteriorFrames,
        roots: [...instrument.roots.values()].sort((a, b) => b.calls - a.calls)
          .map(entry => ({ name: entry.name, callsPerFrame: entry.calls / instrument.frames,
            trianglesPerFrame: entry.triangles / instrument.frames })),
        moving: { frames: frames.length, overflow, p95, over25: intervals.filter(value => value > 25).length },
        quality: document.querySelector('#canvas-host')?.dataset.quality,
        pipeline: document.querySelector('#canvas-host')?.dataset.pipeline };
    });
    const after = await page.evaluate(() => ({ position: [...window.__riverCarriage().pose.position], cull: window.__riverExteriorCull() }));
    sample.movedM = Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]);
    sample.exteriorCull = { before: before.cull.cull, after: after.cull.cull };
    if (sample.movedM < .4 || sample.aoFrames < 40 || sample.moving.overflow || sample.moving.frames < 40)
      throw new Error(`Invalid moving AO sample: ${JSON.stringify(sample)}`);
    if (!JSON.parse(sample.pipeline).ao || JSON.parse(sample.quality).mode !== 'sharp')
      throw new Error(`AO or Sharpest quality changed during sample: ${JSON.stringify(sample)}`);
    samples.push({ cycle, ...sample });
    if (cycle === cycles) break;
    await page.waitForTimeout(250);
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => !document.querySelector('#walking-hud')?.dataset.inside, null, { timeout: 10000 });
    await page.waitForFunction(() => {
      const multiplayer = window.__riverMultiplayer();
      return multiplayer.snapshot.players.find(item => item.id === multiplayer.selfId)?.levelId === null;
    }, null, { timeout: 10000 });
    await page.waitForTimeout(1500);
    await visit('Cartier');
    await page.waitForFunction(() => document.querySelector('#walking-enter')?.textContent?.includes('Cartier'), null, { timeout: 30000 });
    await page.waitForTimeout(12500);
    await visit('Laura Rathe Fine Art');
    await page.waitForFunction(() => window.__riverGeneratedInteriors?.()[0]?.ready, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
  }
  return { passed: true, samples, scope: 'AO renderBufferDirect calls during 1.7s keyboard walks at fixed Sharpest quality on local Chromium; instrumentation itself adds CPU work, so frame intervals are diagnostic rather than an uninstrumented performance baseline.' };
}
