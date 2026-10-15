async (host, viewer) => {
  // Two real browsers on one loopback town: alice holds a synthetic IPIC host grant, bob does
  // not. Positions are the two video elements' own currentTime, projected to a common wall
  // time, never a "playing" label. Software rendering; not a visual or device acceptance.
  const { openHudSpace } = await import('./hud-navigation.js');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const checks = [], errors = [], samples = [];
  for (const page of [host, viewer]) page.on('pageerror', error => errors.push(error.message));
  const screening = page => page.evaluate(() => window.__riverScreening?.() ?? null);
  async function load(page) {
    await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
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
  const position = async page => page.evaluate(() => ({ at: performance.timeOrigin + performance.now(), ...window.__riverScreening() }));
  async function spread() {
    const [a, b] = await Promise.all([position(host), position(viewer)]);
    const project = sample => sample.currentTime * 1000 + (sample.paused ? 0 : Date.now() - sample.at);
    return { spreadMs: Math.abs(project(a) - project(b)), host: a, viewer: b };
  }

  // Both residents are in town first; the viewer's late join is then only the trip into IPIC.
  await Promise.all([load(host), load(viewer)]);
  await enterIpic(host);
  await host.waitForFunction(() => !document.querySelector('#ipic-screening [data-control="host-start"]')?.hidden);
  checks.push('host sees Start film inside IPIC after the server reported canHost');
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
    samples.push({ sinceJoinMs: Date.now() - joined, spreadMs: Math.round(sample.spreadMs), hostDriftMs: sample.host.driftMs, viewerDriftMs: sample.viewer.driftMs, hostRate: sample.host.rate, viewerRate: sample.viewer.rate });
    if (sample.spreadMs < 500 && converged === null) converged = Date.now() - joined;
    await viewer.waitForTimeout(250);
  }
  check(converged !== null && converged <= 5000, `viewers converged within 500 ms in ${converged} ms`);
  check(samples.filter(s => s.sinceJoinMs >= 5000).every(s => s.spreadMs < 500), 'viewers stayed within 500 ms after convergence');
  checks.push(`two viewers converged within 500 ms after ${converged} ms and stayed there`);

  await host.locator('#ipic-screening [data-control="host-pause"]').click();
  await Promise.all([host, viewer].map(page => page.waitForFunction(() => window.__riverScreening().paused && window.__riverScreening().sharedStatus === 'paused', null, { timeout: 10000 })));
  const paused = await spread();
  check(paused.spreadMs < 300, `both stopped on the paused frame (${paused.spreadMs} ms apart)`);
  checks.push('host pause stopped both viewers on the same frame');

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

  // Another allowlisted film brings its own captions and transcript: the host starts the labelled
  // fixture by command, and the viewer's caption track and transcript follow it (#365 review).
  const current = await host.evaluate(() => window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic'));
  const swapBase = { type: 'screening', venueId: 'ipic', epoch: current.epoch };
  const halted = await hostCommand({ ...swapBase, action: 'stop', expectedRevision: current.revision, operationId: 'journey-stop-002' });
  const fixture = await hostCommand({ ...swapBase, action: 'start', mediaId: 'ipic-fixture-v1', expectedRevision: halted?.screening?.revision, operationId: 'journey-start-02' });
  check(fixture?.ok === true, `host started the fixture by command: ${JSON.stringify(fixture)}`);
  await viewer.waitForFunction(revision => window.__riverScreening().revision === revision && window.__riverScreening().mediaId === 'ipic-fixture-v1', fixture.screening.revision, { timeout: 15000 });
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
  checks.push('another film (the fixture, by command) brings its own captions and transcript');

  await openHudSpace(viewer, 'explore-section');
  const other = await viewer.evaluate(() => [...document.querySelectorAll('#destination option')].map(option => option.textContent).find(label => label && label !== 'IPIC Theaters'));
  await viewer.locator('#destination').selectOption({ label: other });
  await viewer.locator('#enter-destination').click();
  await viewer.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside !== 'osm-node-8172494964');
  await viewer.waitForFunction(() => window.__riverScreening()?.active === false && !document.querySelector('#ipic-screening video'));
  checks.push(`leaving IPIC (to ${other}) released the viewer's film, panel and video element`);
  check(!errors.length, errors.join('; '));
  return { checks, errors, convergedAfterMs: converged, samples, panels, pausedSpreadMs: Math.round(paused.spreadMs), replay, profile: 'one machine, loopback town, headless Chromium with SwiftShader, 250 ms sampling; local clocks share one wall clock' };
}
