async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1&render-audit=1');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption({ label: 'Laura Rathe Fine Art' });
  await page.locator('#visit-destination').click();
  await page.waitForFunction(() => window.__riverGeneratedInteriors?.()[0]?.ready, null, { timeout: 30000 });
  // Pin the same native-resolution AO pipeline on both sides of the door.
  await page.evaluate(() => document.querySelector('[data-quality="sharp"]').click());
  await page.waitForTimeout(1500);

  const sample = async () => page.evaluate(async () => {
    const source = await (await fetch('/src/render-pipeline.js')).text();
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
    const passNames = ['RenderPass', 'GTAOPass', 'UnrealBloomPass', 'OutputPass'];
    const patches = [], records = [], objects = new Map(), interiorGroups = new Map();
    const gl = document.querySelector('#canvas-host canvas').getContext('webgl2');
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2'), queries = [];
    let frames = 0;
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const percentile = (values, fraction) => {
      const ordered = values.toSorted((a, b) => a - b);
      return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))];
    };
    try {
      for (let index = 0; index < 30; index++) await nextFrame();
      for (const name of passNames) {
        const url = imports.find(value => value.includes(`${name}__js`) || value.includes(`/${name}.js`));
        if (!url) throw new Error(`Missing Vite import for ${name}`);
        const Type = (await import(url))[name], original = Type.prototype.render;
        const record = { name, frames: 0, cpuMs: 0, calls: 0, triangles: 0, gpuMs: [] };
        records.push(record);
        patches.push([Type.prototype, original]);
        Type.prototype.render = function(renderer, ...args) {
          const beforeCalls = renderer.info.render.calls, beforeTriangles = renderer.info.render.triangles;
          const start = performance.now();
          const query = timer && frames % 4 === 0 ? gl.createQuery() : null;
          if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          const draw = renderer.renderBufferDirect;
          if (name === 'RenderPass') renderer.renderBufferDirect = function(camera, scene, geometry, material, object, group) {
            const names = [];
            for (let parent = object; parent; parent = parent.parent) if (parent.name) names.push(parent.name);
            const category = names.reverse().slice(0, 3).join('/') || object.type;
            const root = names[0] ?? object.type;
            if (root === 'Mature urban shade trees') {
              let tree = object;
              while (tree && tree.name !== root) tree = tree.parent;
              if (tree) window.__galleryProfileTrees = tree;
            }
            const key = `${category} [${object.material?.name ?? ''}]`;
            const count = Math.min(group?.count ?? Infinity, geometry.index?.count ?? geometry.attributes.position.count);
            const triangles = count / 3 * (object.isInstancedMesh ? object.count : 1);
            const item = objects.get(key) ?? { key, root, calls: 0, triangles: 0 };
            item.calls++; item.triangles += triangles; objects.set(key, item);
            let detail = object;
            while (detail && detail.parent?.name !== 'Boutique interiors layer') detail = detail.parent;
            if (detail) {
              const entry = interiorGroups.get(detail) ?? { calls: 0, triangles: 0, generated: false };
              entry.calls++; entry.triangles += triangles;
              if (object.material?.name?.startsWith('generated-floor-')) entry.generated = true;
              interiorGroups.set(detail, entry);
            }
            return draw.call(this, camera, scene, geometry, material, object, group);
          };
          try { return original.call(this, renderer, ...args); }
          finally {
            if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push({ query, record }); }
            if (name === 'RenderPass') renderer.renderBufferDirect = draw;
            record.frames++; record.cpuMs += performance.now() - start;
            record.calls += renderer.info.render.calls - beforeCalls;
            record.triangles += renderer.info.render.triangles - beforeTriangles;
          }
        };
      }
      const times = [];
      let previous = null;
      while (frames < 120) {
        const now = await nextFrame();
        if (previous !== null) times.push(now - previous);
        previous = now; frames++;
      }
      for (const [prototype, original] of patches) prototype.render = original;
      patches.length = 0;
      for (let index = 0; index < 30 && queries.some(({ query }) => !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)); index++) await nextFrame();
      const disjoint = timer && gl.getParameter(timer.GPU_DISJOINT_EXT);
      for (const { query, record } of queries)
        if (!disjoint && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))
          record.gpuMs.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      const graphics = window.__riverRenderAudit.graphics();
      const roots = new Map();
      for (const item of objects.values()) {
        const root = roots.get(item.root) ?? { name: item.root, calls: 0, triangles: 0 };
        root.calls += item.calls; root.triangles += item.triangles; roots.set(item.root, root);
      }
      const generated = [...interiorGroups].filter(([, entry]) => entry.generated);
      if (generated.length) window.__galleryProfileDetails = generated.map(([group]) => group);
      return { frames, graphics, gpuTimer: Boolean(timer), disjoint,
        frameIntervalMs: { p50: percentile(times, .5), p95: percentile(times, .95) },
        passes: records.map(record => ({ name: record.name, frames: record.frames,
          cpuMs: record.cpuMs / record.frames, calls: record.calls / record.frames,
          triangles: record.triangles / record.frames, gpuSamples: record.gpuMs.length,
          gpuMs: record.gpuMs.length ? record.gpuMs.reduce((sum, value) => sum + value, 0) / record.gpuMs.length : null })),
        topObjects: [...objects.values()].sort((a, b) => b.triangles - a.triangles).slice(0, 30)
          .map(item => ({ ...item, calls: item.calls / records[0].frames, triangles: item.triangles / records[0].frames })),
        roots: [...roots.values()].sort((a, b) => b.triangles - a.triangles)
          .map(item => ({ ...item, calls: item.calls / records[0].frames, triangles: item.triangles / records[0].frames })),
        generatedDetail: generated.map(([, entry]) => ({ calls: entry.calls / records[0].frames,
          triangles: entry.triangles / records[0].frames })) };
    } finally {
      for (const [prototype, original] of patches) prototype.render = original;
      for (const { query } of queries) gl.deleteQuery(query);
    }
  });

  const street = [await sample(), await sample()];
  const streetCull = await page.evaluate(() => window.__riverExteriorCull());
  await page.screenshot({ path: 'output/playwright/gallery-render-street.png' });
  await page.locator('#enter-destination').click();
  await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside, null, { timeout: 10000 });
  if (await page.locator('.store-intro').isVisible()) await page.locator('.store-intro button').click();
  await page.waitForTimeout(1500);
  const interior = [await sample(), await sample()];
  const interiorCull = await page.evaluate(() => window.__riverExteriorCull());
  await page.screenshot({ path: 'output/playwright/gallery-render-inside.png' });
  if (interior.some(reading => reading.generatedDetail.length < 1))
    throw new Error(`Could not isolate generated detail: ${JSON.stringify(interior.map(reading => reading.generatedDetail))}`);
  await page.evaluate(() => { for (const group of window.__galleryProfileDetails) group.visible = false; });
  let hiddenDetail;
  try { hiddenDetail = await sample(); }
  finally { await page.evaluate(() => { for (const group of window.__galleryProfileDetails) group.visible = true; }); }
  let hiddenTrees = null, hiddenOutside = null, outside = [];
  if (!interiorCull.cull) {
    if (!(await page.evaluate(() => Boolean(window.__galleryProfileTrees)))) throw new Error('Could not isolate outdoor foliage');
    await page.evaluate(() => { window.__galleryProfileTrees.visible = false; });
    try { hiddenTrees = await sample(); }
    finally { await page.evaluate(() => { window.__galleryProfileTrees.visible = true; }); }
    outside = await page.evaluate(() => {
      const world = window.__galleryProfileTrees.parent;
      const entries = world.children.filter(child => child.name !== 'Boutique interiors layer')
        .map(child => [child, child.visible]);
      for (const [child] of entries) child.visible = false;
      window.__galleryProfileOutside = entries;
      return entries.map(([child]) => child.name || child.type);
    });
    try { hiddenOutside = await sample(); }
    finally { await page.evaluate(() => {
      for (const [child, visible] of window.__galleryProfileOutside) child.visible = visible;
      delete window.__galleryProfileOutside;
    }); }
  }
  if (!interiorCull.cull) throw new Error(`Opaque gallery view did not cull exterior: ${JSON.stringify(interiorCull)}`);
  await page.locator('#canvas-host').focus();
  await page.keyboard.down('ArrowLeft');
  try { await page.waitForFunction(() => !window.__riverExteriorCull().cull, null, { timeout: 5000 }); }
  finally { await page.keyboard.up('ArrowLeft'); }
  await page.waitForTimeout(300);
  const outward = await sample();
  const outwardCull = await page.evaluate(() => window.__riverExteriorCull());
  if (outwardCull.cull || outward.graphics.render.calls <= interior[0].graphics.render.calls)
    throw new Error(`Exterior did not return at the frontage: ${JSON.stringify(outwardCull)}`);
  await page.screenshot({ path: 'output/playwright/gallery-render-frontage.png' });
  for (let turn = 0; turn < 8; turn++) {
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(300);
    if (await page.evaluate(() => window.__riverExteriorCull().cull)) break;
  }
  const inwardAgain = await sample();
  const inwardAgainCull = await page.evaluate(() => window.__riverExteriorCull());
  if (!inwardAgainCull.cull || inwardAgain.graphics.render.calls >= outward.graphics.render.calls)
    throw new Error(`Exterior remained drawn after turning back into the room: ${JSON.stringify({ inwardAgainCull, inwardCalls: inwardAgain.graphics.render.calls, outwardCalls: outward.graphics.render.calls })}`);
  if (errors.length) throw new Error(errors.join('; '));
  return { passed: true, street, streetCull, interior, interiorCull, hiddenDetail, hiddenTrees, hiddenOutside, outside,
    outward, outwardCull, inwardAgain, inwardAgainCull,
    scope: 'Local Chromium, one fixture client, two 120-frame samples per player-height view at 1440x900 Sharpest, plus inside samples with generated detail, outdoor trees, and exterior world children hidden separately. CPU pass timings include driver submission and profiler overhead; street and interior cameras see different geometry. Hidden-layer comparisons change occlusion and are diagnostic only. No target-device acceptance.' };
}
