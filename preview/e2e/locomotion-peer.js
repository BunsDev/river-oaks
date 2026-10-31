async page => {
  // #637: one player walks, reverses, strafes, stops and walks briskly by keyboard
  // while a second player watches. Both pages record normal-speed video and a
  // per-frame trace: the walker's own feet, and the observer's first-person view of the walker
  // (remote-players.js stats). Run on its own:
  //   RIVER_OAKS_SHARED_JOURNEY=locomotion-peer node preview/e2e/shared-runner.js development
  // Development identities are not Jevica's accounts, so brisk walking is 3.2 m/s here.
  const errors = [], checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const browser = page.context().browser(), videoDir = 'output/playwright/locomotion-peer';
  const open = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } } });
    const tab = await context.newPage(); tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message));
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 90000 });
    for (const [open, toggle] of [['.visit-tools[open]', '.visit-tools-toggle'], ['.town-chat-dock[open]', '.town-chat-toggle']]) if (await tab.locator(open).count()) await tab.locator(toggle).click();
    return tab;
  };
  const walker = await open(), observer = await open();
  const walkerId = await walker.evaluate(() => window.__riverMultiplayer().selfId);
  // Westcreek Lane runs north-south; the clear band is east -2918..-2902 (store doors to
  // the east). The walker walks north along east -2912, clear of the rival at -2908; the
  // observer stands 5.5 m west in first person, so its own body never hides the walker.
  const X = -2912, N = -1326;
  await walker.evaluate(([x, n]) => window.__riverSeatAndWater().goTo(x, n), [X, N]);
  await observer.evaluate(([x, n]) => window.__riverSeatAndWater().goTo(x, n), [X - 5.5, N + 6]);
  await walker.waitForTimeout(2500);
  const start = await walker.evaluate(() => window.__riverMultiplayer().snapshot.players.find(p => p.id === window.__riverMultiplayer().selfId).position);
  await observer.locator('#canvas-host').focus(); await observer.keyboard.press('KeyV');
  await observer.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.cameraMode === 'first');
  await observer.evaluate(([x, n]) => window.__riverSeatAndWater().face(x, n, 1.2), [X, N + 6]);
  await walker.evaluate(([x, n]) => window.__riverSeatAndWater().face(x, n), [start[0], start[1] + 10]);
  await observer.waitForFunction(id => window.__riverMultiplayer().remotes.find(p => p.id === id)?.ready, walkerId, { timeout: 60000 });
  await walker.waitForTimeout(1500);
  // Per-frame traces, after the app's own frame update in each animation frame.
  await walker.evaluate(() => {
    window.__locomotionTrace = [];
    const sample = now => {
      const self = window.__riverPlayerAttention(), pose = window.__riverCarriage().pose;
      if (self && pose) window.__locomotionTrace.push({ t: now, yaw: self.bodyYaw, position: self.position, speed: pose.speed, velocity: pose.velocity, feet: self.feet });
      window.__locomotionFrame = requestAnimationFrame(sample);
    };
    window.__locomotionFrame = requestAnimationFrame(sample);
  });
  await observer.evaluate(id => {
    window.__locomotionTrace = [];
    const sample = now => {
      const peer = window.__riverMultiplayer().remotes.find(p => p.id === id);
      if (peer) window.__locomotionTrace.push({ t: now, yaw: peer.heading, position: peer.position, onScreen: peer.onScreen, locomotion: peer.locomotion, feet: peer.feet });
      window.__locomotionFrame = requestAnimationFrame(sample);
    };
    window.__locomotionFrame = requestAnimationFrame(sample);
  }, walkerId);
  const host = walker.locator('#canvas-host'); await host.focus();
  const hold = async (keys, ms) => { for (const key of keys) await walker.keyboard.down(key); await walker.waitForTimeout(ms); for (const key of [...keys].reverse()) await walker.keyboard.up(key); };
  const phases = [];
  for (const [name, keys, ms] of [['walk', ['KeyW'], 2500], ['reverse', ['KeyS'], 2000], ['strafe', ['KeyD'], 1600], ['stop', [], 1500], ['brisk', ['ShiftLeft', 'KeyW'], 2200], ['settle', [], 2000]]) {
    phases.push({ name, at: await walker.evaluate(() => performance.now()) });
    if (keys.length) await hold(keys, ms); else await walker.waitForTimeout(ms);
  }
  const [local, peer] = await Promise.all([walker, observer].map(tab => tab.evaluate(() => { cancelAnimationFrame(window.__locomotionFrame); return window.__locomotionTrace; })));
  await observer.screenshot({ path: `${videoDir}/observer-end.png` });

  // Ankle travel while a foot stays in contact with the same stance target. It includes
  // the heel-to-toe roll (foot-roll.js moves the ankle over a planted sole), so it is an
  // upper bound on sliding, not a slide measurement. Peer frames count only on screen,
  // where its avatar actually updates.
  const planted = trace => {
    let max = 0, frames = 0, error = 0;
    for (let i = 1; i < trace.length; i++) for (const [j, foot] of (trace[i].feet ?? []).entries()) {
      if (trace[i].onScreen === false || trace[i - 1].onScreen === false) continue;
      const before = trace[i - 1].feet?.[j];
      error = Math.max(error, foot.error ?? 0);
      if (!before?.contact || !foot.contact) continue;
      if (foot.target && before.target && Math.hypot(...foot.target.map((v, k) => v - before.target[k])) > 1e-6) continue;
      max = Math.max(max, Math.hypot(foot.actual[0] - before.actual[0], foot.actual[2] - before.actual[2])); frames++;
    }
    return { plantedFrames: frames, maxAnkleTravelWhilePlantedMeters: max, maxFootErrorMeters: error };
  };
  // Horizontal body speed between rendered frames, per phase.
  const paces = (trace, window) => {
    const values = [];
    for (let i = 1; i < trace.length; i++) {
      const dt = (trace[i].t - trace[i - 1].t) / 1000;
      if (trace[i].t >= window[0] && trace[i].t <= window[1] && dt > 0) values.push(Math.hypot(trace[i].position[0] - trace[i - 1].position[0], trace[i].position[2] - trace[i - 1].position[2]) / dt);
    }
    values.sort((a, b) => a - b);
    const at = q => values.length ? values[Math.min(values.length - 1, Math.floor(q * values.length))] : null;
    return { frames: values.length, p05: at(.05), p50: at(.5), p95: at(.95), max: values.at(-1) ?? null };
  };
  // Lift-offs per second (either foot leaving contact), per phase: 3.2 m/s was a
  // 7.4 steps/s shuffle before the run gait (foot-placement.js RUN_SPEED).
  const stepRate = (trace, window) => {
    let lifts = 0;
    for (let i = 1; i < trace.length; i++) if (trace[i].t >= window[0] && trace[i].t <= window[1])
      for (const [j, foot] of (trace[i].feet ?? []).entries()) if (trace[i - 1].feet?.[j]?.contact && !foot.contact) lifts++;
    return lifts / Math.max(1e-3, (window[1] - window[0]) / 1000);
  };
  const clockOffset = await observer.evaluate(() => performance.timeOrigin) - await walker.evaluate(() => performance.timeOrigin);
  // The peer shows the walk about 0.6 s later: pose and broadcast cadence (up to 0.4 s),
  // the 0.3 s pacing buffer and the follow. Its windows shift by that and stay inside the phase.
  const PEER_DELAY = 600;
  const windows = phases.map((phase, i) => ({ name: phase.name, walker: [phase.at + 500, (phases[i + 1]?.at ?? local.at(-1).t) - 300] }));
  const byPhase = windows.map(w => {
    const peerWindow = [w.walker[0] - clockOffset + PEER_DELAY, w.walker[1] - clockOffset + PEER_DELAY], seen = peer.filter(sample => sample.onScreen !== false);
    return { name: w.name, local: { ...paces(local, w.walker), stepsPerSecond: stepRate(local, w.walker) }, peer: { ...paces(seen, peerWindow), stepsPerSecond: stepRate(seen, peerWindow) } };
  });
  const frameRate = trace => trace.length / ((trace.at(-1).t - trace[0].t) / 1000);
  const result = {
    walkerId, start, phases: byPhase, rates: { walkerHz: frameRate(local), observerHz: frameRate(peer) },
    local: planted(local), peer: planted(peer),
    peerOnScreenFraction: peer.filter(sample => sample.onScreen).length / peer.length,
    peerHeadingFrames: peer.filter(sample => sample.locomotion?.heading !== null && sample.locomotion?.heading !== undefined).length,
    videos: { walker: await walker.video().path(), observer: await observer.video().path() },
    scope: 'Two development clients on one machine and town; normal-speed video. Not a physical-device or human feel review.',
  };
  globalThis.__locomotionPeerTrace = { local, peer };
  await Promise.all([walker.context().close(), observer.context().close()]);
  check(local.length > 100 && peer.length > 100, 'Both pages traced the walk');
  check(!errors.length, errors.join('; '));
  return { ...result, checks, errors };
}
