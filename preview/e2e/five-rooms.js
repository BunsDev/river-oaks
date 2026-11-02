// Five Rooms and a Ribbon, QA journey (#842, #825 M1). Independent evidence on an integrated head
// that the foundation is what #825 asked for: startup with no flag lands in pink-jet-age (#837),
// `?finish=classic` still works, blocked storage cannot abort startup, the Ribbon (#828) and the
// five shells (#839/#841) are reported by the page, the whole Ribbon is walkable end to end and
// each venue entrance can be stood at on drawn ground, graphics tiers apply, the spawn frame stays
// within the pinned draw-call budget (five-rooms-budget.json, measured, never assumed), and two
// world reloads leave the renderer's geometry and texture counts steady (teardown).
//
// The walk and the stops come from the Spatial contract (config/ribbon/five-rooms.json, #838) via
// five-rooms-plan.mjs; a head without the contract fails here and says so rather than guessing.
// Each failing check names the sub-issue that owns the behaviour. The receipt is compact: counts,
// positions and names, no digests (data/reports/five-rooms-experience.json via
// RIVER_OAKS_E2E_REPORT). Run: RIVER_OAKS_E2E_REPORT=five-rooms-experience.json pnpm run test:experience five-rooms
async page => {
  const { pathToFileURL } = await import('node:url');
  const { readFile } = await import('node:fs/promises');
  const { loadavg } = await import('node:os');
  const { BUDGET_PATH, assertCompact, spawnCamera, judgeBudget, readContract, ribbonTraversal, scenePose, validateBudgetPin } = await import('./five-rooms-plan.mjs');
  const { DEFAULT_FINISH } = await import('../src/render-quality.js');
  const { loadDistrictData } = await import('../../server/district-data.js');
  const { createResidentNavigation } = await import('../src/navigation.js');
  const { createWalkingEnvironment } = await import('../src/walking.js');
  const { groundSurfaceHeight } = await import('../src/world-surface.js');
  const { clearRouter } = await import('./route-clearance.js');
  const { openHudSpace } = await import('./hud-navigation.js');
  const origin = 'http://127.0.0.1:5173', root = pathToFileURL(`${process.cwd()}/`);
  const checks = [], errors = [], detours = [], altitudes = [], started = Date.now();
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); console.log(label); };
  const round = (value, places = 2) => (Number.isFinite(value) ? Math.round(value * 10 ** places) / 10 ** places : null);
  page.on('pageerror', error => errors.push(error.message));

  // The contract and the world the fixture serves (the same data the page draws), for routing and ground.
  const { contract, reason } = await readContract(root);
  check(contract, `Spatial contract readable (#838): ${reason}`);
  const world = await loadDistrictData({ districtRevision: process.env.RIVER_OAKS_DISTRICT_REVISION || undefined });
  const nav = createResidentNavigation(world, { allowRoads: true }), clearRoute = clearRouter(createWalkingEnvironment(world), nav);
  const ground = (east, north) => groundSurfaceHeight(world, east, -north);
  const { spine, stops } = ribbonTraversal(contract), arrival = spawnCamera(world, ground);

  const ready = tab => tab.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverRenderAudit && window.__riverMultiplayer?.().connected
    && window.__riverCarriage?.()?.pose?.position?.every(Number.isFinite), null, { timeout: 180000 });
  const stream = tab => tab.evaluate(() => { const s = window.__riverSpatialStream(); return { finish: s.finish, renderer: s.renderer, inventory: s.inventory.district.map(({ name, objects, meshes, geometries, textures }) => ({ name, objects, meshes, geometries, textures })) }; });
  const compactFinish = finish => JSON.parse(JSON.stringify(finish, (key, value) => (Array.isArray(value) && value.length > 40 ? `${value.length} items` : value)));
  // Draw calls and triangles over 30 frames at the arrival camera, after 20 settling frames; the audit pose, not the walk camera, so the journey and five-rooms-cameras.mjs measure the same frame.
  const spawnFrame = async tab => {
    await tab.evaluate(pose => window.__riverRenderAudit.view(pose), scenePose(arrival));
    const result = await tab.evaluate(async () => {
      for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
      const calls = [], triangles = [];
      for (let i = 0; i < 30; i++) { await new Promise(requestAnimationFrame); const render = window.__riverRenderAudit.graphics().render; calls.push(render.calls); triangles.push(render.triangles); }
      const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
      return { calls: median(calls), triangles: median(triangles), quality: JSON.parse(document.querySelector('#canvas-host').dataset.quality || '{}').mode ?? null, buffer: window.__riverRenderAudit.graphics().buffer };
    });
    await tab.evaluate(() => window.__riverRenderAudit.release());
    return result;
  };
  const pinGraphics = async (tab, mode) => {
    await openHudSpace(tab, 'settings-section', 'Graphics'); await tab.locator(`[data-quality=${mode}]`).click();
    await tab.waitForFunction(mode => JSON.parse(document.querySelector('#canvas-host').dataset.quality || '{}').mode === mode, mode);
    await tab.keyboard.press('Escape'); await tab.waitForFunction(() => !document.querySelector('#settings-dialog')?.open);
  };
  const openWith = async (path, init = null) => {
    const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies([{ name: 'fixture_session', value: 'owner', url: origin }]);
    if (init) await context.addInitScript(init);
    const tab = await context.newPage(), tabErrors = [];
    tab.on('pageerror', error => tabErrors.push(error.message));
    tab.setDefaultTimeout(180000);
    await tab.goto(`${origin}${path}`);
    await ready(tab);
    return { context, tab, tabErrors };
  };

  // 1. Startup with no flag (#837): the page's own finish readout, the Ribbon (#828) and the five rooms (#841).
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${origin}/?motion-debug=1&render-audit=1`);
  await ready(page);
  const noFlag = await stream(page);
  check(DEFAULT_FINISH === 'pink-jet-age', `render-quality.js DEFAULT_FINISH is pink-jet-age on this head (#837): ${DEFAULT_FINISH}`);
  check(noFlag.finish.preference === 'pink-jet-age', `No-flag startup draws pink-jet-age (#837): ${noFlag.finish.preference}`);
  check(noFlag.finish.ribbon && !noFlag.finish.ribbon.refused && noFlag.finish.ribbon.stats?.modules > 0, `The Ribbon is built and not refused (#828/#835): ${JSON.stringify(noFlag.finish.ribbon)}`);
  check(noFlag.finish.fiveRooms && typeof noFlag.finish.fiveRooms === 'object', `finish.fiveRooms is reported by the page (#841): ${JSON.stringify(noFlag.finish.fiveRooms ?? null)}`);
  const fiveRooms = compactFinish(noFlag.finish.fiveRooms);
  check(!fiveRooms.refused, `The five rooms are built and not refused (#839/#841): ${JSON.stringify(fiveRooms)}`);

  // 2. Graphics tiers and the spawn frame: sharp is the budget frame; smooth must also apply.
  await pinGraphics(page, 'sharp');
  const spawn = { pink: await spawnFrame(page) };
  check(spawn.pink.quality === 'sharp', `Sharp graphics applied for the budget frame: ${spawn.pink.quality}`);
  await pinGraphics(page, 'smooth');
  spawn.pinkSmooth = await spawnFrame(page);
  check(spawn.pinkSmooth.quality === 'smooth' && spawn.pinkSmooth.buffer[0] < spawn.pink.buffer[0], `Smooth graphics renders fewer pixels than sharp: ${spawn.pinkSmooth.buffer} vs ${spawn.pink.buffer}`);
  await pinGraphics(page, 'sharp');

  // 3. Classic as the comparison override, measured at the same frame for the budget delta.
  const classic = await openWith('/?finish=classic&motion-debug=1&render-audit=1');
  const classicStream = await stream(classic.tab);
  check(classicStream.finish.preference === 'classic', `?finish=classic overrides the default (#837): ${classicStream.finish.preference}`);
  await pinGraphics(classic.tab, 'sharp');
  spawn.classic = await spawnFrame(classic.tab);
  const classicRibbon = classicStream.finish.ribbon ?? null, classicFiveRooms = compactFinish(classicStream.finish.fiveRooms ?? null);
  check(classic.tabErrors.length === 0, `Classic page has no errors: ${classic.tabErrors.slice(0, 3).join(' | ')}`);
  await classic.context.close();

  // 4. Blocked storage: a localStorage getter that throws (private mode, a policy) must not abort startup or change the default.
  const blocked = await openWith('/?motion-debug=1&render-audit=1', () => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }));
  const blockedStream = await stream(blocked.tab);
  check(blockedStream.finish.preference === 'pink-jet-age', `Blocked storage still starts in pink-jet-age (#837): ${blockedStream.finish.preference}`);
  check(blocked.tabErrors.length === 0, `Blocked storage page has no errors: ${blocked.tabErrors.slice(0, 3).join(' | ')}`);
  await blocked.context.close();

  // 5. The pinned budget (#842): compared only against a pin that measured this frame, preset and viewport.
  let budget = { pinned: false, measured: { classic: spawn.classic.calls, pink: spawn.pink.calls }, delta: spawn.pink.calls - spawn.classic.calls };
  const pinText = await readFile(BUDGET_PATH, 'utf8').catch(error => (error.code === 'ENOENT' ? null : Promise.reject(error)));
  if (pinText) {
    const pin = validateBudgetPin(JSON.parse(pinText));
    check(pin.camera === arrival.id && pin.graphics === 'sharp' && pin.viewport[0] === spawn.pink.buffer[0] && pin.viewport[1] === spawn.pink.buffer[1], `The budget pin measured this frame (${arrival.id}, sharp, ${spawn.pink.buffer}): ${JSON.stringify({ camera: pin.camera, graphics: pin.graphics, viewport: pin.viewport })}`);
    const judged = judgeBudget(pin, spawn.pink.calls);
    budget = { pinned: true, pinHead: pin.head, baseline: pin.baseline, ...judged, measured: budget.measured };
    check(judged.within, `Pink spawn frame within the pinned draw-call budget: ${judged.measuredCalls} <= ${judged.budgetCalls} (classic baseline ${pin.baseline.classicCalls}, delta ${judged.delta})`);
  } else checks.push(`No budget pin at ${BUDGET_PATH} yet; spawn frame measured ${spawn.pink.calls} (pink) / ${spawn.classic.calls} (classic) draw calls for pinning`);

  // 6. Walk the Ribbon end to end and stand at each entrance, on authoritative ground.
  const point = () => page.evaluate(() => window.__riverCarriage().pose);
  const self = () => page.evaluate(() => { const m = window.__riverMultiplayer(); return m.snapshot?.players.find(p => p.id === m.selfId) ?? null; });
  const travel = async ([east, north]) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const result = await page.evaluate(position => window.__riverMultiplayerCommand({ type: 'travel', position }), [east, north]);
      if (result?.ok) break;
      if (result?.error !== 'travel_cooldown') throw new Error(`travel refused ${JSON.stringify(result)}`);
      await page.waitForTimeout(1100);
    }
    await page.waitForFunction(([east, north]) => { const p = window.__riverCarriage().pose.position; return Math.hypot(p[0] - east, -p[2] - north) < 2.5; }, [east, north], { timeout: 30000 });
  };
  const turnBy = async difference => {
    const box = await page.locator('#canvas-host').boundingBox(), x = box.x + box.width * .5, y = box.y + box.height * .4;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + Math.max(-box.width * .35, Math.min(box.width * .35, -difference / .003)), y, { steps: 3 }); await page.mouse.up();
  };
  const headingTo = (pose, target) => { const dx = target[0] - pose.position[0], dz = -target[1] - pose.position[2], heading = Math.atan2(-dx, -dz); return { distance: Math.hypot(dx, dz), difference: Math.atan2(Math.sin(heading - pose.yaw), Math.cos(heading - pose.yaw)) }; };
  const face = async target => { for (let i = 0; i < 12; i++) { const { difference } = headingTo(await point(), target); if (Math.abs(difference) < .05) return; await turnBy(difference); } };
  // The server holds where the page stopped (the page's HUD position against its own snapshot).
  const settled = label => page.waitForFunction(() => {
    const m = window.__riverMultiplayer(), me = m.snapshot?.players.find(p => p.id === m.selfId), hud = document.querySelector('#walking-hud')?.dataset.position;
    if (!me || !hud || window.__riverCarriage().pose.speed > 0.01) return false;
    const [x, , z] = JSON.parse(hud); return Math.hypot(me.position[0] - x, me.position[1] + z) < 0.05;
  }, null, { timeout: 15000 }).catch(async () => { throw new Error(`${label}: the server never held the walk's end ${JSON.stringify({ page: (await point()).position, server: (await self())?.position })}`); });
  const unwedge = async attempt => {
    await page.locator('#canvas-host').focus();
    await page.keyboard.down('KeyS'); await page.waitForTimeout(600); await page.keyboard.up('KeyS');
    const side = attempt % 2 ? 'KeyA' : 'KeyD'; await page.keyboard.down(side); await page.waitForTimeout(400 + 200 * Math.floor(attempt / 2)); await page.keyboard.up(side);
  };
  // Keyboard walking with turn-by-drag; when a target stops getting closer, re-route from where the player is (route-clearance.js), else back away and sidestep.
  const walk = async (targets, label, depth = 0) => {
    for (const target of targets) {
      const deadline = Date.now() + 120000;
      let best = Infinity, improvedAt = Date.now(), recoveries = 0;
      for (;;) {
        const pose = await point(), { distance, difference } = headingTo(pose, target);
        if (distance < .2) break;
        if (Date.now() > deadline) throw new Error(`${label} stalled (#841 ground/collision): ${JSON.stringify({ target, position: pose.position.map(v => round(v)) })}`);
        if (distance < best - .25) { best = distance; improvedAt = Date.now(); }
        else if (depth < 2 && recoveries < 6 && Date.now() - improvedAt > 10000) {
          const here = [pose.position[0], -pose.position[2]], detour = clearRoute(here, target);
          detours.push({ label, target: target.map(v => round(v)), from: here.map(v => round(v)), route: detour?.length ?? 0 });
          if (detour?.length) await walk(detour, `${label} detour`, depth + 1); else await unwedge(recoveries);
          recoveries += 1; best = Infinity; improvedAt = Date.now(); continue;
        }
        if (Math.abs(difference) > .035) { await turnBy(difference); continue; }
        await page.locator('#canvas-host').focus();
        const fast = distance > 6; if (fast) await page.keyboard.down('ShiftLeft');
        await page.keyboard.down('KeyW'); await page.waitForTimeout(Math.min(300, Math.max(30, distance * (fast ? 110 : 230)))); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
        if (altitudes.length < 400) altitudes.push(round(pose.position[1] - ground(pose.position[0], -pose.position[2]), 2));
      }
    }
    await settled(label);
  };
  const walkStarted = Date.now();
  await travel(spine[0]);
  await walk(spine, 'Ribbon spine');
  const spineMetres = spine.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - spine[i][0], p[1] - spine[i][1]), 0);
  check(true, `Walked the Ribbon spine end to end: ${round(spineMetres, 1)} m in ${round((Date.now() - walkStarted) / 1000, 1)} s with ${detours.length} detours`);
  const venues = [];
  for (const stop of stops) {
    const label = `${stop.label} entrance`;
    await travel(stop.approach[0]);
    await walk(stop.approach, label);
    await face(stop.face);
    const me = await self(), pose = await point(), box = await page.locator('#canvas-host').boundingBox();
    const distance = Math.hypot(me.position[0] - stop.stand[0], me.position[1] - stop.stand[1]);
    check(distance < 0.8, `${label}: the server holds the player at the stop (${round(distance)} m off)`);
    const probe = await page.evaluate(([east, north]) => window.__riverRenderAudit.groundProbe([east, north], { radius: 0, step: 1, hits: 2 })[0].hits.map(hit => ({ object: hit.object, path: hit.path, altitude: hit.at[1] })), stop.stand);
    const under = probe[0] ?? null, drop = under ? pose.position[1] - under.altitude : null;
    check(under && drop !== null && drop > -0.3 && drop < 2.2, `${label}: stands on drawn ground (#840/#841): ${JSON.stringify({ under, drop: round(drop) })}`);
    const seen = await page.evaluate(([x, y]) => window.__riverRenderAudit.pick(x, y, 2).map(hit => ({ object: hit.object, path: hit.path, distance: hit.distance })), [box.x + box.width / 2, box.y + box.height / 2]);
    check(seen.length > 0 && seen[0].distance < 40, `${label}: looking in meets the shell within 40 m (#839): ${JSON.stringify(seen[0] ?? null)}`);
    venues.push({ venue: stop.venue, entrance: stop.entrance, link: stop.link, segment: stop.segment, segmentStatus: stop.status, stand: stop.stand.map(v => round(v)), offMetres: round(distance), under, drop: round(drop), sees: seen[0] });
  }
  const groundRange = altitudes.length ? [Math.min(...altitudes), Math.max(...altitudes)] : null;
  check(groundRange && groundRange[0] > -0.3 && groundRange[1] < 2.2, `Along the walk the player kept to the walking surface (altitude over ground ${JSON.stringify(groundRange)} m, ${altitudes.length} samples)`);

  // 7. Teardown: two world reloads in one renderer leave geometry and texture counts steady.
  const inventoryOf = state => state.inventory.filter(item => /ribbon|five|venue|counter|atelier|starlight|shade|studio|overlook/i.test(item.name));
  const before = await stream(page), reloads = [];
  for (let i = 0; i < 2; i++) {
    await page.locator('#reload').click();
    await page.locator('#loading').waitFor({ state: 'hidden', timeout: 180000 });
    await ready(page);
    await page.waitForTimeout(3000);
    reloads.push(await stream(page));
  }
  const [first, second] = reloads;
  check(second.renderer.geometries <= first.renderer.geometries + 20 && second.renderer.textures <= first.renderer.textures + 10,
    `Two reloads leave renderer counts steady (teardown disposes the foundation, #841): ${JSON.stringify({ before: before.renderer, first: first.renderer, second: second.renderer })}`);
  check(JSON.stringify(inventoryOf(second).map(item => item.name)) === JSON.stringify(inventoryOf(before).map(item => item.name)), `The Five Rooms and Ribbon groups return after reload: ${inventoryOf(second).map(item => item.name).join(', ')}`);
  check(errors.length === 0, `No page errors: ${errors.slice(0, 3).join(' | ')}`);

  return assertCompact({ passed: true, checks, contractVersion: contract.version, defaultFinish: DEFAULT_FINISH,
    finish: { noFlag: compactFinish(noFlag.finish), classic: { preference: classicStream.finish.preference, ribbon: classicRibbon && { id: classicRibbon.id, modules: classicRibbon.stats?.modules ?? null }, fiveRooms: classicFiveRooms }, blocked: blockedStream.finish.preference },
    spawn: { camera: arrival.id, viewport: spawn.pink.buffer, pink: { calls: spawn.pink.calls, triangles: spawn.pink.triangles }, pinkSmooth: { calls: spawn.pinkSmooth.calls, buffer: spawn.pinkSmooth.buffer }, classic: { calls: spawn.classic.calls, triangles: spawn.classic.triangles } },
    budget, walk: { spineMetres: round(spineMetres, 1), seconds: round((Date.now() - walkStarted) / 1000, 1), detours, groundRange, samples: altitudes.length }, venues,
    teardown: { before: before.renderer, afterReloads: reloads.map(state => state.renderer), foundationGroups: inventoryOf(before) },
    hostLoad: loadavg().map(n => round(n, 1)), seconds: round((Date.now() - started) / 1000, 1),
    scope: 'Local Chromium on the loopback fixture at 1280x800; frame counts are this host, not a device budget. Captures and the night pink-rule review are five-rooms-cameras.mjs. Not a human visual or accessibility review.' });
}
