// The same journey checks DEV and deliberately built diagnostic/production bundles.
async (page, { renderAuditMode = 'development', auditQuery = true } = {}) => {
  let deadline;
  const run = async () => {
  const checks = [], errors = [];
  const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:5181/${auditQuery ? '?render-audit=1' : ''}`);
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  await page.waitForFunction(() => {
    const host = document.querySelector('#canvas-host'), assets = JSON.parse(document.querySelector('#viewport')?.dataset.assetProgress || '{}');
    return assets.done && !assets.failed && Number(host?.dataset.storePeopleTotal) > 0 && host.dataset.storePeopleReady === host.dataset.storePeopleTotal;
  });
  const available = await page.evaluate(() => Boolean(window.__riverRenderAudit));
  check(available === (renderAuditMode !== 'production' && auditQuery), 'Audit requires an explicit supported build and query');
  if (!available) { check(errors.length === 0, 'World loads without timing API'); return { checks, errors }; }
  check(await page.evaluate(() => typeof window.__riverRenderAudit.crowdView === 'function') === (renderAuditMode === 'development'), 'Crowd camera is development-only');
  const result = await page.evaluate(async () => {
    const audit = window.__riverRenderAudit;
    const frames = () => new Promise(resolve => { let count = 0; const next = () => ++count >= 30 ? resolve() : requestAnimationFrame(next); requestAnimationFrame(next); });
    audit.start(); await frames(); const timing = audit.stop(), graphics = audit.graphics();
    await frames(); const stopped = audit.stop().frames.length;
    audit.start(); await frames(); const restarted = audit.stop();
    return { timing, graphics, stopped, restarted };
  });
  check(result.timing.frames.length > 10 && !result.timing.overflow, 'Bounded real render frames recorded');
  check(result.stopped === result.timing.frames.length, 'Stopped audit remains stopped');
  check(result.restarted.frames.length > 10 && !result.restarted.overflow, 'Audit restarts cleanly');
  const names = ['setup', 'community', 'trees', 'residents', 'interactions', 'players', 'reflections', 'debug', 'pipeline', 'tail'];
  for (const frame of result.timing.frames) {
    check(Number.isFinite(frame.intervalMs) && frame.intervalMs > 0 && Number.isFinite(frame.cpuMs), 'Finite frame timing');
    if (names.some(name => !Number.isFinite(frame.phasesMs?.[name]) || frame.phasesMs[name] < 0)) throw new Error('Missing or invalid phase timing');
    if (Math.abs(Object.values(frame.phasesMs).reduce((sum, value) => sum + value, 0) - frame.cpuMs) > 0.001) throw new Error('Phase timing must partition synchronous frame duration');
  }
  check(errors.length === 0, 'No page errors');
  return { checks: [...new Set(checks)], errors, ...result };
  };
  try {
    return await Promise.race([run(), new Promise((_, reject) => {
      deadline = setTimeout(() => {
        reject(new Error('Render audit journey exceeded 150 seconds'));
        void page.close().catch(() => {});
      }, 150000);
    })]);
  } finally { clearTimeout(deadline); }
}
