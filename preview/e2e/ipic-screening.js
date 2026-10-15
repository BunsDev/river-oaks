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
  checks.push('host started the fixture and its own video element is playing');

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


  await viewer.locator('#ipic-screening [data-control="transcript"]').click();
  check(await viewer.evaluate(() => !document.querySelector('.ipic-screening-transcript').hidden && document.querySelector('.ipic-screening-transcript').textContent.includes('test pattern')), 'transcript readable');
  check(await viewer.evaluate(() => document.querySelector('#ipic-screening [data-control="captions"]').getAttribute('aria-pressed') === 'true'), 'captions on by default');
  checks.push('captions on by default and the transcript opens without audio');

  await openHudSpace(viewer, 'explore-section');
  const other = await viewer.evaluate(() => [...document.querySelectorAll('#destination option')].map(option => option.textContent).find(label => label && label !== 'IPIC Theaters'));
  await viewer.locator('#destination').selectOption({ label: other });
  await viewer.locator('#enter-destination').click();
  await viewer.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside !== 'osm-node-8172494964');
  await viewer.waitForFunction(() => window.__riverScreening()?.active === false && !document.querySelector('#ipic-screening video'));
  checks.push(`leaving IPIC (to ${other}) released the viewer's film, panel and video element`);
  check(!errors.length, errors.join('; '));
  return { checks, errors, convergedAfterMs: converged, samples, panels, pausedSpreadMs: Math.round(paused.spreadMs), profile: 'one machine, loopback town, headless Chromium with SwiftShader, 250 ms sampling; local clocks share one wall clock' };
}
