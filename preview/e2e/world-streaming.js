async page => {
  const { createHash } = await import('node:crypto');
  const { execFileSync } = await import('node:child_process');
  const { readFile } = await import('node:fs/promises');
  const sourceHashes = async () => {
    const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--',
      'preview/src', 'preview/public/data', 'server', 'shared', 'preview/e2e', 'preview/index.html', 'preview/vite.config.js', 'package.json', 'pnpm-lock.yaml'], { encoding: 'utf8' })
      .split('\0').filter(path => /\.(?:js|json|css|html|yaml|glsl)$/.test(path)).sort();
    return Object.fromEntries(await Promise.all(paths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
  };
  const sourceSha256 = await sourceHashes();
  const { collectRetainedHeap } = await import('./retained-heap.js');
  let finalSourceSha256 = null;
  const { loadDistrictData } = await import('../../server/district-data.js');
  const { createResidentNavigation } = await import('../src/navigation.js');
  const world = await loadDistrictData({ districtRevision: 'east-garden-commons-market-1' });
  const nav = createResidentNavigation(world, { allowRoads: true }), edge = world.eastGardenCommons.edge;
  const { createWalkingEnvironment } = await import('../src/walking.js');
  const { clearRouter } = await import('./route-clearance.js');
  // Resident routes can pass a corner closer than a walking player fits, and a walker
  // pressed into one stalls: detour legs to keep 0.3 m where they can (route-clearance.js).
  const clearRoute = clearRouter(createWalkingEnvironment(world), nav);
  const { mkdir, writeFile } = await import('node:fs/promises');
  const checkpointPath = `.runtime/world-streaming/journey-${new Date().toISOString().replaceAll(':', '-')}.json`;
  await mkdir('.runtime/world-streaming', { recursive: true });
  let outcome = 'running', failure = null;
  const origin = 'http://127.0.0.1:5173', checks = [], samples = [], errors = [], crossings = [], resourceViolations = [], reconnects = [], graphicsRecoveries = [], retainedHeaps = [];
  const checkpoint = () => writeFile(checkpointPath, JSON.stringify({ outcome, failure, sourceSha256, finalSourceSha256, checks, samples, crossings, resourceViolations, reconnects, graphicsRecoveries, retainedHeaps }, null, 2) + '\n');
  console.log(`Journey checkpoints: ${checkpointPath}`);
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); console.log(label); };
  const peerContext = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await peerContext.addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
  const peer = await peerContext.newPage();
  // A context restore makes three.js forget every GPU resource it registered and
  // count each again on its next draw, so the two bounded clients never lose
  // their context. A third client takes the load-failure and context-loss probes
  // and leaves before either bounded client connects.
  const probeContext = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await probeContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
  const probe = await probeContext.newPage();
  let probeOpen = true;
  const tabs = [page, peer];
  const self = tab => tab.evaluate(() => { const town = window.__riverMultiplayer(); return town.snapshot.players.find(p => p.id === town.selfId); });
  const point = tab => tab.evaluate(() => window.__riverCarriage().pose);
  let failLoads = true, failedRequests = 0, deferModule = true, pendingModuleRequested;
  const moduleRequested = new Promise(resolve => { pendingModuleRequested = resolve; }), pendingModules = [];
  await probe.route('**/src/east-garden-commons.js*', route => {
    if (failLoads) { failedRequests++; return route.abort('failed'); }
    if (deferModule) return new Promise(resolve => {
      pendingModules.push(async () => { await route.continue(); resolve(); }); pendingModuleRequested();
    });
    return route.continue();
  });
  const ready = async tab => {
    tab.setDefaultTimeout(120000); tab.on('pageerror', error => errors.push(error.message));
    // Read actual completed frames and reflection captures without adding a production hook.
    await tab.route(/\/src\/main\.js(?:\?.*)?$/, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nwindow.__streamGraphicsProbe = () => ({frames:renderedFrames,reflections:{...storefrontReflections?.stats}});' });
    });
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.addInitScript(edge => {
      window.__streamProbe = { sockets: [], received: 0, sent: 0, frames: [], crossings: [], notices: [], timeOrigin: performance.timeOrigin };
      // Preserve resource entries across the long journey; the default buffer
      // can otherwise hide later module requests behind initial asset traffic.
      performance.setResourceTimingBufferSize(10000);
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args) { super(...args); if (new URL(args[0], location.href).pathname === '/multiplayer') {
          window.__streamProbe.sockets.push(this);
          this.addEventListener('message', event => { window.__streamProbe.received += typeof event.data === 'string' ? new TextEncoder().encode(event.data).length : event.data.size ?? event.data.byteLength ?? 0; });
        } }
        send(data) { window.__streamProbe.sent += typeof data === 'string' ? new TextEncoder().encode(data).length : data.byteLength ?? 0; return super.send(data); }
      };
      let last, previous, lastNotice;
      const frame = time => {
        const notice = document.querySelector('.spatial-stream-status');
        const text = notice && !notice.hidden ? notice.textContent : '';
        if (text !== lastNotice) {
          window.__streamProbe.notices.push({ time, text }); lastNotice = text;
        }
        if (last) { const frames = window.__streamProbe.frames; frames.push(time - last); if (frames.length > 1000) frames.shift(); }
        const pose = window.__riverCarriage?.()?.pose, view = window.__riverTravelView?.();
        if (pose?.position && view?.camera) {
          if (previous && (pose.position[0] > edge) !== (previous.pose.position[0] > edge)) {
            const cameraStep = Math.hypot(...view.camera.map((v, i) => v - previous.view.camera[i]));
            const playerStep = Math.hypot(...pose.position.map((v, i) => v - previous.pose.position[i]));
            const directionDot = view.direction.reduce((sum, v, i) => sum + v * previous.view.direction[i], 0);
            window.__streamProbe.crossings.push({ cameraStep, playerStep, directionDot, deltaMs: time - last });
          }
          previous = { pose, view };
        }
        last = time; requestAnimationFrame(frame);
      }; requestAnimationFrame(frame);
    }, edge);
    await tab.goto(`${origin}/?motion-debug=1`);
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && window.__riverMultiplayer().snapshot?.districtRevision === 'east-garden-commons-market-1'
      && document.querySelector('#canvas-host')?.dataset.playerReady === 'true'
      && JSON.parse(document.querySelector('#viewport')?.dataset.assetProgress ?? '{}').done
      && window.__riverCarriage?.()?.pose?.position?.every(Number.isFinite));
    if (await tab.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await tab.locator('#panel-toggle').click();
    if (await tab.locator('.visit-tools').evaluate(node => node.open)) await tab.locator('.visit-tools-toggle').click();
  };
  const walk = async (tab, targets, label) => {
    for (const target of targets) {
      const deadline = Date.now() + 180000;
      for (;;) {
        const pose = await point(tab), dx = target[0] - pose.position[0], dz = -target[1] - pose.position[2], distance = Math.hypot(dx, dz);
        if (distance < .15) break;
        if (Date.now() > deadline) throw new Error(`${label} stalled: ${JSON.stringify({ target, pose, stream: await tab.evaluate(() => window.__riverSpatialStream()) })}`);
        const heading = Math.atan2(-dx, -dz), difference = Math.atan2(Math.sin(heading - pose.yaw), Math.cos(heading - pose.yaw));
        if (Math.abs(difference) > .035) {
          const box = await tab.locator('#canvas-host').boundingBox(), x = box.x + box.width * .5, y = box.y + box.height * .4;
          await tab.mouse.move(x, y); await tab.mouse.down(); await tab.mouse.move(x + Math.max(-box.width * .35, Math.min(box.width * .35, -difference / .003)), y, { steps: 3 }); await tab.mouse.up(); continue;
        }
        await tab.locator('#canvas-host').focus();
        const fast = distance > 2;
        if (fast) await tab.keyboard.down('ShiftLeft');
        await tab.keyboard.down('KeyW');
        await tab.waitForTimeout(Math.min(450, Math.max(30, distance * (fast ? 110 : 230))));
        await tab.keyboard.up('KeyW'); await tab.keyboard.up('ShiftLeft');
      }
    }
    const target = targets.at(-1);
    await tab.waitForFunction(target => { const town = window.__riverMultiplayer(), p = town.snapshot.players.find(p => p.id === town.selfId); return Math.hypot(p.position[0] - target[0], p.position[1] - target[1]) < .8; }, target);
    console.log(label);
  };
  const measure = async label => {
    const rows = await Promise.all(tabs.map(tab => tab.evaluate(() => {
      const probe = window.__streamProbe, stream = window.__riverSpatialStream(), frames = [...probe.frames].sort((a, b) => a - b);
      return { ...stream, time: performance.now(), heapBytes: performance.memory?.usedJSHeapSize ?? null,
        frameSamples: frames.length, frameMaxMs: frames.at(-1), frameP50: frames[Math.floor(frames.length * .5)], frameP95: frames[Math.floor(frames.length * .95)],
        receivedBytes: probe.received, sentBytes: probe.sent, socketCount: probe.sockets.length,
        viewport: [innerWidth, innerHeight, devicePixelRatio],
        quality: document.querySelector('#canvas-host')?.dataset.quality,
        pipeline: document.querySelector('#canvas-host')?.dataset.pipeline,
        notices: [...probe.notices],
        moduleLoads: performance.getEntriesByType('resource').filter(item => new URL(item.name).pathname.endsWith('/east-garden-commons.js'))
          .map(item => ({ startMs: item.startTime, durationMs: item.duration, transferBytes: item.transferSize, encodedBytes: item.encodedBodySize, decodedBytes: item.decodedBodySize })),
        resourceCount: performance.getEntriesByType('resource').length,
        transferBytes: performance.getEntriesByType('resource').reduce((sum, item) => sum + item.transferSize, 0),
        documentStable: probe.timeOrigin === performance.timeOrigin };
    })));
    samples.push({ label, clients: rows }); await checkpoint(); return rows;
  };
  const mutuallyVisible = async () => {
    const players = await Promise.all(tabs.map(self));
    for (let i = 0; i < 2; i++) await tabs[i].waitForFunction(expected => {
      const town = window.__riverMultiplayer(); return expected.every(p => {
        const seen = town.snapshot.players.find(other => other.id === p.id);
        const avatar = p.id === town.selfId ? null : town.remotes.find(other => other.id === p.id);
        return (p.id === town.selfId || avatar?.ready && avatar.appearance === p.appearance
          && Math.hypot(avatar.position[0] - p.position[0], -avatar.position[2] - p.position[1]) < .8) && seen && Math.hypot(seen.position[0] - p.position[0], seen.position[1] - p.position[1]) < .8;
      });
    }, players);
    return players;
  };
  const recoverGraphics = async (tab, label, resumePending = async () => {}) => {
    const before = { player: await self(tab), view: await tab.evaluate(() => window.__riverTravelView()), timeOrigin: await tab.evaluate(() => performance.timeOrigin) };
    const streamAtLoss = await tab.evaluate(() => window.__riverSpatialStream());
    await tab.evaluate(() => new Promise(resolve => {
      const canvas = document.querySelector('#canvas-host canvas');
      const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('WEBGL_lose_context unavailable');
      window.__streamGraphicsExtension = extension;
      canvas.addEventListener('webglcontextlost', () => queueMicrotask(resolve), { once: true });
      extension.loseContext();
    }));
    check(await tab.evaluate(() => ['lost', 'restoring'].includes(document.querySelector('#canvas-host').dataset.graphicsState)), `${label}: actual context loss pauses graphics recovery`);
    const paused = await tab.evaluate(() => window.__streamGraphicsProbe());
    check(Number.isFinite(paused.reflections.captures), `${label}: completed reflection capture counters are available`);
    await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    check((await tab.evaluate(() => window.__streamGraphicsProbe())).frames === paused.frames, `${label}: completed game frames stop while the context is lost`);
    await resumePending();
    await tab.evaluate(() => window.__streamGraphicsExtension.restoreContext());
    await tab.waitForFunction(frames => document.querySelector('#canvas-host').dataset.graphicsState === 'ok' && window.__streamGraphicsProbe().frames > frames, paused.frames);
    await tab.waitForFunction(captures => window.__streamGraphicsProbe().reflections.captures > captures, paused.reflections.captures);
    const after = { player: await self(tab), view: await tab.evaluate(() => window.__riverTravelView()), timeOrigin: await tab.evaluate(() => performance.timeOrigin) };
    const drift = Math.hypot(...after.player.position.map((v, i) => v - before.player.position[i]));
    const directionDot = before.view.direction.reduce((sum, v, i) => sum + v * after.view.direction[i], 0);
    check(after.timeOrigin === before.timeOrigin && after.player.id === before.player.id && after.player.appearance === before.player.appearance && drift < .8 && directionDot > .99,
      `${label}: restoration retains the document, identity, avatar, authority pose and camera direction`);
    graphicsRecoveries.push({ label, streamAtLoss: { pending: streamAtLoss.pending, residentBytes: streamAtLoss.residentBytes, chunks: streamAtLoss.chunks }, framesAtLoss: paused.frames,
      framesAfter: (await tab.evaluate(() => window.__streamGraphicsProbe())).frames, authoritativeDriftMetres: drift, directionDot });
    await checkpoint();
  };
  try {
    // The probe client goes first and alone: a fixture session lasts an hour from its
    // handshake, and the bounded clients need nearly all of it for their trips.
    await ready(probe);
    const gates = [[edge - 2, -1335], [edge - 2, -1336]];
    const approach = [[-2685, -1334], [-2685, -1335]];
    const far = [-2786, -1370];
    const commonsGroups = state => state.inventory.district.filter(item => item.name === 'East Garden Commons').length;
    const probePath = clearRoute((await self(probe)).position.slice(0, 2), approach[0]);
    check(Boolean(probePath?.length), 'The probe client has a collision-valid path to the promenade');
    await walk(probe, [...probePath, gates[0]], 'Probe client reaches gateway');
    await probe.locator('#canvas-host').focus(); await probe.keyboard.down('ShiftLeft'); await probe.keyboard.down('KeyW'); await probe.waitForTimeout(1500); await probe.keyboard.up('KeyW'); await probe.keyboard.up('ShiftLeft');
    check(failedRequests > 0 && (await self(probe)).position[0] < edge, 'Failed module load keeps player safely in District');
    await probe.screenshot({ path: 'output/playwright/world-streaming-load-recovery.png' });
    failLoads = false;
    let pendingTimer;
    try { await Promise.race([moduleRequested, new Promise((_, reject) => { pendingTimer = setTimeout(() => reject(new Error('Commons retry never reached the pending module response')), 45000); })]); }
    finally { clearTimeout(pendingTimer); }
    check((await probe.evaluate(() => window.__riverSpatialStream())).pending === 1, 'Commons import is pending before the graphics-loss probe');
    await recoverGraphics(probe, 'Pending Commons load', async () => {
      deferModule = false; await Promise.all(pendingModules.splice(0).map(release => release()));
    });
    await probe.waitForFunction(() => window.__riverSpatialStream().chunks[0].state === 'ready', null, { timeout: 45000 });
    check(true, 'Failed asset recovers automatically without reloading');
    await walk(probe, [[edge + 80, -1335]], 'Probe client reaches the Commons plaza');
    check((await probe.evaluate(() => window.__riverSpatialStream())).residentBytes > 0, 'Commons presentation is resident before the active graphics-loss probe');
    await recoverGraphics(probe, 'Active Commons presentation');
    // Streaming still works after a restore. Its GPU counts are not bounded: a
    // restored client registers resources again whenever it next draws them.
    await walk(probe, [[edge - 8, -1335], approach[0]], 'Probe client returns after the restore');
    await walk(probe, clearRoute((await self(probe)).position.slice(0, 2), far), 'Probe client walks away from the Commons');
    await probe.waitForFunction(() => window.__riverSpatialStream().residentBytes === 0);
    const probeEvicted = await probe.evaluate(() => window.__riverSpatialStream());
    check(probeEvicted.pending === 0 && probeEvicted.chunks[0].state === 'absent' && commonsGroups(probeEvicted) === 0, 'After a restore the Commons evicts with no pending loads or groups');
    await walk(probe, [...clearRoute((await self(probe)).position.slice(0, 2), approach[0]), gates[0]], 'Probe client returns to the gateway');
    await probe.waitForFunction(() => window.__riverSpatialStream().chunks[0].state === 'ready', null, { timeout: 45000 });
    await walk(probe, [[edge + 80, -1335]], 'Probe client crosses again after the restore');
    const probeReloaded = await probe.evaluate(() => window.__riverSpatialStream()), probeCrossings = await probe.evaluate(() => window.__streamProbe.crossings);
    check(probeReloaded.residentBytes > 0 && commonsGroups(probeReloaded) === 1 && probeCrossings.length >= 3
      && probeCrossings.every(row => row.directionDot > .9 && row.cameraStep < row.playerStep + 1.5), 'After a restore the Commons reloads as one group and every crossing keeps camera direction and continuous position');
    const probeId = (await self(probe)).id;
    await probe.goto('about:blank'); await probeContext.close(); probeOpen = false;
    await Promise.all(tabs.map(ready));
    // The server keeps a departed player for its 30 s grace before removing it.
    await Promise.all(tabs.map(tab => tab.waitForFunction(id => !window.__riverMultiplayer().snapshot.players.some(p => p.id === id)
      && !window.__riverMultiplayer().remotes.some(p => p.id === id), probeId, { timeout: 120000 })));
    check(true, 'The probe client has left before the bounded clients fix any baseline');
    const initial = await mutuallyVisible(); await measure('District arrival baseline');
    await page.screenshot({ path: 'output/playwright/world-streaming-district-baseline.png' });
    const paths = initial.map((player, i) => clearRoute(player.position.slice(0, 2), approach[i]));
    check(paths.every(path => path?.length), 'Both original arrivals have collision-valid paths to the promenade');
    await Promise.all(tabs.map((tab, i) => walk(tab, [...paths[i], gates[i]], `Player ${i} reaches gateway`)));
    await Promise.all(tabs.map(tab => tab.waitForFunction(() => window.__riverSpatialStream().chunks[0].state === 'ready', null, { timeout: 45000 })));
    const baseline = await measure('Loaded gateway baseline');
    // GPU counters register resources on first rendered use, not scene creation.
    // Traverse the entire return/eviction route twice before fixing comparable
    // loaded and evicted baselines. Keep twenty additional measured trips.
    const warmupTrips = 2, measuredTrips = 20, totalTrips = warmupTrips + measuredTrips;
    let loadedResourceBaseline, evictedResourceBaseline;
    const districtInventory = state => state.inventory.district.filter(item => item.name !== 'East Garden Commons');
    const withinBounds = (rows, reference) => rows.every((state, i) => state.objects <= reference[i].objects + 20
      && state.renderer.geometries <= reference[i].renderer.geometries + 20 && state.renderer.textures <= reference[i].renderer.textures + 10);
    // Each lap walks the same eviction and reload legs; settle them before anyone moves.
    for (let i = 0; i < tabs.length; i++) { clearRoute(approach[i], [far[0], far[1] - i]); clearRoute([far[0], far[1] - i], approach[i]); }
    for (let lap = 0; lap < totalTrips; lap++) {
      const outward = tabs.map((_, i) => [[edge + 80, -1335 - i]]);
      await Promise.all(tabs.map((tab, i) => walk(tab, outward[i], `Lap ${lap + 1} player ${i} outward`)));
      const arrived = await mutuallyVisible();
      check(arrived.every(p => p.position[0] > edge + 79), `Lap ${lap + 1}: both peers see Commons plaza occupancy`);
      for (let i = 0; i < tabs.length; i++) await tabs[i].waitForFunction(id => window.__riverMultiplayer().remotes.some(p => p.id === id && p.ready && p.onScreen), arrived[1 - i].id);
      check(true, `Lap ${lap + 1}: both remote avatars are rendered on screen`);
      if (lap === 0) {
        // A socket reconnect leaves the renderer alone, so it stays on a bounded client.
        await page.screenshot({ path: 'output/playwright/world-streaming-commons.png' });
        const before = await self(page), count = await page.evaluate(() => window.__streamProbe.sockets.length);
        const reconnectStarted = performance.now();
        await page.evaluate(() => window.__streamProbe.sockets.at(-1).close());
        await page.waitForFunction(count => window.__streamProbe.sockets.length > count && window.__riverMultiplayer().connected, count);
        const durationMs = performance.now() - reconnectStarted;
        const after = await self(page);
        reconnects.push({ client: 0, durationMs, driftMetres: Math.hypot(after.position[0] - before.position[0], after.position[1] - before.position[1]) });
        await checkpoint();
        check(after.id === before.id && after.appearance === before.appearance && Math.hypot(after.position[0] - before.position[0], after.position[1] - before.position[1]) < .8, 'Reconnect preserves identity, avatar and Commons position');
      }
      await Promise.all(tabs.map((tab, i) => walk(tab, [[edge - 8, -1335 - i]], `Lap ${lap + 1} player ${i} return`)));
      const returned = await mutuallyVisible();
      check(returned.every((p, i) => p.position[0] < edge && p.id === initial[i].id && p.appearance === initial[i].appearance), `Lap ${lap + 1}: identity, avatar and shared return positions preserved`);
      const row = await measure(`Round trip ${lap + 1}`);
      check(row.every(state => commonsGroups(state) === 1), `Lap ${lap + 1}: exactly one Commons presentation group per client`);
      const remotes = await Promise.all(tabs.map(tab => tab.evaluate(() => window.__riverMultiplayer().remotes.map(p => p.id))));
      check(remotes.every(ids => new Set(ids).size === ids.length), `Lap ${lap + 1}: no duplicate remote avatars`);
      crossings.push({ lap: lap + 1, arrived: arrived.map(p => p.position), returned: returned.map(p => p.position) });
      check(row.every((state, i) => state.documentStable && JSON.stringify(state.district) === JSON.stringify(baseline[i].district) && state.residentBytes === baseline[i].residentBytes && state.chunks.filter(chunk => chunk.state === 'ready').length === 1), `Lap ${lap + 1}: bounded owned resources and unchanged documents`);

      await Promise.all(tabs.map(async (tab, i) => {
        await walk(tab, [approach[i]], `Eviction ${lap + 1} player ${i} approach`);
        const path = clearRoute((await self(tab)).position.slice(0, 2), [far[0], far[1] - i]);
        check(Boolean(path?.length), `Eviction ${lap + 1} player ${i} has a walkable route`);
        await walk(tab, path, `Eviction ${lap + 1} player ${i}`);
      }));
      await Promise.all(tabs.map(tab => tab.waitForFunction(() => window.__riverSpatialStream().residentBytes === 0)));
      const unloaded = await measure(`Evicted ${lap + 1}`);
      check(unloaded.every(state => state.pending === 0 && state.chunks[0].state === 'absent' && commonsGroups(state) === 0), `Eviction ${lap + 1}: no pending loads, resident expansion buffers or Commons groups`);
      const districtPlayers = await mutuallyVisible();
      check(districtPlayers.every((p, i) => p.id === initial[i].id && p.appearance === initial[i].appearance && p.position[0] < edge - 110), `Lap ${lap + 1}: both players returned to District after full eviction`);
      check(row.every((state, i) => JSON.stringify(districtInventory(state)) === JSON.stringify(districtInventory(baseline[i])))
        && unloaded.every((state, i) => JSON.stringify(districtInventory(state)) === JSON.stringify(districtInventory(baseline[i]))), `Lap ${lap + 1}: resident District inventory is unchanged`);
      if (lap === warmupTrips - 1) {
        loadedResourceBaseline = row; evictedResourceBaseline = unloaded;
        check(true, 'Two full route warm-ups establish fixed loaded and evicted GPU baselines');
      }
      if (lap === warmupTrips - 1 || lap === totalTrips - 1) {
        // Same evicted District content and settling interval at both endpoints.
        // Rolling frame observations can include GC; they decide no timing gate.
        await Promise.all(tabs.map(tab => tab.waitForTimeout(500)));
        retainedHeaps.push({ lap: lap + 1, phase: lap === warmupTrips - 1 ? 'warmed' : 'after-twenty', method: 'HeapProfiler.collectGarbage then Runtime.getHeapUsage', clients: await Promise.all(tabs.map(collectRetainedHeap)) });
        await checkpoint();
      }
      const withinResourceBound = lap < warmupTrips || withinBounds(row, loadedResourceBaseline) && withinBounds(unloaded, evictedResourceBaseline);
      if (lap >= warmupTrips && withinResourceBound) check(true, `Measured trip ${lap - warmupTrips + 1}: loaded and evicted scene/GPU counts remain bounded`);
      else if (!withinResourceBound) {
        // Preserve the unchanged acceptance bound, but collect the entire
        // trajectory before failing so growth can be attributed and measured.
        const violation = { lap: lap + 1, clients: row.map((state, i) => ({ baseline: { objects: loadedResourceBaseline[i].objects, renderer: loadedResourceBaseline[i].renderer }, actual: { objects: state.objects, renderer: state.renderer }, evictedBaseline: { objects: evictedResourceBaseline[i].objects, renderer: evictedResourceBaseline[i].renderer }, evicted: { objects: unloaded[i].objects, renderer: unloaded[i].renderer } })) };
        resourceViolations.push(violation); console.log(`Resource bound exceeded: ${JSON.stringify(violation)}`); await checkpoint();
      }
      if (lap < totalTrips - 1) {
        await Promise.all(tabs.map(async (tab, i) => walk(tab, [...clearRoute((await self(tab)).position.slice(0, 2), approach[i]), gates[i]], `Reload ${lap + 1} player ${i}`)));
        await Promise.all(tabs.map(tab => tab.waitForFunction(() => window.__riverSpatialStream().chunks[0].state === 'ready')));
      }
    }
    // A client without the Commons loaded must still list a peer standing there:
    // readiness gates only that client's own steps, never shared occupancy.
    check((await measure('Before split occupancy'))[0].residentBytes === 0, 'Observer has the Commons unloaded before the peer crosses');
    await walk(peer, [...clearRoute((await self(peer)).position.slice(0, 2), approach[1]), gates[1], [edge + 80, -1336]], 'Peer alone reaches the Commons plaza');
    const alone = await self(peer), observer = await measure('Split occupancy');
    check(observer[0].residentBytes === 0 && alone.position[0] > edge + 79, 'Observer stays unloaded while the peer occupies the Commons');
    await page.waitForFunction(id => document.querySelector(`.world-map-peer[data-peer-id="${id}"]`), alone.id, { timeout: 15000 });
    check(true, 'World map lists a peer on the Commons while the observer has it unloaded');
    await walk(peer, [[edge - 8, -1336]], 'Peer returns to the District');
    const final = await measure('Final return');
    check(final.every((state, i) => state.socketCount === baseline[i].socketCount + (i === 0 ? 1 : 0)), 'Repeated travel creates no extra multiplayer connections');
    await page.screenshot({ path: 'output/playwright/world-streaming-return.png' });
    const continuity = await Promise.all(tabs.map(tab => tab.evaluate(() => window.__streamProbe.crossings)));
    check(continuity.every(rows => rows.length >= totalTrips * 2 && rows.every(row => row.directionDot > .9 && row.cameraStep < row.playerStep + 1.5)), 'All warm-up and measured crossings preserve camera direction and continuous position');
    check(errors.length === 0, `No page errors: ${errors.join('; ')}`);
    check(resourceViolations.length === 0, `Scene and GPU object bounds across twenty measured trips after two recorded warm-ups: ${JSON.stringify(resourceViolations)}`);
    const heapRatios = retainedHeaps[1].clients.map((usage, i) => usage.usedSize / retainedHeaps[0].clients[i].usedSize);
    check(heapRatios.every(ratio => ratio <= 1.10), `Post-GC retained JavaScript heap after twenty measured trips stays within 1.10 times warmed baseline: ${JSON.stringify(heapRatios)}`);
    finalSourceSha256 = await sourceHashes();
    check(JSON.stringify(finalSourceSha256) === JSON.stringify(sourceSha256), 'Runtime and harness source hashes stay unchanged throughout the journey');
    outcome = 'passed';
    return { sourceSha256, finalSourceSha256, checks, samples, crossings, continuity, reconnects, graphicsRecoveries, retainedHeaps, heapRatios, failedRequests, scope: 'Two bounded Chromium fixture clients that never lose their context, after a third fixture client takes a failed Commons import, actual context loss/restore during pending Commons import and active presentation, and one eviction/reload cycle after the restore, then leaves; one bounded client reconnects; two recorded route warm-ups followed by 20 measured full keyboard round trips to the Commons plaza with chunk eviction on every District return; real loopback authority. Runtime.getHeapUsage usedSize is isolate-wide JavaScript heap measured at equivalent post-GC evicted states; backing storage and embedder heap are separate counters, not included in this ratio. Rolling frame observations can include GC and decide no timing gate. Buffer bytes are exact geometry storage, not total GPU memory. No physical-device, hosted or human accessibility acceptance.' };
  } catch (error) { outcome = 'failed'; failure = error.message; throw error; }
  finally {
    deferModule = false;
    await Promise.allSettled(pendingModules.splice(0).map(release => release()));
    await checkpoint(); await peerContext.close();
    if (probeOpen) await probeContext.close();
  }
}
