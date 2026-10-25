async (host, viewer) => {
  // Two real browsers on one loopback town: alice holds a synthetic IPIC host grant, bob does
  // not. Positions are the two video elements' own currentTime, projected to a common wall
  // time, never a "playing" label. Software rendering; not a visual or device acceptance.
  const { openHudSpace } = await import('./hud-navigation.js');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const checks = [], errors = [], samples = [];
  for (const page of [host, viewer]) page.on('pageerror', error => errors.push(error.message));
  const screening = page => page.evaluate(() => window.__riverScreening?.() ?? null);
  // The host's page asks for the labelled fixture in its chooser (development builds only, #499).
  async function load(page, extra = '') {
    await page.goto(`http://127.0.0.1:5173/?motion-debug=1${extra}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 90000 });
  }
  async function enterIpic(page) {
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: 'IPIC Theaters' });
    await page.locator('#enter-destination').click();
    await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside === 'osm-node-8172494964');
    await page.locator('#panel-toggle').click();
    await page.waitForFunction(() => window.__riverScreening?.()?.active === true);
  }
  // Each page reports its film position and wall time; compare them at a common instant.
  const position = async page => page.evaluate(() => ({ at: performance.timeOrigin + performance.now(), perfNow: performance.now(), ...window.__riverScreening() }));
  async function spread() {
    const [a, b] = await Promise.all([position(host), position(viewer)]);
    const project = sample => sample.currentTime * 1000 + (sample.paused ? 0 : Date.now() - sample.at);
    // currentTime reads a requested seek at once; the last frame each compositor presented (this
    // generation's only) is the visible position, carried forward to the same instant.
    const shown = sample => sample.presented?.generation === sample.generation
      ? sample.presented.mediaTimeMs + (sample.paused ? 0 : sample.perfNow - (sample.presented.shownAt ?? sample.presented.at) + Date.now() - sample.at) : null;
    const [pa, pb] = [shown(a), shown(b)];
    return { spreadMs: Math.abs(project(a) - project(b)), presentedSpreadMs: pa === null || pb === null ? null : Math.abs(pa - pb), host: a, viewer: b };
  }

  // Both residents are in town first; the viewer's late join is then only the trip into IPIC.
  await Promise.all([load(host, '&screening-fixtures=1'), load(viewer)]);
  await enterIpic(host);
  await host.waitForFunction(() => !document.querySelector('#ipic-screening [data-control="host-start"]')?.hidden);
  checks.push('host sees Start film inside IPIC after the server reported canHost');
  // The chooser (#499): approved films, the approved short first and chosen; the fixture is marked as a test.
  const chooser = await host.evaluate(() => { const box = document.querySelector('#ipic-screening .ipic-screening-chooser'), select = box?.querySelector('select');
    return { shown: Boolean(box && !box.hidden), value: select?.value, options: [...(select?.options ?? [])].map(o => [o.value, o.textContent]), details: box?.querySelector('.ipic-screening-film-details')?.textContent, label: box?.querySelector('label')?.textContent }; });
  check(chooser.shown && chooser.value === 'ipic-original-v1' && chooser.options[0][0] === 'ipic-original-v1' && chooser.options.some(([id, text]) => id === 'ipic-fixture-v1' && /\(test\)$/.test(text)) && /Silent/.test(chooser.details) && chooser.label === 'Film',
    `the host's chooser offers the approved short first: ${JSON.stringify(chooser)}`);
  checks.push(`the host's chooser shows ${chooser.options.length} films, the approved short chosen (${chooser.details})`);
  await host.locator('#ipic-screening [data-control="host-start"]').click();
  await host.waitForFunction(() => window.__riverScreening().state === 'playing' && window.__riverScreening().currentTime > 0.3, null, { timeout: 30000 });
  const film = await host.evaluate(() => window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic')?.mediaId);
  check(film === 'ipic-original-v1', `Start plays the approved short by default, not ${film}`);
  checks.push(`host started ${film} and its own video element is playing`);

  await host.waitForTimeout(2500);
  await enterIpic(viewer);
  const joined = Date.now();
  await viewer.waitForFunction(() => window.__riverScreening().state === 'playing', null, { timeout: 30000 });
  const late = await screening(viewer);
  check(late.currentTime > 2, `late viewer joined the running film, not a restart (${late.currentTime})`);
  check(await viewer.evaluate(() => [...document.querySelectorAll('#ipic-screening [data-control^="host-"]')].every(button => button.hidden)), 'viewer has no host controls');
  checks.push('late viewer joined at the running position with local controls only');

  let converged = null;
  while (Date.now() - joined < 9000) {
    const sample = await spread();
    samples.push({ sinceJoinMs: Date.now() - joined, spreadMs: Math.round(sample.spreadMs), presentedSpreadMs: sample.presentedSpreadMs === null ? null : Math.round(sample.presentedSpreadMs), hostDriftMs: sample.host.driftMs, viewerDriftMs: sample.viewer.driftMs, hostRate: sample.host.rate, viewerRate: sample.viewer.rate });
    if (sample.spreadMs < 500 && converged === null) converged = Date.now() - joined;
    await viewer.waitForTimeout(250);
  }
  check(converged !== null && converged <= 5000, `viewers converged within 500 ms in ${converged} ms`);
  check(samples.filter(s => s.sinceJoinMs >= 5000).every(s => s.spreadMs < 500), 'viewers stayed within 500 ms after convergence');
  // The same agreement in presented frames, not only in requested time. Each sample carries a frame's
  // display estimate forward, so single samples are noisy: the median is checked and every sample kept.
  const presentedSpreads = samples.filter(s => s.sinceJoinMs >= 5000 && s.presentedSpreadMs !== null).map(s => s.presentedSpreadMs).sort((a, b) => a - b);
  const median = presentedSpreads[Math.floor(presentedSpreads.length / 2)];
  check(presentedSpreads.length >= 8 && median < 500, `presented frames agree within 500 ms (median) after convergence: ${JSON.stringify(presentedSpreads)}`);
  checks.push(`two viewers converged within 500 ms after ${converged} ms and stayed there; presented frames: median spread ${median} ms, max ${presentedSpreads.at(-1)} ms over ${presentedSpreads.length} samples`);
  // House lights: dimmed while the film plays in IPIC (eased over about a second).
  const dimmed = await viewer.waitForFunction(() => window.__riverScreening().houseLights < 0.5, null, { timeout: 10000 }).then(() => true, () => false);
  check(dimmed, `house lights dim while the film plays: ${JSON.stringify(await viewer.evaluate(() => window.__riverScreening().houseLights))}`);

  // The short runs 52.6 s. On a loaded machine (or hosted CI on Mesa) the late join and the convergence
  // window can use most of it, and a pause needs a film still running: the host starts it again first
  // when under 12 s remain. Setup only; what the pause must do is checked unchanged below.
  const remainingS = await host.evaluate(() => { const s = window.__riverScreening(), video = document.querySelector('#ipic-screening video');
    return s.sharedStatus === 'playing' && video?.duration ? video.duration - s.currentTime : 0; });
  if (remainingS < 12) {
    const stop = host.locator('#ipic-screening [data-control="host-stop"]');
    if (await stop.isVisible()) { await stop.click(); await host.waitForFunction(() => window.__riverScreening().sharedStatus === 'stopped'); }
    await host.locator('#ipic-screening [data-control="host-start"]').click();
    await Promise.all([host, viewer].map(page => page.waitForFunction(() => window.__riverScreening().state === 'playing' && window.__riverScreening().currentTime > .5, null, { timeout: 30000 })));
    checks.push(`the film was started again before the pause (${remainingS.toFixed(1)} s were left)`);
  }
  await host.locator('#ipic-screening [data-control="host-pause"]').click();
  await Promise.all([host, viewer].map(page => page.waitForFunction(() => window.__riverScreening().paused && window.__riverScreening().sharedStatus === 'paused', null, { timeout: 10000 })));
  const paused = await spread();
  check(paused.spreadMs < 300, `both stopped on the paused frame (${paused.spreadMs} ms apart)`);
  checks.push('host pause stopped both viewers on the same frame');
  const lit = await viewer.waitForFunction(() => window.__riverScreening().houseLights > 0.9, null, { timeout: 10000 }).then(() => true, () => false);
  check(lit, `house lights come back up when the film pauses: ${JSON.stringify(await viewer.evaluate(() => window.__riverScreening().houseLights))}`);
  checks.push('house lights dimmed while the film played and came back up on pause');

  // Panel views for design review: desktop, 390 px and 320 px. UI widths only, not device proof.
  const panels = {};
  for (const [page, width, height, name] of [[host, 1280, 800, 'host-desktop'], [viewer, 390, 844, 'viewer-390'], [viewer, 320, 640, 'viewer-320']]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    const box = await page.locator('#ipic-screening').boundingBox();
    check(box && box.x >= 0 && box.x + box.width <= width + 0.5 && box.y + box.height <= height, `${name} panel fits the viewport: ${JSON.stringify(box)}`);
    check(width >= 1000 || box.width >= width * 0.6, `${name} panel uses the narrow width instead of half of it: ${Math.round(box.width)} px`);
    await page.locator('#ipic-screening').screenshot({ path: `output/playwright/ipic/screening-panel-${name}.png` });
    panels[name] = { width: Math.round(box.width), height: Math.round(box.height) };
  }
  await host.setViewportSize({ width: 1280, height: 800 }); await viewer.setViewportSize({ width: 1280, height: 800 });
  checks.push('panel fits desktop, 390 px and 320 px views; captures in output/playwright/ipic');

  const refused = await viewer.evaluate(async () => {
    const m = window.__riverMultiplayer(), view = m.snapshot.screenings.find(item => item.venueId === 'ipic');
    return window.__riverMultiplayerCommand?.({ type: 'screening', action: 'pause', venueId: 'ipic', epoch: view.epoch, expectedRevision: view.revision, operationId: 'viewer-pause-01' }) ?? null;
  });
  if (refused) { check(refused.error === 'screening_host_required', `viewer transport pause refused: ${JSON.stringify(refused)}`); checks.push('a direct transport pause from the viewer is refused by the server'); }

  // Stale and replayed playback (#368), as real transport commands from the host's page. The
  // host stops and starts the film again, so the step has the whole film even when a
  // loaded machine paused late. A resent start applies once (twice would restart the film);
  // a stale revision, an earlier epoch and a reused operation id with another action are
  // refused; neither film rewinds, restarts or pauses meanwhile.
  const hostCommand = message => host.evaluate(value => window.__riverMultiplayerCommand(value), message);
  const before = await host.evaluate(() => window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic'));
  const base = { type: 'screening', venueId: 'ipic', epoch: before.epoch };
  const stopped = await hostCommand({ ...base, action: 'stop', expectedRevision: before.revision, operationId: 'journey-stop-001' });
  check(stopped?.ok === true && stopped.screening.status === 'stopped', `host stop applied: ${JSON.stringify(stopped)}`);
  const start = { ...base, action: 'start', mediaId: before.mediaId, expectedRevision: stopped.screening.revision, operationId: 'journey-start-01' };
  const started = await hostCommand(start);
  check(started?.ok === true && started.screening.revision === stopped.screening.revision + 1, `host start applied: ${JSON.stringify(started)}`);
  await Promise.all([host, viewer].map(page => page.waitForFunction(revision => window.__riverScreening().state === 'playing' && window.__riverScreening().revision === revision, started.screening.revision, { timeout: 15000 })));
  await viewer.waitForTimeout(1500);
  const replayed = await hostCommand(start);
  check(replayed?.ok === true && replayed.replayed === true && replayed.screening.revision === started.screening.revision, `a resent start applied once: ${JSON.stringify(replayed)}`);
  const refusals = {
    staleRevision: (await hostCommand({ ...base, action: 'pause', expectedRevision: stopped.screening.revision, operationId: 'journey-stale-01' }))?.error,
    earlierEpoch: (await hostCommand({ ...base, action: 'stop', epoch: `${before.epoch}x`.slice(-64), expectedRevision: started.screening.revision, operationId: 'journey-epoch-01' }))?.error,
    reusedOperation: (await hostCommand({ ...base, action: 'pause', expectedRevision: started.screening.revision, operationId: start.operationId }))?.error,
  };
  check(refusals.staleRevision === 'screening_stale' && refusals.earlierEpoch === 'screening_stale' && refusals.reusedOperation === 'screening_operation_conflict', `stale and reused commands refused: ${JSON.stringify(refusals)}`);
  const replay = { revision: started.screening.revision, refusals, samples: [] };
  for (let i = 0; i < 9; i++) {
    const sample = await spread();
    replay.samples.push({ host: sample.host.currentTime, viewer: sample.viewer.currentTime, hostRevision: sample.host.revision, viewerRevision: sample.viewer.revision, spreadMs: Math.round(sample.spreadMs), paused: sample.host.paused || sample.viewer.paused });
    await viewer.waitForTimeout(250);
  }
  for (const side of ['host', 'viewer']) {
    const times = replay.samples.map(sample => sample[side]);
    check(times[0] >= 1, `${side} film was not restarted by the resent start (${times[0]} s at the first sample)`);
    check(times.every((time, i) => i === 0 || time >= times[i - 1] - 0.05), `${side} film never rewound: ${times.join(', ')}`);
    check(times.at(-1) - times[0] > 1, `${side} film kept playing: ${times[0]} -> ${times.at(-1)}`);
  }
  check(replay.samples.every(sample => !sample.paused && sample.hostRevision === replay.revision && sample.viewerRevision === replay.revision), `both pages stayed on the started revision: ${JSON.stringify(replay.samples)}`);
  check(replay.samples.every(sample => sample.spreadMs < 500), `viewers stayed within 500 ms through the refused commands: ${replay.samples.map(sample => sample.spreadMs).join(', ')}`);
  checks.push('a resent start applied once; stale revision, earlier epoch and reused operation id refused; both films kept playing forward together');


  await viewer.locator('#ipic-screening [data-control="transcript"]').click();
  // The panel shows the playing film's own transcript (the approved short by default, #365).
  check(await viewer.evaluate(async () => {
    const { SCREENING_MEDIA } = await import('/src/screening-contract.js'), panel = document.querySelector('.ipic-screening-transcript');
    const film = SCREENING_MEDIA[window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic')?.mediaId];
    return Boolean(film) && !panel.hidden && film.transcript.every(line => panel.textContent.includes(line));
  }), 'transcript readable');
  check(await viewer.evaluate(() => document.querySelector('#ipic-screening [data-control="captions"]').getAttribute('aria-pressed') === 'true'), 'captions on by default');
  checks.push('captions on by default and the transcript opens without audio');

  // Another allowlisted film brings its own captions and transcript: the host chooses the labelled
  // fixture in the chooser and starts it, and the viewer's caption track and transcript follow (#365, #499).
  const current = await host.evaluate(() => window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic'));
  const swapBase = { type: 'screening', venueId: 'ipic', epoch: current.epoch };
  // Every rendered frame of the viewer through the switch (#498): the screen must never show a frame
  // while the next film is still loading, nor keep the stopped film's last frame.
  await viewer.evaluate(() => {
    const log = window.__screenSwitchLog = [];
    // What each update drew (the software profile draws once a second); a build without `drawn` reports live state.
    const step = () => { const s = window.__riverScreening(); const d = s?.drawn ?? (s && { state: s.state, shared: s.sharedStatus, attached: s.attached, mediaId: s.mediaId });
      if (s?.active) log.push({ ...d, key: s.screen?.key ?? null, decoded: s.decoded?.join('x') ?? null });
      if (!window.__screenSwitchDone && log.length < 20000) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  const shortKey = await viewer.evaluate(() => window.__riverScreening().screen?.key ?? null);
  const halted = await hostCommand({ ...swapBase, action: 'stop', expectedRevision: current.revision, operationId: 'journey-stop-002' });
  await viewer.waitForFunction(() => window.__riverScreening().sharedStatus === 'stopped', null, { timeout: 15000 });
  // The software profile draws once a second: allow the next draws, then read what the screen shows.
  await viewer.waitForFunction(() => window.__riverScreening().attached === false, null, { timeout: 10000 }).catch(() => {});
  const idle = await screening(viewer);
  check(idle.attached === false && idle.state === 'idle', `a stopped film leaves the screen idle, not on its last frame: ${JSON.stringify({ state: idle.state, attached: idle.attached })}`);
  check(halted?.ok === true, `host stopped the short: ${JSON.stringify(halted)}`);
  await host.waitForFunction(() => !document.querySelector('#ipic-screening .ipic-screening-chooser')?.hidden && !document.querySelector('#ipic-screening [data-control="host-start"]')?.hidden);
  check(await viewer.evaluate(() => document.querySelector('#ipic-screening .ipic-screening-chooser')?.hidden !== false), 'the viewer has no chooser');
  // The chooser on narrow screens (#499): the film select and Start film stay on screen and are not covered.
  for (const [width, height] of [[390, 844], [320, 640]]) {
    await host.setViewportSize({ width, height }); await host.waitForTimeout(300);
    const reach = await host.evaluate(() => [...document.querySelectorAll('#ipic-screening select[data-control="film"], #ipic-screening [data-control="host-start"]')].map(el => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
      return { control: el.dataset.control, inView: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight, reachable: Boolean(top && (top === el || el.contains(top))), height: Math.round(r.height) };
    }));
    check(reach.length === 2 && reach.every(item => item.inView && item.reachable && item.height >= 44), `the chooser at ${width} px: ${JSON.stringify(reach)}`);
    await host.locator('#ipic-screening').screenshot({ path: `output/playwright/ipic/screening-chooser-${width}.png` });
  }
  await host.setViewportSize({ width: 1280, height: 800 });
  checks.push('the film chooser and Start film are on screen, uncovered and at least 44 px tall at 390 and 320 px');
  await host.locator('#ipic-screening select[data-control="film"]').selectOption('ipic-fixture-v1');
  const local = await Promise.all([host, viewer].map(screening));
  check(local.every(item => item.sharedStatus === 'stopped' && item.mediaId === null), `a choice alone changes nothing shared: ${JSON.stringify(local.map(item => [item.sharedStatus, item.mediaId]))}`);
  await host.locator('#ipic-screening [data-control="host-start"]').click();
  await host.waitForFunction(() => window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic')?.mediaId === 'ipic-fixture-v1', null, { timeout: 15000 });
  const fixture = { screening: await host.evaluate(() => window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic')) };
  check(fixture.screening.status === 'playing', `the chosen fixture started through Start film: ${JSON.stringify(fixture.screening)}`);
  checks.push('the host chose the fixture and started it with Start film; the choice alone changed nothing shared');
  await viewer.waitForFunction(revision => window.__riverScreening().revision >= revision && window.__riverScreening().mediaId === 'ipic-fixture-v1', fixture.screening.revision, { timeout: 15000 });
  await viewer.waitForFunction(() => window.__riverScreening().state === 'playing' && window.__riverScreening().attached, null, { timeout: 30000 });
  const frames = await viewer.evaluate(() => { window.__screenSwitchDone = true; return window.__screenSwitchLog; });
  const stale = frames.filter(item => item.attached && (['loading', 'idle', 'error'].includes(item.state) || item.shared === 'stopped'));
  check(frames.length > 0 && stale.length === 0, `no frame of an earlier film while the next loads or after a stop (${stale.length} of ${frames.length} frames): ${JSON.stringify(stale.slice(0, 3))}`);
  const after = frames.at(-1);
  check(after.decoded === '640x360' && after.key && after.key !== shortKey, `the fixture got its own screen texture at its own size: ${JSON.stringify({ shortKey, after })}`);
  checks.push(`stop left the screen idle and the fixture (640×360) replaced the short (1280×720) with its own texture; no stale frame in ${frames.length} rendered frames`);
  // The panel follows on its next frame; a slow software-rendered frame is allowed up to 10 s.
  await viewer.waitForFunction(() => document.querySelector('#ipic-screening video track')?.getAttribute('src')?.endsWith('fixture-v1.en.vtt'), null, { timeout: 10000 }).catch(() => {});
  const text = await viewer.evaluate(async () => {
    const { SCREENING_MEDIA } = await import('/src/screening-contract.js'), panel = document.querySelector('.ipic-screening-transcript');
    return {
      tracks: [...document.querySelectorAll('#ipic-screening video track')].map(track => track.getAttribute('src')),
      transcript: SCREENING_MEDIA['ipic-fixture-v1'].transcript.every(line => panel.textContent.includes(line)),
      stale: SCREENING_MEDIA['ipic-original-v1'].transcript.some(line => panel.textContent.includes(line)),
    };
  });
  check(text.tracks.length === 1 && text.tracks[0] === '/assets/ipic/screening/fixture-v1.en.vtt' && text.transcript && !text.stale, `captions and transcript follow the playing film: ${JSON.stringify(text)}`);
  checks.push('the film chosen in the chooser (the fixture) brings its own captions and transcript');

  // The second approved film (#501, #547): the host stops the fixture, chooses "Two Seats, One Screen" and starts it.
  // The viewer gets its own texture, captions and transcript, and its dialogue-and-music track decodes.
  const fixturePlaying = await host.evaluate(() => window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic'));
  const fixtureStopped = await hostCommand({ ...swapBase, epoch: fixturePlaying.epoch, action: 'stop', expectedRevision: fixturePlaying.revision, operationId: 'journey-stop-004' });
  check(fixtureStopped?.ok === true, `host stopped the fixture: ${JSON.stringify(fixtureStopped)}`);
  await host.waitForFunction(() => !document.querySelector('#ipic-screening .ipic-screening-chooser')?.hidden && !document.querySelector('#ipic-screening [data-control="host-start"]')?.hidden, null, { timeout: 15000 });
  await host.locator('#ipic-screening select[data-control="film"]').selectOption('ipic-two-seats-v1');
  await host.locator('#ipic-screening [data-control="host-start"]').click();
  await host.waitForFunction(() => { const s = window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic'); return s?.mediaId === 'ipic-two-seats-v1' && s.status === 'playing'; }, null, { timeout: 15000 });
  const secondFilm = await host.evaluate(() => window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic'));
  await viewer.waitForFunction(revision => { const s = window.__riverScreening(); return s.revision >= revision && s.mediaId === 'ipic-two-seats-v1' && s.state === 'playing' && s.attached; }, secondFilm.revision, { timeout: 30000 });
  await viewer.waitForFunction(() => document.querySelector('#ipic-screening video track')?.getAttribute('src')?.endsWith('ipic-two-seats-v1.en.vtt'), null, { timeout: 10000 }).catch(() => {});
  // Decoded audio bytes count per load; wait for more while the second film plays (software decode is slow).
  const audioFrom = await viewer.evaluate(() => document.querySelector('#ipic-screening video')?.webkitAudioDecodedByteCount ?? 0);
  await viewer.waitForFunction(from => { const video = document.querySelector('#ipic-screening video'); return /ipic-two-seats-v1\.(webm|mp4)$/.test(video?.currentSrc ?? '') && video.webkitAudioDecodedByteCount > from; }, audioFrom, { timeout: 15000 }).catch(() => {});
  const second = await viewer.evaluate(async () => {
    const { SCREENING_MEDIA } = await import('/src/screening-contract.js'), panel = document.querySelector('.ipic-screening-transcript');
    const s = window.__riverScreening(), video = document.querySelector('#ipic-screening video');
    return {
      tracks: [...document.querySelectorAll('#ipic-screening video track')].map(track => track.getAttribute('src')),
      transcript: SCREENING_MEDIA['ipic-two-seats-v1'].transcript.every(line => panel.textContent.includes(line)),
      stale: SCREENING_MEDIA['ipic-fixture-v1'].transcript.some(line => panel.textContent.includes(line)),
      decoded: s.decoded?.join('x') ?? null, key: s.screen?.key ?? null,
      source: video?.currentSrc?.split('/').pop() ?? null, audioBytes: video?.webkitAudioDecodedByteCount ?? null,
    };
  });
  check(second.decoded === '1280x720' && second.key && second.key !== after.key, `the second film got its own screen texture: ${JSON.stringify({ fixtureKey: after.key, second })}`);
  check(second.tracks.length === 1 && second.tracks[0] === '/assets/ipic/screening/ipic-two-seats-v1.en.vtt' && second.transcript && !second.stale, `the second film's captions and transcript follow it: ${JSON.stringify(second)}`);
  check(/^ipic-two-seats-v1\.(webm|mp4)$/.test(second.source) && second.audioBytes > audioFrom, `the second film's dialogue and music decode: ${JSON.stringify({ audioFrom, second })}`);
  checks.push(`the host chose the second approved film (ipic-two-seats-v1) after the fixture: its own 1280×720 texture, captions and transcript, and its sound decoding (${second.source}, ${second.audioBytes} audio bytes)`);

  // Background and back (#502). Headless Chromium keeps a tab "visible" behind another, so this is emulated: the
  // viewer's page is marked hidden (the game stops drawing) and its JavaScript frozen for 8 s with the browser's own
  // lifecycle control (CDP Page.setWebLifecycleState), then resumed and shown. Its film must find the room's time
  // again. Not device evidence: a phone's lock screen stays a #502 device row. The playing film is started again
  // first when too little of it is left for the step.
  const filmLeft = await host.evaluate(() => { const s = window.__riverScreening(), video = document.querySelector('#ipic-screening video');
    return s.sharedStatus === 'playing' && video?.duration ? video.duration - s.currentTime : 0; });
  if (filmLeft < 22) {
    const now = await host.evaluate(() => window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic'));
    const halt = await hostCommand({ ...swapBase, epoch: now.epoch, action: 'stop', expectedRevision: now.revision, operationId: 'journey-stop-003' });
    const again = await hostCommand({ ...swapBase, epoch: now.epoch, action: 'start', mediaId: now.mediaId, expectedRevision: halt.screening.revision, operationId: 'journey-start-03' });
    check(again?.ok === true, `the film started again for the background step: ${JSON.stringify(again)}`);
    await Promise.all([host, viewer].map(page => page.waitForFunction(revision => window.__riverScreening().state === 'playing' && window.__riverScreening().revision === revision, again.screening.revision, { timeout: 30000 })));
  }
  const cdp = await viewer.context().newCDPSession(viewer);
  const setHidden = hidden => viewer.evaluate(value => {
    if (value) { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); }
    else { delete document.hidden; delete document.visibilityState; }
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  // A browser may pause a hidden page's media (iOS Safari does), and freezing alone does not: pause it, so coming
  // back has to restart the film at the room's time rather than find it still running.
  const away = await viewer.evaluate(() => { document.querySelector('#ipic-screening video')?.pause(); return window.__riverScreening(); });
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await host.waitForTimeout(8000);
  await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  const resumed = await screening(viewer);
  await setHidden(false);
  const shown = Date.now(), back = [];
  let recovered = null;
  while (Date.now() - shown < 12000) {
    const sample = await spread();
    back.push(Math.round(sample.spreadMs));
    if (sample.spreadMs < 500 && sample.viewer.state === 'playing' && !sample.viewer.paused) { recovered = Date.now() - shown; break; }
    await viewer.waitForTimeout(250);
  }
  // A requested time is not a presented one: wait for the first frame the viewer actually presents after its seek
  // (requestVideoFrameCallback), and compare its media time with the host's film at that frame's display time.
  const frame = await viewer.evaluate(fromS => new Promise(done => {
    const video = document.querySelector('#ipic-screening video'), start = performance.now(), timer = setTimeout(() => done(null), 12000);
    const step = (now, meta) => {
      if (meta.mediaTime > fromS + 4) { clearTimeout(timer); done({ wallMs: performance.timeOrigin + (meta.expectedDisplayTime ?? now), mediaMs: meta.mediaTime * 1000, afterMs: Math.round(now - start) }); }
      else video.requestVideoFrameCallback(step);
    };
    video.requestVideoFrameCallback(step);
  }), away.currentTime);
  const hostThen = await position(host);
  const background = { advancedS: Math.round((resumed.currentTime - away.currentTime) * 100) / 100, recoveredAfterMs: recovered, spreadsMs: back,
    presentedAfterMs: frame ? Math.round(frame.wallMs - shown) : null, presentedSpreadMs: frame ? Math.round(Math.abs(frame.mediaMs - (hostThen.currentTime * 1000 - (hostThen.at - frame.wallMs)))) : null };
  check(recovered !== null, `after 8 s frozen in the background the viewer found the room's time again: ${JSON.stringify(background)}`);
  check(background.advancedS < 1, `the viewer's film was paused while frozen in the background: ${JSON.stringify(background)}`);
  check(background.presentedSpreadMs !== null && background.presentedSpreadMs < 500, `the first frame presented after coming back is within 500 ms of the room: ${JSON.stringify(background)}`);
  checks.push(`background and back (emulated: hidden, its film paused, then frozen 8 s by CDP): the film restarted, and its first presented frame was ${background.presentedSpreadMs} ms from the room, ${background.presentedAfterMs} ms after showing`);

  // Host loss (#502): the host walks out of IPIC while the film plays. The server pauses it where it was on its
  // next tick and promotes nobody: the viewer's film stops on that frame, and the viewer still has no host controls.
  await openHudSpace(host, 'explore-section');
  const elsewhere = await host.evaluate(() => [...document.querySelectorAll('#destination option')].map(option => option.textContent).find(label => label && label !== 'IPIC Theaters'));
  await host.locator('#destination').selectOption({ label: elsewhere });
  await host.locator('#enter-destination').click();
  await host.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside !== 'osm-node-8172494964');
  await viewer.waitForFunction(() => window.__riverScreening().sharedStatus === 'paused' && window.__riverScreening().paused, null, { timeout: 15000 });
  // The software profile updates the player once a second: let it settle on the paused frame.
  await viewer.waitForFunction(() => { const s = window.__riverScreening(), view = window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic');
    return Math.abs(s.currentTime - view.positionMs / 1000) < 0.3; }, null, { timeout: 10000 }).catch(() => {});
  const hostLoss = await viewer.evaluate(() => { const view = window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic'), s = window.__riverScreening();
    return { status: view.status, positionS: view.positionMs / 1000, currentTime: s.currentTime, paused: s.paused, canHost: s.canHost,
      hostControls: [...document.querySelectorAll('#ipic-screening [data-control^="host-"]')].some(button => !button.hidden) }; });
  check(hostLoss.status === 'paused' && hostLoss.paused && Math.abs(hostLoss.currentTime - hostLoss.positionS) < 0.3 && !hostLoss.canHost && !hostLoss.hostControls,
    `the host's exit paused the viewer's film at the server's position, and nobody was promoted: ${JSON.stringify(hostLoss)}`);
  checks.push(`host loss: the host walked out to ${elsewhere}; the server paused the film at ${hostLoss.positionS.toFixed(2)} s, the viewer stopped on that frame, and nobody was promoted`);

  await openHudSpace(viewer, 'explore-section');
  const other = await viewer.evaluate(() => [...document.querySelectorAll('#destination option')].map(option => option.textContent).find(label => label && label !== 'IPIC Theaters'));
  await viewer.locator('#destination').selectOption({ label: other });
  await viewer.locator('#enter-destination').click();
  await viewer.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside !== 'osm-node-8172494964');
  await viewer.waitForFunction(() => window.__riverScreening()?.active === false && !document.querySelector('#ipic-screening video'));
  checks.push(`leaving IPIC (to ${other}) released the viewer's film, panel and video element`);
  check(!errors.length, errors.join('; '));
  return { checks, errors, convergedAfterMs: converged, samples, panels, pausedSpreadMs: Math.round(paused.spreadMs), replay, background, hostLoss, profile: 'one machine, loopback town, headless Chromium with SwiftShader, 250 ms sampling; local clocks share one wall clock' };
}
