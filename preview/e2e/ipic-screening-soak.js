async (host, viewer, tools) => {
  // IPIC screening soak (#368, returned to #367): alice hosts the 30 s fixture and stays in
  // IPIC; bob enters and leaves IPIC once to warm up, then ten more times. Every cycle measures
  // the late join from the two video elements' own currentTime, and every exit is followed by a
  // forced GC and real counters: CDP DOM nodes and JS event listeners, renderer textures and
  // geometries, tracked media elements (loaded, playing), open AudioContexts, live intervals and
  // pending timeouts. A late play() after exit is caught by counting play() calls. Then the
  // panel is reviewed at 390 and 320 px with the software-rendering banner and the play dock on
  // screen. Software rendering, one machine; not a visual, device or human acceptance.
  const { openHudSpace } = await import('./hud-navigation.js');
  const IPIC = 'osm-node-8172494964', CYCLES = tools.cycles ?? 10;
  const checks = [], errors = [], cycles = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  for (const page of [host, viewer]) page.on('pageerror', error => errors.push(error.message));
  const inside = page => page.evaluate(() => document.querySelector('#walking-hud')?.dataset.inside ?? null);
  // Setup, not a screening assertion: the district data has a 20 s fetch deadline, which a loaded
  // machine can miss. The page's own Reload is used once, and every use is recorded.
  const reloads = [];
  async function load(page, name) {
    await page.goto('http://127.0.0.1:5173/?motion-debug=1&render-audit=1', { waitUntil: 'commit' });
    for (let attempt = 0; ; attempt++) {
      const state = await page.waitForFunction(() => {
        if (document.querySelector('#loading')?.classList.contains('error')) return 'error';
        return window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true'
          && document.querySelectorAll('#destination option').length > 1 && 'ready';
      }, null, { timeout: 300000 }).then(handle => handle.jsonValue()); // a loaded machine can take minutes
      if (state === 'ready') return;
      const detail = await page.locator('#loading').textContent();
      if (attempt > 0) throw new Error(`${name}: the district failed to load twice: ${detail}`);
      reloads.push({ page: name, detail: detail.trim().slice(0, 160) });
      await page.locator('#reload').evaluate(button => button.click()); // the panel footer's Reload world data
    }
  }
  async function closeMap(page) { if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click(); }
  async function travel(page, label) {
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label });
    await page.locator('#enter-destination').click();
  }
  async function enterIpic(page) {
    await travel(page, 'IPIC Theaters');
    await page.waitForFunction(id => document.querySelector('#walking-hud')?.dataset.inside === id, IPIC);
    await closeMap(page);
    await page.waitForFunction(() => window.__riverScreening?.()?.active === true);
  }
  // Leave the way a visitor does: Step outside (F) to the street in front of IPIC. Travelling into
  // another interior instead would load a second building on every cycle. The town refuses
  // travel within 1 s of the last, so a refused press is retried.
  async function leaveIpic(page) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyF');
      if (await page.waitForFunction(id => document.querySelector('#walking-hud')?.dataset.inside !== id, IPIC, { timeout: 5000 }).then(() => true, () => false)) break;
      await page.waitForTimeout(1200);
    }
    await page.waitForFunction(id => document.querySelector('#walking-hud')?.dataset.inside !== id, IPIC, { timeout: 5000 });
    await page.waitForFunction(() => window.__riverScreening()?.active === false && !document.querySelector('#ipic-screening video'));
  }
  const screening = page => page.evaluate(() => ({ at: performance.timeOrigin + performance.now(), ...window.__riverScreening() }));
  async function spread() {
    const [a, b] = await Promise.all([screening(host), screening(viewer)]);
    const project = sample => sample.currentTime * 1000 + (sample.paused ? 0 : Date.now() - sample.at);
    return { spreadMs: Math.abs(project(a) - project(b)), host: a, viewer: b };
  }
  async function counters(page) {
    await tools.gc(page);
    const dom = await tools.dom(page);
    const own = await page.evaluate(() => ({ ...window.__soak.counters(), screeningVideos: document.querySelectorAll('#ipic-screening video').length, memory: window.__riverRenderAudit?.graphics().memory ?? null }));
    return { nodes: dom.nodes, listeners: dom.jsEventListeners, documents: dom.documents, textures: own.memory?.textures ?? null, geometries: own.memory?.geometries ?? null,
      screeningVideos: own.screeningVideos, mediaTracked: own.mediaTracked, mediaInDom: own.mediaInDom, mediaLoaded: own.mediaLoaded, mediaPlaying: own.mediaPlaying, audioContexts: own.audioContexts,
      intervals: own.intervals, timeouts: own.timeouts, playCalls: own.playCalls };
  }
  // The fixture lasts 30 s. Before each entry the host restarts it unless enough remains for the
  // last measured trip in plus 20 s (the 5 s convergence window, the attach and the counters), so
  // the late join meets a film that is still running; when that is more than the fixture holds,
  // the host restarts it just before the trip. Restarts are host actions, never the viewer's.
  const hostControl = async name => { await host.locator(`#ipic-screening [data-control="${name}"]`).click(); };
  let lastTripS = 15; // the first trip in loads the IPIC interior
  async function ensureRunning(minRemainingS = 18) {
    const s = await screening(host);
    if (s.sharedStatus === 'playing' && 30 - s.currentTime >= minRemainingS) return false;
    if (!['stopped', 'ended'].includes(s.sharedStatus)) { await hostControl('host-stop'); await host.waitForFunction(() => window.__riverScreening().sharedStatus === 'stopped'); }
    await hostControl('host-start');
    await host.waitForFunction(() => window.__riverScreening().state === 'playing' && window.__riverScreening().currentTime > 0.3, null, { timeout: 30000 });
    return true;
  }

  await load(host, 'host'); await load(viewer, 'viewer');
  await enterIpic(host);
  await host.waitForFunction(() => !document.querySelector('#ipic-screening [data-control="host-start"]')?.hidden);
  await ensureRunning();
  checks.push('host started the 30 s fixture inside IPIC');

  async function cycle(index) {
    const restarted = await ensureRunning(Math.min(29.5, lastTripS + 20));
    const started = Date.now();
    await enterIpic(viewer);
    const entryMs = Date.now() - started; lastTripS = entryMs / 1000;
    // On a loaded machine the trip in can outlast the 30 s fixture. Then the host starts it again
    // and this cycle is recorded as an in-room start rather than a late join.
    const lateJoin = (await screening(host)).sharedStatus === 'playing';
    if (!lateJoin) await ensureRunning();
    const before = await screening(host);
    await viewer.waitForFunction(() => window.__riverScreening().state === 'playing', null, { timeout: 60000 })
      .catch(async error => { throw new Error(`${error.message}: cycle ${index} viewer ${JSON.stringify(await screening(viewer))}, host ${JSON.stringify(await screening(host))}`); });
    const joined = Date.now(), late = await screening(viewer);
    check(late.epoch === before.epoch, `cycle ${index}: the viewer joined the host's epoch ${before.epoch}, got ${late.epoch}`);
    let converged = null, worst = 0;
    while (Date.now() - joined < 5000) {
      const sample = await spread();
      if (sample.spreadMs < 500 && converged === null) converged = Date.now() - joined;
      if (converged !== null) worst = Math.max(worst, sample.spreadMs);
      await viewer.waitForTimeout(250);
    }
    check(converged !== null && converged <= 5000, `cycle ${index}: viewers within 500 ms in ${converged} ms`);
    check(worst < 500, `cycle ${index}: stayed within 500 ms after converging (worst ${Math.round(worst)} ms)`);
    // Sampled after the convergence window, so the GC and the wait below never eat into it. The
    // texture attaches on a later rendered frame; a loaded machine renders slowly, so wait for it
    // (it must still attach).
    await viewer.waitForFunction(() => window.__riverScreening().attached, null, { timeout: 30000 })
      .catch(async error => { throw new Error(`${error.message}: cycle ${index} the film never reached the screen: ${JSON.stringify(await screening(viewer))}`); });
    const inside = await counters(viewer);
    check(inside.screeningVideos === 1 && inside.mediaPlaying === 1 && (await screening(viewer)).attached, `cycle ${index}: one playing video attached inside IPIC: ${JSON.stringify(inside)}`);
    const position = (await screening(viewer)).currentTime;
    await leaveIpic(viewer);
    const playCalls = (await viewer.evaluate(() => window.__soak.counters().playCalls));
    await viewer.waitForTimeout(1500);
    const after = await counters(viewer), hostAfter = await screening(host);
    check(after.mediaPlaying === 0 && after.screeningVideos === 0, `cycle ${index}: no film left playing after exit: ${JSON.stringify(after)}`);
    check(after.playCalls === playCalls, `cycle ${index}: no late play() after exit (${playCalls} -> ${after.playCalls})`);
    check(hostAfter.epoch === before.epoch && (hostAfter.currentTime > before.currentTime || hostAfter.sharedStatus === 'ended'), `cycle ${index}: the viewer's entry and exit did not reset the host's film`);
    console.log(`cycle ${index}: ${lateJoin ? 'late join' : 'in-room start'} at ${late.currentTime.toFixed(2)} s after a ${entryMs} ms trip in, within 500 ms after ${converged} ms; after exit ${JSON.stringify(after)}`);
    return { cycle: index, restarted, lateJoin, entryMs, joinedAtS: Math.round(late.currentTime * 100) / 100, convergedAfterMs: converged, worstSpreadMs: Math.round(worst), viewerPositionS: Math.round(position * 100) / 100, inside, after };
  }

  cycles.push({ warmUp: true, ...await cycle(0) });
  checks.push('warm-up entry/exit completed');
  for (let i = 1; i <= CYCLES; i++) cycles.push(await cycle(i));
  const lateJoins = cycles.filter(item => item.lateJoin).length;
  check(lateJoins > 0, 'at least one cycle joined a running film late');
  checks.push(`${CYCLES} further entry/exit cycles (${lateJoins} of ${CYCLES + 1} late joins): each within 500 ms in under 5 s, no film or late play() after exit, host film never reset`);

  // Growth: the warm-up exit is the baseline. Media, audio contexts, intervals and renderer
  // resources must not exceed it after the last cycle. Counts that move with the HUD (DOM
  // nodes, listeners, pending timeouts) must not grow steadily: a leak of one per cycle rises
  // in all ten steps.
  const series = key => cycles.map(item => item.after[key]);
  const baseline = cycles[0].after, last = cycles.at(-1).after, growth = {};
  for (const key of ['nodes', 'listeners', 'documents', 'textures', 'geometries', 'mediaTracked', 'mediaInDom', 'mediaLoaded', 'audioContexts', 'intervals', 'timeouts']) {
    const values = series(key), rises = values.slice(1).filter((value, i) => value > values[i]).length;
    growth[key] = { baseline: baseline[key], last: last[key], delta: last[key] - baseline[key], rises, series: values };
  }
  for (const key of ['mediaTracked', 'mediaInDom', 'mediaLoaded', 'audioContexts', 'intervals', 'textures', 'geometries', 'documents'])
    check(growth[key].delta <= 0, `${key} grew over ${CYCLES} cycles: ${JSON.stringify(growth[key])}`);
  for (const key of ['nodes', 'listeners', 'timeouts'])
    check(growth[key].rises < CYCLES - 1 || growth[key].delta <= 0, `${key} grew steadily over ${CYCLES} cycles: ${JSON.stringify(growth[key])}`);
  checks.push('no growth in media, audio contexts, intervals, documents or renderer resources; no steady growth in DOM nodes, listeners or timeouts');

  // Narrow screens with the banner and dock present (#367): the viewer goes back in.
  await ensureRunning(Math.min(29.5, lastTripS + 20));
  await enterIpic(viewer);
  await viewer.waitForFunction(() => window.__riverScreening().state === 'playing', null, { timeout: 30000 });
  // Captions: the active cue is on screen in the panel, and the toggle hides and restores it.
  const caption = () => viewer.evaluate(() => {
    const line = document.querySelector('#ipic-screening .ipic-screening-caption'), track = document.querySelector('#ipic-screening video')?.textTracks?.[0];
    return { text: line?.textContent ?? '', shown: Boolean(line && !line.hidden && line.getClientRects().length), cue: [...(track?.activeCues ?? [])].map(cue => cue.text).join('\n') };
  });
  await viewer.waitForFunction(() => document.querySelector('#ipic-screening .ipic-screening-caption')?.textContent, null, { timeout: 15000 });
  const shownCaption = await caption();
  check(shownCaption.shown && shownCaption.text && shownCaption.text === shownCaption.cue, `the active caption cue is shown: ${JSON.stringify(shownCaption)}`);
  await viewer.locator('#ipic-screening [data-control="captions"]').click();
  check(await viewer.waitForFunction(() => document.querySelector('#ipic-screening .ipic-screening-caption')?.hidden, null, { timeout: 5000 }).then(() => true, () => false), 'Captions off hides the caption line');
  await viewer.locator('#ipic-screening [data-control="captions"]').click();
  await viewer.waitForFunction(() => document.querySelector('#ipic-screening .ipic-screening-caption')?.textContent, null, { timeout: 15000 });
  checks.push(`the active caption is shown on screen ("${shownCaption.text.split('\n')[0]}") and the toggle hides and restores it`);
  const narrow = {};
  const findings = [];
  for (const [width, height] of [[390, 844], [320, 640]]) {
    await ensureRunning(25); // keep the film running, so the panel shows its playing controls
    await viewer.setViewportSize({ width, height });
    await viewer.waitForTimeout(400);
    const banner = viewer.locator('.hardware-acceleration-warning'), dock = viewer.locator('.visit-tools');
    check(await banner.isVisible(), `${width} px: the software-rendering banner is on screen for this review`);
    check(await dock.isVisible(), `${width} px: the play dock is on screen`);
    const views = {};
    for (const dockOpen of [false, true]) {
      // Whether a visitor could tap the dock's own toggle here is recorded, not required: it is HUD
      // layering outside the screening panel (see findings). The dock state is then set directly.
      const toggle = await viewer.evaluate(() => {
        const el = document.querySelector('.visit-tools-toggle'), r = el.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { reachable: Boolean(top && (top === el || el.contains(top))), coveredBy: top && !(top === el || el.contains(top)) ? (top.closest('[class]')?.className ?? top.tagName) : null };
      });
      if (!toggle.reachable) findings.push({ width, dockOpen: await dock.evaluate(el => el.open), dockToggleCoveredBy: toggle.coveredBy });
      await dock.evaluate((el, open) => { el.open = open; }, dockOpen);
      await viewer.waitForTimeout(400);
      // Every visible panel control and the Step outside control is the topmost element at its
      // centre, so a real click lands on it rather than the banner, dock or canvas.
      const hits = await viewer.evaluate(() => {
        const targets = [...document.querySelectorAll('#ipic-screening [data-control]')].filter(el => !el.hidden && el.getClientRects().length);
        const banner = document.querySelector('.hardware-acceleration-warning')?.getBoundingClientRect();
        return targets.map(el => {
          const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
          const overlapsBanner = Boolean(banner && r.left < banner.right && r.right > banner.left && r.top < banner.bottom && r.bottom > banner.top);
          return { control: el.dataset.control ?? el.id, label: el.textContent.trim(), inView: x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight, reachable: Boolean(top && (top === el || el.contains(top))), overlapsBanner, rect: [r.left, r.top, r.width, r.height].map(Math.round) };
        });
      });
      const blocked = hits.filter(hit => !hit.inView || !hit.reachable);
      check(!blocked.length, `${width} px, dock ${dockOpen ? 'open' : 'closed'}: controls not reachable: ${JSON.stringify(blocked)}`);
      // Step outside the way a visitor reaches it: narrow screens hide the walking console while Town
      // chat is open (by design), and leaving is a secondary action under More. With chat collapsed and
      // More open, it must be on screen and not covered by the screening panel.
      const exit = await viewer.evaluate(async () => {
        const chat = document.querySelector('.town-chat-dock'), more = document.querySelector('.walking-more'), button = document.querySelector('#walking-enter');
        const chatWasOpen = Boolean(chat?.open); if (chat) chat.open = false;
        await new Promise(resolve => setTimeout(resolve, 400));
        const viaMore = Boolean(more?.contains(button)); if (viaMore) more.open = true;
        await new Promise(resolve => setTimeout(resolve, 400));
        const r = button.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
        const panel = document.querySelector('#ipic-screening'), panelShown = () => getComputedStyle(panel).visibility === 'visible';
        const result = { chatWasOpen, viaMore, label: button.textContent.trim(), inView: x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight,
          reachable: Boolean(top && (top === button || button.contains(top))), coveredBy: top && !(top === button || button.contains(top)) ? (top.closest('[class]')?.className ?? top.tagName) : null, rect: [r.left, r.top, r.width, r.height].map(Math.round),
          panelShownWithMore: panelShown() };
        if (viaMore) more.open = false; if (chat) chat.open = chatWasOpen;
        await new Promise(resolve => setTimeout(resolve, 200));
        result.panelBack = panelShown();
        return result;
      });
      check(exit.inView && exit.reachable && /Step outside/.test(exit.label) && exit.panelBack, `${width} px, dock ${dockOpen ? 'open' : 'closed'}: Step outside is reachable with Town chat collapsed, and the panel returns when More closes: ${JSON.stringify(exit)}`);
      hits.push({ control: 'walking-enter', ...exit });
      views[dockOpen ? 'dockOpen' : 'dockClosed'] = hits;
      await viewer.screenshot({ path: `output/playwright/ipic/soak-${width}-dock-${dockOpen ? 'open' : 'closed'}.png` });
    }
    await dock.evaluate(el => { el.open = false; });
    // Real pointer clicks at the controls' coordinates, then keyboard focus.
    const click = async name => { const box = await viewer.locator(`#ipic-screening [data-control="${name}"]`).boundingBox(); await viewer.mouse.click(box.x + box.width / 2, box.y + box.height / 2); };
    const pressed = name => viewer.locator(`#ipic-screening [data-control="${name}"]`).getAttribute('aria-pressed');
    const captions = await pressed('captions'); await click('captions');
    check(await pressed('captions') !== captions, `${width} px: a pointer click toggles captions`);
    await click('captions');
    // Sound plays only inside the auditorium, so its control is disabled in the reception and lounge.
    const soundEnabled = !(await viewer.locator('#ipic-screening [data-control="sound"]').isDisabled());
    if (soundEnabled) {
      const sound = await pressed('sound'); await click('sound');
      check(await pressed('sound') !== sound, `${width} px: a pointer click toggles sound`);
      await click('sound');
    }
    const focus = await viewer.evaluate(() => {
      const control = document.querySelector('#ipic-screening [data-control="captions"]'); control.focus({ focusVisible: true });
      const style = getComputedStyle(control);
      return { focused: document.activeElement === control, outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0, ring: style.boxShadow !== 'none' };
    });
    check(focus.focused && (focus.outline || focus.ring), `${width} px: keyboard focus on a control is visible: ${JSON.stringify(focus)}`);
    narrow[width] = { views, focus, soundEnabled };
  }
  checks.push('390 and 320 px: with the banner and the dock closed or open, every panel control and Step outside is on screen and topmost; pointer clicks toggle captions, and sound where it is enabled (inside the auditorium); focus is visible');
  await viewer.setViewportSize({ width: 1280, height: 800 });
  const stopped = await viewer.evaluate(() => window.__riverScreening().state);
  await viewer.locator('#ipic-screening [data-control="stop-watching"]').click();
  await viewer.waitForFunction(() => !window.__riverScreening().active || window.__riverScreening().stopped || window.__riverScreening().state === 'disposed');
  const hostStill = await screening(host);
  check(hostStill.sharedStatus === 'playing', 'the viewer stopping watching left the shared film playing');
  checks.push(`Stop watching (from ${stopped}) released only the viewer's player`);
  await leaveIpic(viewer).catch(() => {});
  check(!errors.length, errors.join('; '));
  return { checks, errors, reloads, cycles, growth, narrow, findings, caption: shownCaption, profile: 'one machine, loopback town, two headless Chromium pages with SwiftShader, GC before each counter read, 250 ms drift sampling' };
}
